import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import type {
	CaptureStatus,
	SearchMatch,
	StoreAccessContext,
	StoredSourceMetadata,
} from "./store.ts";
import type { ScopeFailure } from "./provenance.ts";

export type CatalogIndexRead = {
	entries: StoredSourceMetadata[];
	indexLineCount: number;
	invalidIndexLineCount: number;
};

type StoreCatalogOptions = {
	root: string;
	sourcesDir: string;
	detailsDir: string;
	indexPath: string;
	recover: () => Promise<void>;
};

export function splitLinesWithEndings(text: string): string[] {
	const matches = text.match(/[^\n]*(?:\n|$)/g) ?? [];
	if (matches.at(-1) === "") matches.pop();
	return matches;
}

export function lineWithoutEnding(line: string): string {
	return line.endsWith("\n") ? line.slice(0, -1) : line;
}

export function countLines(text: string): number {
	return splitLinesWithEndings(text).length;
}

function isWithinPath(filePath: string, dir: string): boolean {
	const pathRelativeToDir = relative(dir, filePath);
	return (
		pathRelativeToDir === "" ||
		(!pathRelativeToDir.startsWith("..") && !isAbsolute(pathRelativeToDir))
	);
}

function managedStorePath(
	root: string,
	directory: string,
	filePath: string,
): string | undefined {
	const resolvedPath = resolve(filePath);
	const resolvedDirectory = resolve(root, directory);
	return isWithinPath(resolvedPath, resolvedDirectory)
		? resolvedPath
		: undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
	return (
		value === "details.fullOutputPath" ||
		value === "read.input.path" ||
		value === "event.content"
	);
}

function isScopeFailure(value: unknown): value is ScopeFailure {
	return value === "cwd_unavailable" || value === "scope_key_unavailable";
}

