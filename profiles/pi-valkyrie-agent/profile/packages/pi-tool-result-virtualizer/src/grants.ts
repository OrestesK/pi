import { createHash, randomUUID } from "node:crypto";
import {
	chmod,
	mkdir,
	readFile,
	rename,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleepFor } from "node:timers/promises";

import { StoreWriteLock } from "./write-lock.ts";

export const RESULT_ANALYST_RUNTIME_NAME =
	"pi-tool-result-virtualizer.result-analyst";
export const DEFAULT_GRANT_COMMIT_WAIT_MS = 250;
export const DEFAULT_GRANT_POLL_INTERVAL_MS = 10;

export type GrantOperation = "outline" | "search" | "get";

export type GrantBudget = {
	calls: number;
	outputBytes: number;
};

export type PrepareGrantInput = {
	agentName: string;
	sourceIds: string[];
	operations: GrantOperation[];
	budget: GrantBudget;
	expiresAt: number;
};

export type PendingGrant = Readonly<{ pendingId: string }>;

export type GrantReservationRequest = {
	runId: string;
	agentName: string;
	operation: GrantOperation;
	sourceIds: string[];
	outputBytes: number;
};

type RegistryOptions = {
	now?: () => number;
	commitWaitMs?: number;
	pollIntervalMs?: number;
	sleep?: (milliseconds: number) => Promise<void>;
};

type PendingGrantRecord = {
	agentName: string;
	sourceIds: Set<string>;
	operations: Set<GrantOperation>;
	budget: GrantBudget;
	expiresAt: number;
};

type CommittedGrantRecord = {
	version: 1;
	agentName: string;
	sourceIds: string[];
	operations: GrantOperation[];
	expiresAt: number;
	remainingCalls: number;
	remainingOutputBytes: number;
};

const GRANT_UNAVAILABLE_MESSAGE = "Tool-result grant unavailable";

function unavailable(): Error {
	return new Error(GRANT_UNAVAILABLE_MESSAGE);
}

function positiveInteger(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 1)
		throw new Error(`${name} must be a positive integer`);
	return value;
}

function nonNegativeInteger(value: number, name: string): number {
	if (!Number.isSafeInteger(value) || value < 0)
		throw new Error(`${name} must be a non-negative integer`);
	return value;
}

function uniqueNonEmpty<T extends string>(values: T[], name: string): T[] {
	if (values.length === 0) throw new Error(`${name} must not be empty`);
	if (values.some((value) => value.trim().length === 0))
		throw new Error(`${name} must contain non-empty values`);
	if (new Set(values).size !== values.length)
		throw new Error(`${name} must contain unique values`);
	return values;
}

function errorCode(error: unknown): string | undefined {
	return error && typeof error === "object" && "code" in error
		? String(error.code)
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function grantOperation(value: unknown): value is GrantOperation {
	return value === "outline" || value === "search" || value === "get";
}

function parseCommittedGrant(text: string): CommittedGrantRecord | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!isRecord(value) || value.version !== 1) return undefined;
	if (value.agentName !== RESULT_ANALYST_RUNTIME_NAME) return undefined;
	if (
		!Array.isArray(value.sourceIds) ||
		value.sourceIds.length === 0 ||
		value.sourceIds.length > 10 ||
		!value.sourceIds.every(
			(sourceId): sourceId is string =>
				typeof sourceId === "string" && sourceId.length > 0,
		) ||
		new Set(value.sourceIds).size !== value.sourceIds.length
	)
		return undefined;
	if (
		!Array.isArray(value.operations) ||
		value.operations.length === 0 ||
		!value.operations.every(grantOperation) ||
		new Set(value.operations).size !== value.operations.length
	)
		return undefined;
	if (
		!Number.isSafeInteger(value.expiresAt) ||
		!Number.isSafeInteger(value.remainingCalls) ||
		Number(value.remainingCalls) < 0 ||
		!Number.isSafeInteger(value.remainingOutputBytes) ||
		Number(value.remainingOutputBytes) < 0
	)
		return undefined;
	return {
		version: 1,
		agentName: value.agentName,
		sourceIds: value.sourceIds,
		operations: value.operations,
		expiresAt: Number(value.expiresAt),
		remainingCalls: Number(value.remainingCalls),
		remainingOutputBytes: Number(value.remainingOutputBytes),
	};
}

function grantFileName(runId: string): string {
	return `${createHash("sha256").update(runId).digest("hex")}.json`;
}

async function readCommittedGrant(
	path: string,
): Promise<CommittedGrantRecord | undefined> {
	try {
		return parseCommittedGrant(await readFile(path, "utf8"));
	} catch (error) {
		if (errorCode(error) === "ENOENT") return undefined;
		throw error;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await readFile(path, "utf8");
		return true;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return false;
		throw error;
	}
}

async function writeCommittedGrant(
	grantDir: string,
	path: string,
	record: CommittedGrantRecord,
): Promise<void> {
	await mkdir(grantDir, { recursive: true, mode: 0o700 });
	await chmod(grantDir, 0o700);
	const temporaryPath = join(grantDir, `.${randomUUID()}.tmp`);
	try {
		await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, {
			flag: "wx",
			mode: 0o600,
		});
		await chmod(temporaryPath, 0o600);
		await rename(temporaryPath, path);
	} finally {
		await unlink(temporaryPath).catch((error: unknown) => {
			if (errorCode(error) !== "ENOENT") throw error;
		});
	}
}

