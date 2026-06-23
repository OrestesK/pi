import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson } from "./atomic-json.ts";
import { appendTeamMessage } from "./team-mailbox.ts";
import { withTeamLock } from "./team-lock.ts";
import { resolveTeamRunPath } from "./team-store.ts";
import type { TeamDecisionAction, TeamDecisionRecord } from "./team-types.ts";

export interface RecordTeamDecisionInput {
	from: string;
	action: TeamDecisionAction;
	reason: string;
	to?: string;
	message?: string;
	urgent?: boolean;
}

export interface TeamDecisionOptions {
	now?: () => number;
	id?: () => string;
	messageId?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isDecisionAction(value: unknown): value is TeamDecisionAction {
	return value === "nothing" || value === "steer" || value === "discuss";
}

function runId(teamRunDir: string): string {
	return path.basename(path.resolve(teamRunDir));
}

function decisionsPath(teamRunDir: string): string {
	return resolveTeamRunPath(teamRunDir, "decisions.json");
}

function decisionsLockPath(teamRunDir: string): string {
	return `${decisionsPath(teamRunDir)}.lock`;
}

function coerceDecision(value: unknown): TeamDecisionRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string") return null;
	if (typeof value.runId !== "string") return null;
	if (typeof value.from !== "string") return null;
	if (!isDecisionAction(value.action)) return null;
	if (typeof value.reason !== "string") return null;
	if (typeof value.createdAt !== "string") return null;
	return {
		id: value.id,
		runId: value.runId,
		from: value.from,
		action: value.action,
		reason: value.reason,
		urgent: typeof value.urgent === "boolean" ? value.urgent : false,
		createdAt: value.createdAt,
		...(typeof value.to === "string" ? { to: value.to } : {}),
		...(typeof value.message === "string" ? { message: value.message } : {}),
		...(typeof value.messageId === "string" ? { messageId: value.messageId } : {}),
	};
}

function readDecisions(filePath: string): TeamDecisionRecord[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map(coerceDecision).filter((decision): decision is TeamDecisionRecord => decision !== null);
	} catch (error: unknown) {
		if (typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

function writeDecisions(filePath: string, decisions: TeamDecisionRecord[]): void {
	writeAtomicJson(filePath, decisions);
}

function normalizeText(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

const MAILBOX_NAME_RE = /^[A-Za-z0-9_.-]+$/;

function validateDecisionTarget(name: string): void {
	if (!MAILBOX_NAME_RE.test(name) || name === "." || name === "..") throw new Error(`Invalid team mailbox name: ${name}`);
}

function validateDecisionInput(input: RecordTeamDecisionInput): void {
	if (!normalizeText(input.from)) throw new Error("Team decision from must not be empty");
	if (!isDecisionAction(input.action)) throw new Error(`Invalid team decision action: ${String(input.action)}`);
	if (!normalizeText(input.reason)) throw new Error("Team decision reason must not be empty");
	if (input.action === "nothing") {
		if (normalizeText(input.to) || normalizeText(input.message)) throw new Error("nothing decision must not include to or message");
		return;
	}
	const to = normalizeText(input.to);
	if (!to || !normalizeText(input.message)) throw new Error(`${input.action} decision requires to and message`);
	validateDecisionTarget(to);
}

export async function listTeamDecisions(teamRunDir: string): Promise<TeamDecisionRecord[]> {
	return readDecisions(decisionsPath(teamRunDir));
}

export async function recordTeamDecision(
	teamRunDir: string,
	input: RecordTeamDecisionInput,
	options: TeamDecisionOptions = {},
): Promise<TeamDecisionRecord> {
	validateDecisionInput(input);
	const timestamp = new Date((options.now ?? Date.now)()).toISOString();
	const messageId = input.action === "nothing" ? undefined : (options.messageId ?? crypto.randomUUID)();
	const decision: TeamDecisionRecord = {
		id: (options.id ?? crypto.randomUUID)(),
		runId: runId(teamRunDir),
		from: normalizeText(input.from) ?? input.from,
		action: input.action,
		reason: normalizeText(input.reason) ?? input.reason,
		urgent: input.urgent ?? false,
		createdAt: timestamp,
		...(input.action === "nothing" ? {} : {
			to: normalizeText(input.to),
			message: normalizeText(input.message),
			messageId,
		}),
	};
	const recorded = await withTeamLock(decisionsLockPath(teamRunDir), async () => {
		const decisions = readDecisions(decisionsPath(teamRunDir));
		decisions.push(decision);
		writeDecisions(decisionsPath(teamRunDir), decisions);
		return decision;
	}, { label: "team-decisions" });
	if (input.action !== "nothing") {
		await appendTeamMessage(teamRunDir, {
			from: recorded.from,
			to: recorded.to ?? "",
			text: recorded.message ?? "",
			urgent: recorded.urgent,
		}, { id: () => recorded.messageId ?? crypto.randomUUID(), now: options.now });
	}
	return recorded;
}
