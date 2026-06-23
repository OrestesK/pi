import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson } from "./atomic-json.ts";
import { withTeamLock } from "./team-lock.ts";
import type { TeamTaskOwner, TeamTaskRecord, TeamTaskStatus } from "./team-types.ts";

const TASK_ID_RE = /^[A-Za-z0-9_-]+$/;
const TERMINAL_STATUSES = new Set<TeamTaskStatus>(["completed", "failed", "cancelled"]);

export interface TeamClockOptions {
	now?: () => number;
}

export interface CreateTeamTaskInput {
	id?: string;
	subject: string;
	description: string;
	metadata?: Record<string, unknown>;
}

export interface ClaimTeamTaskOptions extends TeamClockOptions {
	leaseMs: number;
}

export interface CompleteTeamTaskOptions extends TeamClockOptions {
	artifactRefs?: string[];
	metadata?: Record<string, unknown>;
}

export interface FailTeamTaskOptions extends TeamClockOptions {
	reason: string;
	metadata?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function nowIso(options: TeamClockOptions = {}): string {
	return new Date((options.now ?? Date.now)()).toISOString();
}

function nowMs(options: TeamClockOptions = {}): number {
	return (options.now ?? Date.now)();
}

function teamRunId(teamRunDir: string): string {
	return path.basename(path.resolve(teamRunDir));
}

function validateSegment(segment: string): void {
	if (segment === "" || segment === "." || segment === ".." || path.isAbsolute(segment) || segment.includes("/") || segment.includes("\\")) {
		throw new Error(`Resolved path is outside team run dir: ${segment}`);
	}
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function assertNoSymlinkComponents(root: string, resolved: string): void {
	try {
		if (fs.lstatSync(root).isSymbolicLink()) throw new Error(`Resolved path is outside team run dir: ${root}`);
	} catch (error: unknown) {
		if (isNotFoundError(error)) return;
		throw error;
	}
	const relative = path.relative(root, resolved);
	if (!relative) return;
	let current = root;
	for (const part of relative.split(path.sep)) {
		current = path.join(current, part);
		try {
			if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Resolved path is outside team run dir: ${current}`);
		} catch (error: unknown) {
			if (isNotFoundError(error)) return;
			throw error;
		}
	}
}

export function resolveTeamRunPath(teamRunDir: string, ...segments: string[]): string {
	for (const segment of segments) validateSegment(segment);
	const root = path.resolve(teamRunDir);
	const resolved = path.resolve(root, ...segments);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
		throw new Error(`Resolved path is outside team run dir: ${resolved}`);
	}
	assertNoSymlinkComponents(root, resolved);
	return resolved;
}

function tasksDir(teamRunDir: string): string {
	return resolveTeamRunPath(teamRunDir, "tasks");
}

function taskPath(teamRunDir: string, taskId: string): string {
	validateTaskId(taskId);
	return resolveTeamRunPath(teamRunDir, "tasks", `${taskId}.json`);
}

function taskLockPath(teamRunDir: string, taskId: string): string {
	return `${taskPath(teamRunDir, taskId)}.lock`;
}

function validateTaskId(taskId: string): void {
	if (!TASK_ID_RE.test(taskId)) throw new Error(`Invalid team task id: ${taskId}`);
}

function toStringArray(value: unknown): string[] {
	return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function coerceOwner(value: unknown): TeamTaskOwner | undefined {
	if (!isRecord(value)) return undefined;
	if (typeof value.agent !== "string") return undefined;
	if (typeof value.childIndex !== "number" || !Number.isInteger(value.childIndex)) return undefined;
	return {
		agent: value.agent,
		childIndex: value.childIndex,
		...(typeof value.sessionId === "string" ? { sessionId: value.sessionId } : {}),
		...(typeof value.intercomTarget === "string" ? { intercomTarget: value.intercomTarget } : {}),
	};
}

function coerceTask(value: unknown): TeamTaskRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string") return null;
	if (typeof value.runId !== "string") return null;
	if (typeof value.subject !== "string") return null;
	if (typeof value.description !== "string") return null;
	if (!isTeamTaskStatus(value.status)) return null;
	const owner = coerceOwner(value.owner);
	const lease = coerceLease(value.lease);
	return {
		id: value.id,
		runId: value.runId,
		subject: value.subject,
		description: value.description,
		status: value.status,
		...(owner ? { owner } : {}),
		blockedBy: toStringArray(value.blockedBy),
		blocks: toStringArray(value.blocks),
		...(lease ? { lease } : {}),
		attempts: typeof value.attempts === "number" && Number.isInteger(value.attempts) ? value.attempts : 0,
		artifactRefs: toStringArray(value.artifactRefs),
		metadata: isRecord(value.metadata) ? value.metadata : {},
		createdAt: typeof value.createdAt === "string" ? value.createdAt : nowIso(),
		updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : nowIso(),
	};
}

function coerceLease(value: unknown): TeamTaskRecord["lease"] {
	if (!isRecord(value)) return undefined;
	if (typeof value.acquiredAt !== "string") return undefined;
	if (typeof value.expiresAt !== "string") return undefined;
	return {
		acquiredAt: value.acquiredAt,
		expiresAt: value.expiresAt,
		...(typeof value.heartbeatAt === "string" ? { heartbeatAt: value.heartbeatAt } : {}),
	};
}

function isTeamTaskStatus(value: unknown): value is TeamTaskStatus {
	return value === "pending" || value === "in_progress" || value === "blocked" || value === "completed" || value === "failed" || value === "cancelled";
}

function readTaskFile(filePath: string): TeamTaskRecord | null {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		return coerceTask(parsed);
	} catch (error: unknown) {
		if (isNotFoundError(error)) return null;
		throw error;
	}
}

function writeTaskFile(filePath: string, task: TeamTaskRecord): void {
	writeAtomicJson(filePath, task);
}

function ownerLabel(owner: TeamTaskOwner): string {
	return `${owner.agent}#${owner.childIndex}`;
}

function sameOwner(a: TeamTaskOwner | undefined, b: TeamTaskOwner): boolean {
	if (!a) return false;
	return a.agent === b.agent && a.childIndex === b.childIndex && (a.sessionId ?? "") === (b.sessionId ?? "");
}

function ensureOwnedBy(task: TeamTaskRecord, owner: TeamTaskOwner): void {
	if (!sameOwner(task.owner, owner)) {
		const current = task.owner ? ownerLabel(task.owner) : "no owner";
		throw new Error(`Task ${task.id} is ${current}, not owned by ${ownerLabel(owner)}`);
	}
}

function ensureActiveOwnerLease(task: TeamTaskRecord, owner: TeamTaskOwner, atMs: number): void {
	ensureOwnedBy(task, owner);
	if (isLeaseExpired(task, atMs)) throw new Error(`Task ${task.id} lease expired for ${ownerLabel(owner)}`);
}

function uniq(values: string[]): string[] {
	return Array.from(new Set(values));
}

function leaseExpiresAt(now: number, leaseMs: number): string {
	return new Date(now + leaseMs).toISOString();
}

function isLeaseExpired(task: TeamTaskRecord, now: number): boolean {
	if (!task.lease) return true;
	const expiresAt = Date.parse(task.lease.expiresAt);
	return !Number.isFinite(expiresAt) || expiresAt <= now;
}

async function withTaskLock<T>(teamRunDir: string, taskId: string, fn: () => Promise<T>): Promise<T> {
	return withTeamLock(taskLockPath(teamRunDir, taskId), fn, { label: `team-task:${taskId}` });
}

async function withTwoTaskLocks<T>(teamRunDir: string, taskA: string, taskB: string, fn: () => Promise<T>): Promise<T> {
	const ordered = [taskA, taskB].sort();
	if (ordered[0] === ordered[1]) return withTaskLock(teamRunDir, ordered[0], fn);
	return withTaskLock(teamRunDir, ordered[0], () => withTaskLock(teamRunDir, ordered[1], fn));
}

export async function createTask(teamRunDir: string, input: CreateTeamTaskInput, options: TeamClockOptions = {}): Promise<TeamTaskRecord> {
	const id = input.id ?? crypto.randomUUID();
	validateTaskId(id);
	if (!input.subject.trim()) throw new Error("Team task subject must not be empty");
	if (!input.description.trim()) throw new Error("Team task description must not be empty");
	const filePath = taskPath(teamRunDir, id);
	return withTaskLock(teamRunDir, id, async () => {
		if (fs.existsSync(filePath)) throw new Error(`Team task already exists: ${id}`);
		const timestamp = nowIso(options);
		const task: TeamTaskRecord = {
			id,
			runId: teamRunId(teamRunDir),
			subject: input.subject,
			description: input.description,
			status: "pending",
			blockedBy: [],
			blocks: [],
			attempts: 0,
			artifactRefs: [],
			metadata: input.metadata ?? {},
			createdAt: timestamp,
			updatedAt: timestamp,
		};
		writeTaskFile(filePath, task);
		return task;
	});
}

export async function getTask(teamRunDir: string, taskId: string): Promise<TeamTaskRecord | null> {
	return readTaskFile(taskPath(teamRunDir, taskId));
}

export async function listTasks(teamRunDir: string): Promise<TeamTaskRecord[]> {
	let entries: string[];
	try {
		entries = fs.readdirSync(tasksDir(teamRunDir));
	} catch (error: unknown) {
		if (isNotFoundError(error)) return [];
		throw error;
	}
	const tasks = entries
		.filter((entry) => entry.endsWith(".json"))
		.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
		.map((entry) => readTaskFile(resolveTeamRunPath(teamRunDir, "tasks", entry)))
		.filter((task): task is TeamTaskRecord => task !== null);
	return tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function addTaskDependency(teamRunDir: string, taskId: string, dependencyId: string): Promise<{ task: TeamTaskRecord; dependency: TeamTaskRecord }> {
	if (taskId === dependencyId) throw new Error("Team task cannot depend on itself");
	return withTwoTaskLocks(teamRunDir, taskId, dependencyId, async () => {
		const task = await getTask(teamRunDir, taskId);
		const dependency = await getTask(teamRunDir, dependencyId);
		if (!task) throw new Error(`Team task not found: ${taskId}`);
		if (!dependency) throw new Error(`Dependency team task not found: ${dependencyId}`);
		const timestamp = nowIso();
		const nextTask = { ...task, blockedBy: uniq([...task.blockedBy, dependencyId]), updatedAt: timestamp };
		const nextDependency = { ...dependency, blocks: uniq([...dependency.blocks, taskId]), updatedAt: timestamp };
		writeTaskFile(taskPath(teamRunDir, taskId), nextTask);
		writeTaskFile(taskPath(teamRunDir, dependencyId), nextDependency);
		return { task: nextTask, dependency: nextDependency };
	});
}

export async function removeTaskDependency(teamRunDir: string, taskId: string, dependencyId: string): Promise<{ task: TeamTaskRecord; dependency: TeamTaskRecord }> {
	return withTwoTaskLocks(teamRunDir, taskId, dependencyId, async () => {
		const task = await getTask(teamRunDir, taskId);
		const dependency = await getTask(teamRunDir, dependencyId);
		if (!task) throw new Error(`Team task not found: ${taskId}`);
		if (!dependency) throw new Error(`Dependency team task not found: ${dependencyId}`);
		const timestamp = nowIso();
		const nextTask = { ...task, blockedBy: task.blockedBy.filter((id) => id !== dependencyId), updatedAt: timestamp };
		const nextDependency = { ...dependency, blocks: dependency.blocks.filter((id) => id !== taskId), updatedAt: timestamp };
		writeTaskFile(taskPath(teamRunDir, taskId), nextTask);
		writeTaskFile(taskPath(teamRunDir, dependencyId), nextDependency);
		return { task: nextTask, dependency: nextDependency };
	});
}

export async function isTaskBlocked(teamRunDir: string, task: TeamTaskRecord): Promise<boolean> {
	for (const dependencyId of task.blockedBy) {
		const dependency = await getTask(teamRunDir, dependencyId);
		if (!dependency || dependency.status !== "completed") return true;
	}
	return false;
}

async function tryClaimTask(teamRunDir: string, taskId: string, owner: TeamTaskOwner, options: ClaimTeamTaskOptions): Promise<TeamTaskRecord | null> {
	return withTaskLock(teamRunDir, taskId, async () => {
		const task = await getTask(teamRunDir, taskId);
		if (!task) return null;
		if (TERMINAL_STATUSES.has(task.status)) return null;
		if (await isTaskBlocked(teamRunDir, task)) return null;
		const now = nowMs(options);
		if (task.owner && !isLeaseExpired(task, now)) return null;
		const timestamp = new Date(now).toISOString();
		const claimed: TeamTaskRecord = {
			...task,
			status: "in_progress",
			owner,
			lease: {
				acquiredAt: timestamp,
				expiresAt: leaseExpiresAt(now, options.leaseMs),
				heartbeatAt: timestamp,
			},
			attempts: task.attempts + 1,
			updatedAt: timestamp,
		};
		writeTaskFile(taskPath(teamRunDir, taskId), claimed);
		return claimed;
	});
}

export async function claimNextTask(teamRunDir: string, owner: TeamTaskOwner, options: ClaimTeamTaskOptions): Promise<TeamTaskRecord | null> {
	if (!Number.isFinite(options.leaseMs) || options.leaseMs <= 0) throw new Error("leaseMs must be positive");
	for (const task of await listTasks(teamRunDir)) {
		const claimed = await tryClaimTask(teamRunDir, task.id, owner, options);
		if (claimed) return claimed;
	}
	return null;
}

export async function heartbeatTask(teamRunDir: string, taskId: string, owner: TeamTaskOwner, options: ClaimTeamTaskOptions): Promise<TeamTaskRecord> {
	if (!Number.isFinite(options.leaseMs) || options.leaseMs <= 0) throw new Error("leaseMs must be positive");
	return withTaskLock(teamRunDir, taskId, async () => {
		const task = await getTask(teamRunDir, taskId);
		if (!task) throw new Error(`Team task not found: ${taskId}`);
		const now = nowMs(options);
		ensureActiveOwnerLease(task, owner, now);
		const timestamp = new Date(now).toISOString();
		const next: TeamTaskRecord = {
			...task,
			lease: {
				acquiredAt: task.lease?.acquiredAt ?? timestamp,
				expiresAt: leaseExpiresAt(now, options.leaseMs),
				heartbeatAt: timestamp,
			},
			updatedAt: timestamp,
		};
		writeTaskFile(taskPath(teamRunDir, taskId), next);
		return next;
	});
}

export async function completeTask(teamRunDir: string, taskId: string, owner: TeamTaskOwner, options: CompleteTeamTaskOptions = {}): Promise<TeamTaskRecord> {
	return withTaskLock(teamRunDir, taskId, async () => {
		const task = await getTask(teamRunDir, taskId);
		if (!task) throw new Error(`Team task not found: ${taskId}`);
		ensureActiveOwnerLease(task, owner, nowMs(options));
		const timestamp = nowIso(options);
		const next: TeamTaskRecord = {
			...task,
			status: "completed",
			lease: undefined,
			artifactRefs: options.artifactRefs ?? task.artifactRefs,
			metadata: { ...task.metadata, ...(options.metadata ?? {}), completedAt: timestamp },
			updatedAt: timestamp,
		};
		writeTaskFile(taskPath(teamRunDir, taskId), next);
		return next;
	});
}

export async function failTask(teamRunDir: string, taskId: string, owner: TeamTaskOwner, options: FailTeamTaskOptions): Promise<TeamTaskRecord> {
	return withTaskLock(teamRunDir, taskId, async () => {
		const task = await getTask(teamRunDir, taskId);
		if (!task) throw new Error(`Team task not found: ${taskId}`);
		ensureActiveOwnerLease(task, owner, nowMs(options));
		const timestamp = nowIso(options);
		const next: TeamTaskRecord = {
			...task,
			status: "failed",
			lease: undefined,
			metadata: { ...task.metadata, ...(options.metadata ?? {}), failureReason: options.reason, failedAt: timestamp },
			updatedAt: timestamp,
		};
		writeTaskFile(taskPath(teamRunDir, taskId), next);
		return next;
	});
}