function finiteNumberField(
	record: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function stringField(
	record: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

type StoredProvenanceFields = Pick<
	StoredSourceMetadata,
	| "metadataVersion"
	| "scope"
	| "classification"
	| "projectId"
	| "scopeFailure"
	| "sessionId"
	| "subagentRunId"
	| "agentName"
>;

function storedProvenanceFields(
	record: Record<string, unknown>,
): StoredProvenanceFields | undefined {
	if (record.metadataVersion !== 2) {
		return {
			metadataVersion: 1,
			scope: "legacy",
			classification: "legacy-unclassified",
		};
	}
	if (record.scope !== "project" && record.scope !== "unscoped")
		return undefined;
	if (record.classification !== "unclassified-local") return undefined;
	const projectId = stringField(record, "projectId");
	const scopeFailure = isScopeFailure(record.scopeFailure)
		? record.scopeFailure
		: undefined;
	if (record.scopeFailure !== undefined && scopeFailure === undefined)
		return undefined;
	if (
		record.scope === "project" &&
		(projectId === undefined ||
			!/^[a-f0-9]{64}$/.test(projectId) ||
			scopeFailure !== undefined)
	)
		return undefined;
	if (
		record.scope === "unscoped" &&
		(projectId !== undefined ||
			(scopeFailure !== "cwd_unavailable" &&
				scopeFailure !== "scope_key_unavailable"))
	)
		return undefined;
	const fields: StoredProvenanceFields = {
		metadataVersion: 2,
		scope: record.scope,
		classification: record.classification,
	};
	if (projectId !== undefined) fields.projectId = projectId;
	if (scopeFailure !== undefined) fields.scopeFailure = scopeFailure;
	const sessionId = stringField(record, "sessionId");
	const subagentRunId = stringField(record, "subagentRunId");
	const agentName = stringField(record, "agentName");
	if (sessionId !== undefined) fields.sessionId = sessionId;
	if (subagentRunId !== undefined) fields.subagentRunId = subagentRunId;
	if (agentName !== undefined) fields.agentName = agentName;
	return fields;
}

function parseStoredSourceMetadata(
	line: string,
	root: string,
	sourcesDir: string,
	detailsDir: string,
): StoredSourceMetadata | undefined {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (!isRecord(value) || !isCaptureStatus(value.captureStatus))
		return undefined;
	const sourceId = stringField(value, "sourceId");
	const toolName = stringField(value, "toolName");
	const storageKind = value.storageKind === "details" ? "details" : "content";
	const createdAt = finiteNumberField(value, "createdAt");
	const byteCount = finiteNumberField(value, "byteCount");
	const lineCount = finiteNumberField(value, "lineCount");
	const sha256 = stringField(value, "sha256");
	const rawTextPath = stringField(value, "textPath");
	if (
		sourceId === undefined ||
		toolName === undefined ||
		createdAt === undefined ||
		byteCount === undefined ||
		lineCount === undefined ||
		sha256 === undefined ||
		rawTextPath === undefined
	) {
		return undefined;
	}
	const textPath = managedStorePath(root, sourcesDir, rawTextPath);
	if (textPath === undefined) return undefined;
	const provenance = storedProvenanceFields(value);
	if (provenance === undefined) return undefined;
	const metadata: StoredSourceMetadata = {
		...provenance,
		sourceId,
		toolName,
		captureStatus: value.captureStatus,
		storageKind,
		createdAt,
		byteCount,
		lineCount,
		sha256,
		textPath,
	};
	const toolCallId = stringField(value, "toolCallId");
	const inputSummary = stringField(value, "inputSummary");
	const originalPath = stringField(value, "originalPath");
	const originalFullOutputPath = stringField(value, "originalFullOutputPath");
	const rawOriginalDetailsPath = stringField(value, "originalDetailsPath");
	const originalDetailsPath =
		rawOriginalDetailsPath === undefined
			? undefined
			: managedStorePath(root, detailsDir, rawOriginalDetailsPath);
	if (rawOriginalDetailsPath !== undefined && originalDetailsPath === undefined)
		return undefined;
	const originalDetailsByteCount = finiteNumberField(
		value,
		"originalDetailsByteCount",
	);
	const originalDetailsSha256 = stringField(value, "originalDetailsSha256");
	if (toolCallId !== undefined) metadata.toolCallId = toolCallId;
	if (inputSummary !== undefined) metadata.inputSummary = inputSummary;
	if (originalPath !== undefined) metadata.originalPath = originalPath;
	if (originalFullOutputPath !== undefined)
		metadata.originalFullOutputPath = originalFullOutputPath;
	if (originalDetailsPath !== undefined)
		metadata.originalDetailsPath = originalDetailsPath;
	if (originalDetailsByteCount !== undefined)
		metadata.originalDetailsByteCount = originalDetailsByteCount;
	if (originalDetailsSha256 !== undefined)
		metadata.originalDetailsSha256 = originalDetailsSha256;
	return metadata;
}

export class StoreCatalog {
	readonly #root: string;
	readonly #sourcesDir: string;
	readonly #detailsDir: string;
	readonly #indexPath: string;
	readonly #recover: () => Promise<void>;

	constructor(options: StoreCatalogOptions) {
		this.#root = options.root;
		this.#sourcesDir = options.sourcesDir;
		this.#detailsDir = options.detailsDir;
		this.#indexPath = options.indexPath;
		this.#recover = options.recover;
	}

	async readIndex(): Promise<StoredSourceMetadata[]> {
		await this.#recover();
		return (await this.readIndexReport()).entries;
	}

	async readIndexReport(): Promise<CatalogIndexRead> {
		let raw = "";
		try {
			raw = await readFile(this.#indexPath, "utf8");
		} catch (error) {
			const code =
				error instanceof Error && "code" in error
					? String((error as { code: unknown }).code)
					: "";
			if (code === "ENOENT")
				return { entries: [], indexLineCount: 0, invalidIndexLineCount: 0 };
			throw error;
		}
		const entries: StoredSourceMetadata[] = [];
		let indexLineCount = 0;
		let invalidIndexLineCount = 0;
		for (const line of raw.split("\n")) {
			if (line.length === 0) continue;
			indexLineCount += 1;
			const metadata = parseStoredSourceMetadata(
				line,
				this.#root,
				this.#sourcesDir,
				this.#detailsDir,
			);
			if (metadata === undefined) invalidIndexLineCount += 1;
			else entries.push(metadata);
		}
		return { entries, indexLineCount, invalidIndexLineCount };
	}

	discoveryEntries(
		entries: StoredSourceMetadata[],
		accessContext: StoreAccessContext,
	): StoredSourceMetadata[] {
		if (accessContext.actor === "system") return entries;
		if (accessContext.actor === "subagent") return [];
		return entries.filter((entry) => {
			if (entry.scope === "project")
				return (
					accessContext.includeGlobal === true ||
					(accessContext.projectId !== undefined &&
						entry.projectId === accessContext.projectId)
				);
			return entry.scope === "legacy" && accessContext.includeLegacy === true;
		});
	}

	async findSource(
		sourceId: string,
		accessContext: StoreAccessContext,
	): Promise<StoredSourceMetadata> {
		const entries = await this.readIndex();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (
				entry?.sourceId === sourceId &&
				this.hasExactAccess(entry, accessContext)
			)
				return entry;
		}
		throw new Error(
			`Unknown tool-result source (source not found or unavailable): ${sourceId}`,
		);
	}

	private hasExactAccess(
		entry: StoredSourceMetadata,
		accessContext: StoreAccessContext,
	): boolean {
		if (accessContext.actor === "system") return true;
		if (accessContext.actor === "subagent")
			return accessContext.grantedSourceIds?.has(entry.sourceId) === true;
		return true;
	}
}

export async function searchSources(
	query: string,
	sources: StoredSourceMetadata[],
	limit: number,
	contextLines: number,
	lineStart: number,
	lineLimit: number | undefined,
): Promise<SearchMatch[]> {
	const normalizedQuery = query.toLowerCase();
	const matches: SearchMatch[] = [];
	for (const source of sources) {
		const text = await readFile(source.textPath, "utf8");
		const lines = splitLinesWithEndings(text);
		const searchStart = Math.min(lineStart - 1, lines.length);
		const searchEnd =
			lineLimit === undefined
				? lines.length
				: Math.min(searchStart + lineLimit, lines.length);
		for (let index = searchStart; index < searchEnd; index += 1) {
			const line = lineWithoutEnding(lines[index] ?? "");
			const matchStartColumn = line.toLowerCase().indexOf(normalizedQuery);
			if (matchStartColumn === -1) continue;
			const contextStart = Math.max(searchStart, index - contextLines);
			const contextEndExclusive = Math.min(searchEnd, index + contextLines + 1);
			matches.push({
				sourceId: source.sourceId,
				toolName: source.toolName,
				lineNumber: index + 1,
				line,
				matchStartColumn,
				matchEndColumn: matchStartColumn + query.length,
				contextStartLine: contextStart + 1,
				contextEndLine: contextEndExclusive,
				context: lines.slice(contextStart, contextEndExclusive).join(""),
			});
			if (matches.length >= limit) return matches;
		}
	}
	return matches;
}
