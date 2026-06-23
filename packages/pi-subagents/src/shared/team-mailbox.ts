import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson } from "./atomic-json.ts";
import { withTeamLock } from "./team-lock.ts";
import { resolveTeamRunPath } from "./team-store.ts";
import type { TeamMessageAckAction, TeamMessageRecord } from "./team-types.ts";

const MAILBOX_NAME_RE = /^[A-Za-z0-9_.-]+$/;

export interface AppendTeamMessageInput {
	from: string;
	to: string;
	text: string;
	urgent?: boolean;
}

export interface AckTeamMessageInput {
	by: string;
	action: TeamMessageAckAction;
	reason: string;
}

export interface TeamMailboxOptions {
	now?: () => number;
	id?: () => string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function runId(teamRunDir: string): string {
	return path.basename(path.resolve(teamRunDir));
}

function validateMailboxName(name: string): void {
	if (!MAILBOX_NAME_RE.test(name) || name === "." || name === "..") throw new Error(`Invalid team mailbox name: ${name}`);
}

function inboxPath(teamRunDir: string, agentName: string): string {
	validateMailboxName(agentName);
	return resolveTeamRunPath(teamRunDir, "mailboxes", `${agentName}.json`);
}

function inboxLockPath(teamRunDir: string, agentName: string): string {
	return `${inboxPath(teamRunDir, agentName)}.lock`;
}

function isAckAction(value: unknown): value is TeamMessageAckAction {
	return value === "accepted" || value === "rejected" || value === "blocked";
}

function coerceMessage(value: unknown): TeamMessageRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string") return null;
	if (typeof value.runId !== "string") return null;
	if (typeof value.from !== "string") return null;
	if (typeof value.to !== "string") return null;
	if (typeof value.text !== "string") return null;
	if (typeof value.createdAt !== "string") return null;
	const ackAction = isAckAction(value.ackAction) ? value.ackAction : undefined;
	return {
		id: value.id,
		runId: value.runId,
		from: value.from,
		to: value.to,
		text: value.text,
		urgent: typeof value.urgent === "boolean" ? value.urgent : false,
		read: typeof value.read === "boolean" ? value.read : false,
		createdAt: value.createdAt,
		...(typeof value.acknowledgedAt === "string" ? { acknowledgedAt: value.acknowledgedAt } : {}),
		...(typeof value.acknowledgedBy === "string" ? { acknowledgedBy: value.acknowledgedBy } : {}),
		...(ackAction ? { ackAction } : {}),
		...(typeof value.ackReason === "string" ? { ackReason: value.ackReason } : {}),
	};
}

function readInbox(filePath: string): TeamMessageRecord[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map(coerceMessage).filter((message): message is TeamMessageRecord => message !== null);
	} catch (error: unknown) {
		if (typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
}

function writeInbox(filePath: string, messages: TeamMessageRecord[]): void {
	writeAtomicJson(filePath, messages);
}

export async function appendTeamMessage(teamRunDir: string, input: AppendTeamMessageInput, options: TeamMailboxOptions = {}): Promise<TeamMessageRecord> {
	if (!input.from.trim()) throw new Error("Team message from must not be empty");
	if (!input.to.trim()) throw new Error("Team message to must not be empty");
	if (!input.text.trim()) throw new Error("Team message text must not be empty");
	const filePath = inboxPath(teamRunDir, input.to);
	return withTeamLock(inboxLockPath(teamRunDir, input.to), async () => {
		const messages = readInbox(filePath);
		const message: TeamMessageRecord = {
			id: (options.id ?? crypto.randomUUID)(),
			runId: runId(teamRunDir),
			from: input.from,
			to: input.to,
			text: input.text,
			urgent: input.urgent ?? false,
			read: false,
			createdAt: new Date((options.now ?? Date.now)()).toISOString(),
		};
		messages.push(message);
		writeInbox(filePath, messages);
		return message;
	}, { label: `team-mailbox:${input.to}` });
}

export async function listTeamMessages(teamRunDir: string, agentName: string): Promise<TeamMessageRecord[]> {
	return readInbox(inboxPath(teamRunDir, agentName));
}

export async function popUnreadTeamMessages(teamRunDir: string, agentName: string): Promise<TeamMessageRecord[]> {
	const filePath = inboxPath(teamRunDir, agentName);
	return withTeamLock(inboxLockPath(teamRunDir, agentName), async () => {
		const messages = readInbox(filePath);
		const unread: TeamMessageRecord[] = [];
		const updated = messages.map((message) => {
			if (message.read) return message;
			const readMessage = { ...message, read: true };
			unread.push(readMessage);
			return readMessage;
		});
		if (unread.length > 0) writeInbox(filePath, updated);
		return unread;
	}, { label: `team-mailbox:${agentName}` });
}

export async function ackTeamMessage(
	teamRunDir: string,
	agentName: string,
	messageId: string,
	input: AckTeamMessageInput,
	options: TeamMailboxOptions = {},
): Promise<TeamMessageRecord> {
	if (!messageId.trim()) throw new Error("Team message id must not be empty");
	if (!input.by.trim()) throw new Error("Team message acknowledgement by must not be empty");
	if (!input.reason.trim()) throw new Error("Team message acknowledgement reason must not be empty");
	if (!isAckAction(input.action)) throw new Error(`Invalid team message acknowledgement action: ${input.action}`);
	const filePath = inboxPath(teamRunDir, agentName);
	return withTeamLock(inboxLockPath(teamRunDir, agentName), async () => {
		const messages = readInbox(filePath);
		let acknowledged: TeamMessageRecord | undefined;
		const updated = messages.map((message) => {
			if (message.id !== messageId) return message;
			acknowledged = {
				...message,
				read: true,
				acknowledgedAt: new Date((options.now ?? Date.now)()).toISOString(),
				acknowledgedBy: input.by,
				ackAction: input.action,
				ackReason: input.reason,
			};
			return acknowledged;
		});
		if (!acknowledged) throw new Error(`Team message not found: ${messageId}`);
		writeInbox(filePath, updated);
		return acknowledged;
	}, { label: `team-mailbox:${agentName}` });
}
