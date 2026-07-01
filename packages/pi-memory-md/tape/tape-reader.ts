import fs from "node:fs";
import path from "node:path";
import { StringDecoder } from "node:string_decoder";
import type {
	SessionEntry,
	SessionHeader,
} from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { toTimestamp } from "../utils.js";

const DEFAULT_CACHE_SIZE = 100;

interface FileStatCache<T> {
	mtimeMs: number;
	size: number;
	value: T;
}

class LRUCache<K, V> {
	private cache = new Map<K, V>();
	constructor(private maxSize: number = DEFAULT_CACHE_SIZE) {
		if (maxSize < 1) {
			throw new Error("maxSize must be at least 1");
		}
	}

	get(key: K): V | undefined {
		const value = this.cache.get(key);
		if (value !== undefined) {
			this.cache.delete(key);
			this.cache.set(key, value);
		}
		return value;
	}

	has(key: K): boolean {
		return this.cache.has(key);
	}

	set(key: K, value: V): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			const firstKey = this.cache.keys().next().value;
			if (firstKey !== undefined) {
				this.cache.delete(firstKey);
			}
		}
		this.cache.set(key, value);
	}

	delete(key: K): boolean {
		return this.cache.delete(key);
	}

	clear(): void {
		this.cache.clear();
	}
}

const sessionFilePathsCache = new LRUCache<
	string,
	{ mtimeMs: number; filePaths: string[] }
>();
const sessionFilePathCache = new LRUCache<
	string,
	{ sessionDirMtimeMs: number; filePath: string | null }
>();
const sessionHeaderCache = new LRUCache<
	string,
	FileStatCache<SessionHeader | null>
>();
const sessionParseCache = new LRUCache<
	string,
	FileStatCache<{ header: SessionHeader; entries: SessionEntry[] } | null>
>();

function getSessionsDir(): string {
	return path.join(getAgentDir(), "sessions");
}

