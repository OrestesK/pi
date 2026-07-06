import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { writeAtomicJson } from "./atomic-json.ts";
import { withTeamLock } from "./team-lock.ts";

const LEDGER_SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

export type MessageAckAction = "accepted" | "rejected" | "blocked";

export interface MessageLedgerInboxRef {
	directory: string;
	name: string;
}

export interface AppendLedgerMessageInput {
	from: string;
	to: string;
	text: string;
	urgent?: boolean;
	metadata?: Record<string, unknown>;
}

export interface AckLedgerMessageInput {
	by: string;
	action: MessageAckAction;
	reason: string;
}

export interface MessageLedgerOptions {
	now?: () => number;
	id?: () => string;
}

export interface MessageLedgerRecord {
	id: string;
	runId: string;
	from: string;
	to: string;
	text: string;
	urgent: boolean;
	read: boolean;
	createdAt: string;
	presentedAt?: string;
	presentedCount?: number;
	acknowledgedAt?: string;
	acknowledgedBy?: string;
	ackAction?: MessageAckAction;
	ackReason?: string;
	metadata: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFoundError(error: unknown): error is NodeJS.ErrnoException {
	return typeof error === "object"
		&& error !== null
		&& "code" in error
		&& (error as NodeJS.ErrnoException).code === "ENOENT";
}

function nowIso(options: MessageLedgerOptions = {}): string {
	return new Date((options.now ?? Date.now)()).toISOString();
}

function runId(rootDir: string): string {
	return path.basename(path.resolve(rootDir));
}

function validateDirectory(directory: string): void {
	if (!LEDGER_SEGMENT_RE.test(directory) || directory === "." || directory === "..") {
		throw new Error(`Invalid message ledger directory: ${directory}`);
	}
}

function validateInboxName(name: string): void {
	if (!LEDGER_SEGMENT_RE.test(name) || name === "." || name === "..") {
		throw new Error(`Invalid message inbox name: ${name}`);
	}
}

function assertNoSymlinkComponents(root: string, resolved: string): void {
	try {
		if (fs.lstatSync(root).isSymbolicLink()) {
			throw new Error(`Resolved path is outside message ledger root: ${root}`);
		}
	} catch (error) {
		if (isNotFoundError(error)) return;
		throw error;
	}
	const relative = path.relative(root, resolved);
	if (!relative) return;
	let current = root;
	for (const part of relative.split(path.sep)) {
		current = path.join(current, part);
		try {
			if (fs.lstatSync(current).isSymbolicLink()) {
				throw new Error(`Resolved path is outside message ledger root: ${current}`);
			}
		} catch (error) {
			if (isNotFoundError(error)) return;
			throw error;
		}
	}
}

function resolveLedgerPath(rootDir: string, ...segments: string[]): string {
	for (const segment of segments) {
		if (segment === "" || segment === "." || segment === ".." || path.isAbsolute(segment) || segment.includes("/") || segment.includes("\\")) {
			throw new Error(`Resolved path is outside message ledger root: ${segment}`);
		}
	}
	const root = path.resolve(rootDir);
	const resolved = path.resolve(root, ...segments);
	if (resolved !== root && !resolved.startsWith(root + path.sep)) {
		throw new Error(`Resolved path is outside message ledger root: ${resolved}`);
	}
	assertNoSymlinkComponents(root, resolved);
	return resolved;
}

function inboxPath(rootDir: string, inbox: MessageLedgerInboxRef): string {
	validateDirectory(inbox.directory);
	validateInboxName(inbox.name);
	return resolveLedgerPath(rootDir, inbox.directory, `${inbox.name}.json`);
}

function inboxLockPath(rootDir: string, inbox: MessageLedgerInboxRef): string {
	return `${inboxPath(rootDir, inbox)}.lock`;
}

function isAckAction(value: unknown): value is MessageAckAction {
	return value === "accepted" || value === "rejected" || value === "blocked";
}

function coerceMessage(value: unknown): MessageLedgerRecord | null {
	if (!isRecord(value)) return null;
	if (typeof value.id !== "string") return null;
	if (typeof value.runId !== "string") return null;
	if (typeof value.from !== "string") return null;
	if (typeof value.to !== "string") return null;
	if (typeof value.text !== "string") return null;
	if (typeof value.createdAt !== "string") return null;
	const ackAction = isAckAction(value.ackAction) ? value.ackAction : undefined;
	const presentedCount = typeof value.presentedCount === "number" && Number.isFinite(value.presentedCount)
		? Math.max(0, Math.floor(value.presentedCount))
		: undefined;
	return {
		id: value.id,
		runId: value.runId,
		from: value.from,
		to: value.to,
		text: value.text,
		urgent: typeof value.urgent === "boolean" ? value.urgent : false,
		read: typeof value.read === "boolean" ? value.read : false,
		createdAt: value.createdAt,
		...(typeof value.presentedAt === "string" ? { presentedAt: value.presentedAt } : {}),
		...(presentedCount !== undefined ? { presentedCount } : {}),
		...(typeof value.acknowledgedAt === "string" ? { acknowledgedAt: value.acknowledgedAt } : {}),
		...(typeof value.acknowledgedBy === "string" ? { acknowledgedBy: value.acknowledgedBy } : {}),
		...(ackAction ? { ackAction } : {}),
		...(typeof value.ackReason === "string" ? { ackReason: value.ackReason } : {}),
		metadata: isRecord(value.metadata) ? { ...value.metadata } : {},
	};
}

function readInbox(filePath: string): MessageLedgerRecord[] {
	try {
		const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed.map(coerceMessage).filter((message): message is MessageLedgerRecord => message !== null);
	} catch (error: unknown) {
		if (isNotFoundError(error)) return [];
		throw error;
	}
}

function writeInbox(filePath: string, messages: MessageLedgerRecord[]): void {
	writeAtomicJson(filePath, messages);
}

export async function appendLedgerMessage(
	rootDir: string,
	inbox: MessageLedgerInboxRef,
	input: AppendLedgerMessageInput,
	options: MessageLedgerOptions = {},
): Promise<MessageLedgerRecord> {
	if (!input.from.trim()) throw new Error("Message from must not be empty");
	if (!input.to.trim()) throw new Error("Message to must not be empty");
	if (!input.text.trim()) throw new Error("Message text must not be empty");
	const filePath = inboxPath(rootDir, inbox);
	return withTeamLock(inboxLockPath(rootDir, inbox), async () => {
		const messages = readInbox(filePath);
		const message: MessageLedgerRecord = {
			id: (options.id ?? crypto.randomUUID)(),
			runId: runId(rootDir),
			from: input.from,
			to: input.to,
			text: input.text,
			urgent: input.urgent ?? false,
			read: false,
			createdAt: nowIso(options),
			metadata: input.metadata ? { ...input.metadata } : {},
		};
		messages.push(message);
		writeInbox(filePath, messages);
		return message;
	}, { label: `message-ledger:${inbox.directory}:${inbox.name}` });
}

export async function listLedgerMessages(rootDir: string, inbox: MessageLedgerInboxRef): Promise<MessageLedgerRecord[]> {
	return readInbox(inboxPath(rootDir, inbox));
}

export async function popUnreadLedgerMessages(rootDir: string, inbox: MessageLedgerInboxRef): Promise<MessageLedgerRecord[]> {
	const filePath = inboxPath(rootDir, inbox);
	return withTeamLock(inboxLockPath(rootDir, inbox), async () => {
		const messages = readInbox(filePath);
		const unread: MessageLedgerRecord[] = [];
		const updated = messages.map((message) => {
			if (message.read) return message;
			const readMessage = { ...message, read: true };
			unread.push(readMessage);
			return readMessage;
		});
		if (unread.length > 0) writeInbox(filePath, updated);
		return unread;
	}, { label: `message-ledger:${inbox.directory}:${inbox.name}` });
}

export async function markLedgerMessagesPresented(
	rootDir: string,
	inbox: MessageLedgerInboxRef,
	messageIds: string[],
	options: MessageLedgerOptions = {},
): Promise<MessageLedgerRecord[]> {
	const ids = new Set(messageIds.filter((id) => id.trim()));
	if (ids.size === 0) return [];
	const filePath = inboxPath(rootDir, inbox);
	return withTeamLock(inboxLockPath(rootDir, inbox), async () => {
		const presented: MessageLedgerRecord[] = [];
		const at = nowIso(options);
		const updated = readInbox(filePath).map((message) => {
			if (!ids.has(message.id)) return message;
			const next = {
				...message,
				presentedAt: at,
				presentedCount: (message.presentedCount ?? 0) + 1,
			};
			presented.push(next);
			return next;
		});
		if (presented.length > 0) writeInbox(filePath, updated);
		return presented;
	}, { label: `message-ledger:${inbox.directory}:${inbox.name}` });
}

export async function ackLedgerMessage(
	rootDir: string,
	inbox: MessageLedgerInboxRef,
	messageId: string,
	input: AckLedgerMessageInput,
	options: MessageLedgerOptions = {},
): Promise<MessageLedgerRecord> {
	if (!messageId.trim()) throw new Error("Message id must not be empty");
	if (!input.by.trim()) throw new Error("Message acknowledgement by must not be empty");
	if (!input.reason.trim()) throw new Error("Message acknowledgement reason must not be empty");
	if (!isAckAction(input.action)) throw new Error(`Invalid message acknowledgement action: ${input.action}`);
	const filePath = inboxPath(rootDir, inbox);
	return withTeamLock(inboxLockPath(rootDir, inbox), async () => {
		const messages = readInbox(filePath);
		let acknowledged: MessageLedgerRecord | undefined;
		const updated = messages.map((message) => {
			if (message.id !== messageId) return message;
			acknowledged = {
				...message,
				read: true,
				acknowledgedAt: nowIso(options),
				acknowledgedBy: input.by,
				ackAction: input.action,
				ackReason: input.reason,
			};
			return acknowledged;
		});
		if (!acknowledged) throw new Error(`Message not found: ${messageId}`);
		writeInbox(filePath, updated);
		return acknowledged;
	}, { label: `message-ledger:${inbox.directory}:${inbox.name}` });
}