export class RunBoundGrantRegistry {
	readonly #grantDir: string;
	readonly #writeLock: StoreWriteLock;
	readonly #now: () => number;
	readonly #commitWaitMs: number;
	readonly #pollIntervalMs: number;
	readonly #sleep: (milliseconds: number) => Promise<void>;
	readonly #pending = new Map<string, PendingGrantRecord>();

	constructor(root: string, options: RegistryOptions = {}) {
		this.#grantDir = join(root, "grants");
		this.#writeLock = new StoreWriteLock(this.#grantDir);
		this.#now = options.now ?? Date.now;
		this.#commitWaitMs = nonNegativeInteger(
			options.commitWaitMs ?? DEFAULT_GRANT_COMMIT_WAIT_MS,
			"commitWaitMs",
		);
		this.#pollIntervalMs = positiveInteger(
			options.pollIntervalMs ?? DEFAULT_GRANT_POLL_INTERVAL_MS,
			"pollIntervalMs",
		);
		this.#sleep = options.sleep ?? ((milliseconds) => sleepFor(milliseconds));
	}

	assertFeasible(input: PrepareGrantInput): void {
		this.#grantRecord(input);
	}

	prepare(input: PrepareGrantInput): PendingGrant {
		const record = this.#grantRecord(input);
		const pendingId = randomUUID();
		this.#pending.set(pendingId, record);
		return Object.freeze({ pendingId });
	}

	#grantRecord(input: PrepareGrantInput): PendingGrantRecord {
		if (input.agentName !== RESULT_ANALYST_RUNTIME_NAME)
			throw new Error("Unsupported grant agent");
		const sourceIds = uniqueNonEmpty(input.sourceIds, "sourceIds");
		if (sourceIds.length > 10)
			throw new Error("sourceIds may contain at most 10 values");
		const operations = uniqueNonEmpty(input.operations, "operations");
		const calls = positiveInteger(input.budget.calls, "budget.calls");
		const outputBytes = positiveInteger(
			input.budget.outputBytes,
			"budget.outputBytes",
		);
		if (
			!Number.isSafeInteger(input.expiresAt) ||
			input.expiresAt <= this.#now()
		)
			throw new Error("expiresAt must be a future integer timestamp");
		return {
			agentName: input.agentName,
			sourceIds: new Set(sourceIds),
			operations: new Set(operations),
			budget: { calls, outputBytes },
			expiresAt: input.expiresAt,
		};
	}

	async commit(pending: PendingGrant, runId: string): Promise<void> {
		const normalizedRunId = runId.trim();
		if (!normalizedRunId) throw new Error("runId must not be empty");
		const record = this.#pending.get(pending.pendingId);
		if (record === undefined || record.expiresAt <= this.#now()) {
			this.#pending.delete(pending.pendingId);
			throw new Error("Pending tool-result grant is unavailable");
		}
		this.#pending.delete(pending.pendingId);
		const path = join(this.#grantDir, grantFileName(normalizedRunId));
		await this.#writeLock.runExclusive(async () => {
			if (record.expiresAt <= this.#now())
				throw new Error("Pending tool-result grant is unavailable");
			if (await fileExists(path))
				throw new Error("A tool-result grant already exists for this run");
			await writeCommittedGrant(this.#grantDir, path, {
				version: 1,
				agentName: record.agentName,
				sourceIds: [...record.sourceIds],
				operations: [...record.operations],
				expiresAt: record.expiresAt,
				remainingCalls: record.budget.calls,
				remainingOutputBytes: record.budget.outputBytes,
			});
		});
	}

	abort(pending: PendingGrant): void {
		this.#pending.delete(pending.pendingId);
	}

	async reserve(request: GrantReservationRequest): Promise<void> {
		const runId = request.runId.trim();
		if (
			!runId ||
			request.sourceIds.length === 0 ||
			new Set(request.sourceIds).size !== request.sourceIds.length ||
			!Number.isSafeInteger(request.outputBytes) ||
			request.outputBytes < 1
		)
			throw unavailable();
		const path = join(this.#grantDir, grantFileName(runId));
		const deadline = this.#now() + this.#commitWaitMs;
		let grant: CommittedGrantRecord | undefined;
		try {
			grant = await readCommittedGrant(path);
			while (grant === undefined && this.#now() < deadline) {
				await this.#sleep(
					Math.min(this.#pollIntervalMs, deadline - this.#now()),
				);
				grant = await readCommittedGrant(path);
			}
			if (grant === undefined) throw unavailable();
			await this.#writeLock.runExclusive(async () => {
				const current = await readCommittedGrant(path);
				if (
					current === undefined ||
					current.expiresAt <= this.#now() ||
					request.agentName !== current.agentName ||
					!current.operations.includes(request.operation) ||
					request.sourceIds.some(
						(sourceId) => !current.sourceIds.includes(sourceId),
					) ||
					current.remainingCalls < 1 ||
					current.remainingOutputBytes < request.outputBytes
				)
					throw unavailable();
				await writeCommittedGrant(this.#grantDir, path, {
					...current,
					remainingCalls: current.remainingCalls - 1,
					remainingOutputBytes:
						current.remainingOutputBytes - request.outputBytes,
				});
			});
		} catch (error) {
			if (error instanceof Error && error.message === GRANT_UNAVAILABLE_MESSAGE)
				throw error;
			throw unavailable();
		}
	}
}