function encodeSessionPath(cwd: string): string {
	return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function getSessionDir(cwd: string): string {
	return path.join(getSessionsDir(), encodeSessionPath(cwd));
}

function getDirectoryMtimeMs(dirPath: string): number | null {
	try {
		return fs.statSync(dirPath).mtimeMs;
	} catch {
		return null;
	}
}

function readFirstLine(filePath: string): string | null {
	const fd = fs.openSync(filePath, "r");
	const buffer = Buffer.allocUnsafe(4096);
	const chunks: Buffer[] = [];
	let totalLength = 0;

	try {
		while (true) {
			const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
			if (bytesRead === 0) break;

			const newlineIndex = buffer.subarray(0, bytesRead).indexOf(0x0a);
			const end = newlineIndex === -1 ? bytesRead : newlineIndex;
			if (end > 0) {
				const chunk = Buffer.from(buffer.subarray(0, end));
				chunks.push(chunk);
				totalLength += chunk.length;
			}
			if (newlineIndex !== -1) break;
		}
	} finally {
		fs.closeSync(fd);
	}

	if (totalLength === 0) return null;
	return Buffer.concat(chunks, totalLength).toString("utf-8");
}

function readSessionHeader(filePath: string): SessionHeader | null {
	try {
		const stat = fs.statSync(filePath);
		const cached = sessionHeaderCache.get(filePath);

		if (
			cached &&
			cached.mtimeMs === stat.mtimeMs &&
			cached.size === stat.size
		) {
			return cached.value;
		}

		const firstLine = readFirstLine(filePath);
		if (!firstLine) {
			sessionHeaderCache.set(filePath, {
				mtimeMs: stat.mtimeMs,
				size: stat.size,
				value: null,
			});
			return null;
		}

		const header = JSON.parse(firstLine) as SessionHeader;
		const value = header.type === "session" ? header : null;
		sessionHeaderCache.set(filePath, {
			mtimeMs: stat.mtimeMs,
			size: stat.size,
			value,
		});
		return value;
	} catch {
		sessionHeaderCache.delete(filePath);
		return null;
	}
}

export function getSessionFilePaths(cwd: string): string[] {
	const sessionDir = getSessionDir(cwd);
	const sessionDirMtimeMs = getDirectoryMtimeMs(sessionDir);
	if (sessionDirMtimeMs === null) {
		sessionFilePathsCache.delete(sessionDir);
		return [];
	}

	const cached = sessionFilePathsCache.get(sessionDir);
	if (cached && cached.mtimeMs === sessionDirMtimeMs) {
		return cached.filePaths;
	}

	const filePaths = fs
		.readdirSync(sessionDir)
		.filter((file) => file.endsWith(".jsonl"))
		.map((file) => path.join(sessionDir, file));

	sessionFilePathsCache.set(sessionDir, {
		mtimeMs: sessionDirMtimeMs,
		filePaths,
	});
	return filePaths;
}

export function getSessionFilePath(
	cwd: string,
	sessionId: string,
): string | null {
	const sessionDir = getSessionDir(cwd);
	const sessionDirMtimeMs = getDirectoryMtimeMs(sessionDir);
	if (sessionDirMtimeMs === null) {
		sessionFilePathCache.delete(`${sessionDir}::${sessionId}`);
		return null;
	}

	const cacheKey = `${sessionDir}::${sessionId}`;
	const cached = sessionFilePathCache.get(cacheKey);

	if (
		cached &&
		cached.sessionDirMtimeMs === sessionDirMtimeMs &&
		cached.filePath
	) {
		if (fs.existsSync(cached.filePath)) {
			const stat = fs.statSync(cached.filePath);
			const headerCached = sessionHeaderCache.get(cached.filePath);
			if (
				headerCached &&
				headerCached.mtimeMs === stat.mtimeMs &&
				headerCached.size === stat.size
			) {
				if (headerCached.value?.id === sessionId) {
					return cached.filePath;
				}
			}
		}
	}

	const filePaths = getSessionFilePaths(cwd);

	for (const fullPath of filePaths) {
		const header = readSessionHeader(fullPath);
		if (header?.id === sessionId) {
			sessionFilePathCache.set(cacheKey, {
				sessionDirMtimeMs,
				filePath: fullPath,
			});
			return fullPath;
		}
	}

	sessionFilePathCache.set(cacheKey, { sessionDirMtimeMs, filePath: null });
	return null;
}

export type ParseSessionFileOptions = {
	maxEntries?: number;
	since?: string;
};

function parseSessionLine(
	line: string,
	lineNumber: number,
	state: {
		header: SessionHeader | null;
		entries: SessionEntry[];
		maxEntries: number | null;
		sinceTimestamp: number | null;
		cursor: number;
		wrapped: boolean;
	},
): void {
	if (!line.trim()) return;

	if (lineNumber === 0) {
		const header = JSON.parse(line) as SessionHeader;
		state.header = header.type === "session" ? header : null;
		return;
	}

	if (!state.header) return;

	try {
		const entry = JSON.parse(line) as SessionEntry;
		if (
			state.sinceTimestamp !== null &&
			toTimestamp(entry.timestamp) <= state.sinceTimestamp
		) {
			return;
		}

		if (state.maxEntries !== null && state.entries.length >= state.maxEntries) {
			state.entries[state.cursor] = entry;
			state.cursor = (state.cursor + 1) % state.maxEntries;
			state.wrapped = true;
			return;
		}

		state.entries.push(entry);
	} catch {
		// Skip malformed lines
	}
}

function finalizeRollingEntries(state: {
	entries: SessionEntry[];
	cursor: number;
	wrapped: boolean;
}): SessionEntry[] {
	if (!state.wrapped) return state.entries;
	return [
		...state.entries.slice(state.cursor),
		...state.entries.slice(0, state.cursor),
	];
}

export function parseSessionFile(
	filePath: string,
	options: ParseSessionFileOptions = {},
): { header: SessionHeader; entries: SessionEntry[] } | null {
	const cacheKey = `${filePath}::${options.maxEntries ?? "all"}::${options.since ?? ""}`;

	try {
		const stat = fs.statSync(filePath);
		const cached = sessionParseCache.get(cacheKey);

		if (
			cached &&
			cached.mtimeMs === stat.mtimeMs &&
			cached.size === stat.size
		) {
			return cached.value;
		}

		const maxEntries =
			typeof options.maxEntries === "number" && options.maxEntries > 0
				? Math.floor(options.maxEntries)
				: null;
		const sinceTimestamp = options.since ? toTimestamp(options.since) : null;
		const state = {
			header: null as SessionHeader | null,
			entries: [] as SessionEntry[],
			maxEntries,
			sinceTimestamp,
			cursor: 0,
			wrapped: false,
		};

		const fd = fs.openSync(filePath, "r");
		const buffer = Buffer.allocUnsafe(1024 * 1024);
		const decoder = new StringDecoder("utf-8");
		let pending = "";
		let lineNumber = 0;

		try {
			while (true) {
				const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
				if (bytesRead === 0) break;

				pending += decoder.write(buffer.subarray(0, bytesRead));
				while (true) {
					const newlineIndex = pending.indexOf("\n");
					if (newlineIndex === -1) break;

					const line = pending.slice(0, newlineIndex);
					pending = pending.slice(newlineIndex + 1);
					parseSessionLine(line, lineNumber, state);
					lineNumber++;
				}
			}

			pending += decoder.end();
			if (pending.length > 0) {
				parseSessionLine(pending, lineNumber, state);
			}
		} finally {
			fs.closeSync(fd);
		}

		if (!state.header) {
			sessionParseCache.set(cacheKey, {
				mtimeMs: stat.mtimeMs,
				size: stat.size,
				value: null,
			});
			return null;
		}

		const parsed = {
			header: state.header,
			entries: finalizeRollingEntries(state),
		};
		sessionParseCache.set(cacheKey, {
			mtimeMs: stat.mtimeMs,
			size: stat.size,
			value: parsed,
		});
		return parsed;
	} catch {
		sessionHeaderCache.delete(filePath);
		sessionParseCache.delete(cacheKey);
		return null;
	}
}

export function getEntriesAfterTimestamp(
	entries: SessionEntry[],
	timestamp: string,
): SessionEntry[] {
	const targetTime = toTimestamp(timestamp);
	return entries.filter((entry) => toTimestamp(entry.timestamp) > targetTime);
}

export function getEntriesByIds(
	entries: SessionEntry[],
	ids: string[],
): SessionEntry[] {
	const idSet = new Set(ids);
	return entries.filter((entry) => idSet.has(entry.id));
}

export interface SessionContextEntry {
	id: string;
	type: string;
	timestamp: string;
	message?: {
		role: string;
		content: string | Array<{ type: string; text?: string }>;
	};
	thinkingLevel?: string;
	provider?: string;
	modelId?: string;
	summary?: string;
	customType?: string;
	data?: unknown;
}

export function formatEntryAsContext(
	entry: SessionEntry,
): SessionContextEntry | null {
	const commonFields = {
		id: entry.id,
		type: entry.type,
		timestamp: entry.timestamp,
	};

	switch (entry.type) {
		case "message": {
			const messageEntry = entry as {
				message: { role: string; content?: unknown };
			};
			return {
				...commonFields,
				message: {
					role: messageEntry.message.role,
					content: messageEntry.message.content as
						| string
						| Array<{ type: string; text?: string }>,
				},
			};
		}
		case "thinking_level_change":
			return { ...commonFields, thinkingLevel: entry.thinkingLevel };
		case "model_change":
			return {
				...commonFields,
				provider: entry.provider,
				modelId: entry.modelId,
			};
		case "compaction":
			return { ...commonFields, summary: entry.summary };
		case "custom": {
			const customEntry = entry as { customType: string; data?: unknown };
			return {
				...commonFields,
				customType: customEntry.customType,
				data: customEntry.data,
			};
		}
		default:
			return null;
	}
}
