import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

import { validateManagedExportRelativePath } from "./path-validation.ts";
import { SearchIndex } from "./search-index.ts";

export type CaptureStatus = "details.fullOutputPath" | "read.input.path" | "event.content";

export type StoredSourceMetadata = {
	sourceId: string;
	toolName: string;
	captureStatus: CaptureStatus;
	storageKind: "content" | "details";
	createdAt: number;
	byteCount: number;
	lineCount: number;
	sha256: string;
	textPath: string;
	toolCallId?: string;
	inputSummary?: string;
	originalPath?: string;
	originalFullOutputPath?: string;
	originalDetailsPath?: string;
	originalDetailsByteCount?: number;
	originalDetailsSha256?: string;
};

export type StoreSourceInput = {
	toolName: string;
	text: string;
	captureStatus: CaptureStatus;
	storageKind?: "content" | "details";
	toolCallId?: string;
	inputSummary?: string;
	originalPath?: string;
	originalFullOutputPath?: string;
	originalDetailsText?: string;
};

export type StoredSource = StoredSourceMetadata;

export type SourceRead = {
	metadata: StoredSourceMetadata;
	text: string;
};

export type LineWindow = {
	sourceId: string;
	startLine: number;
	endLine: number;
	lineCount: number;
	text: string;
};

export type SearchMatch = {
	sourceId: string;
	toolName: string;
	lineNumber: number;
	line: string;
	matchStartColumn: number;
	matchEndColumn: number;
	contextStartLine: number;
	contextEndLine: number;
	context: string;
};

export type SearchOptions = {
	sourceId?: string;
	limit?: number;
	contextLines?: number;
};

export type LineWindowOptions = {
	lineStart?: number;
	lineLimit?: number;
};

export type ExportSourceOptions = LineWindowOptions & {
	filePath?: string;
	overwrite?: boolean;
};

export type ExportOriginalDetailsOptions = {
	filePath?: string;
	overwrite?: boolean;
};

export type ExportSourceResult = {
	sourceId: string;
	filePath: string;
	startLine: number;
	endLine: number;
	lineCount: number;
	byteCount: number;
	sha256: string;
};

export type StoreStats = {
	root: string;
	sourceCount: number;
	totalBytes: number;
	totalOriginalDetailsBytes: number;
	totalStoredBytes: number;
	totalLines: number;
	indexLineCount: number;
	invalidIndexLineCount: number;
	recentSources: StoredSourceMetadata[];
};

export type RetentionPreviewOptions = {
	maxSources?: number;
	maxAgeHours?: number;
	now?: number;
};

export type RetentionCandidate = StoredSourceMetadata & {
	reasons: string[];
};

export type RetentionPreview = {
	root: string;
	sourceCount: number;
	keptCount: number;
	candidateCount: number;
	candidateBytes: number;
	candidateDetailsBytes: number;
	candidateStoredBytes: number;
	candidateLines: number;
	selectors: { maxSources?: number; maxAgeHours?: number };
	keptSourceIds: string[];
	candidates: RetentionCandidate[];
};

export type ExportOriginalDetailsResult = {
	sourceId: string;
	filePath: string;
	byteCount: number;
	sha256: string;
};

const INDEX_FILE = "index.jsonl";
const SOURCES_DIR = "sources";
const DETAILS_DIR = "details";
const EXPORTS_DIR = "exports";
const FTS_QUERY_BYTE_LIMIT = 512;

export type SearchIndexFactory = (root: string) => Promise<SearchIndex | undefined>;

type ToolResultStoreOptions = {
	searchIndexFactory?: SearchIndexFactory;
};

type IndexRead = {
	entries: StoredSourceMetadata[];
	indexLineCount: number;
	invalidIndexLineCount: number;
};

function splitLinesWithEndings(text: string): string[] {
	const matches = text.match(/[^\n]*(?:\n|$)/g) ?? [];
	if (matches.at(-1) === "") matches.pop();
	return matches;
}

function lineWithoutEnding(line: string): string {
	return line.endsWith("\n") ? line.slice(0, -1) : line;
}

function countLines(text: string): number {
	return splitLinesWithEndings(text).length;
}

function makeSourceId(): string {
	return `tr_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function clampPositiveInteger(value: number | undefined, fallback: number, max: number): number {
	if (value === undefined || !Number.isFinite(value)) return fallback;
	return Math.max(1, Math.min(Math.floor(value), max));
}

function clampNonNegativeInteger(value: number, max: number): number {
	return Math.max(0, Math.min(Math.floor(value), max));
}

function detailsByteCount(source: StoredSourceMetadata): number {
	return source.originalDetailsByteCount ?? 0;
}

function isWithinPath(filePath: string, dir: string): boolean {
	const pathRelativeToDir = relative(dir, filePath);
	return pathRelativeToDir === "" || (!pathRelativeToDir.startsWith("..") && !isAbsolute(pathRelativeToDir));
}

function managedStorePath(root: string, directory: string, filePath: string): string | undefined {
	const resolvedPath = resolve(filePath);
	const resolvedDirectory = resolve(root, directory);
	return isWithinPath(resolvedPath, resolvedDirectory) ? resolvedPath : undefined;
}

function managedExportPath(root: string, filePath: string | undefined, defaultName: string): string {
	return join(root, EXPORTS_DIR, validateManagedExportRelativePath(filePath ?? defaultName));
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCaptureStatus(value: unknown): value is CaptureStatus {
	return value === "details.fullOutputPath" || value === "read.input.path" || value === "event.content";
}

function finiteNumberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function parseStoredSourceMetadata(line: string, root: string): StoredSourceMetadata | undefined {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (!isRecord(value) || !isCaptureStatus(value.captureStatus)) return undefined;
	const sourceId = stringField(value, "sourceId");
	const toolName = stringField(value, "toolName");
	const storageKind = value.storageKind === "details" ? "details" : "content";
	const createdAt = finiteNumberField(value, "createdAt");
	const byteCount = finiteNumberField(value, "byteCount");
	const lineCount = finiteNumberField(value, "lineCount");
	const sha256 = stringField(value, "sha256");
	const rawTextPath = stringField(value, "textPath");
	if (sourceId === undefined || toolName === undefined || createdAt === undefined || byteCount === undefined || lineCount === undefined || sha256 === undefined || rawTextPath === undefined) {
		return undefined;
	}
	const textPath = managedStorePath(root, SOURCES_DIR, rawTextPath);
	if (textPath === undefined) return undefined;
	const metadata: StoredSourceMetadata = { sourceId, toolName, captureStatus: value.captureStatus, storageKind, createdAt, byteCount, lineCount, sha256, textPath };
	const toolCallId = stringField(value, "toolCallId");
	const inputSummary = stringField(value, "inputSummary");
	const originalPath = stringField(value, "originalPath");
	const originalFullOutputPath = stringField(value, "originalFullOutputPath");
	const rawOriginalDetailsPath = stringField(value, "originalDetailsPath");
	const originalDetailsPath = rawOriginalDetailsPath === undefined ? undefined : managedStorePath(root, DETAILS_DIR, rawOriginalDetailsPath);
	if (rawOriginalDetailsPath !== undefined && originalDetailsPath === undefined) return undefined;
	const originalDetailsByteCount = finiteNumberField(value, "originalDetailsByteCount");
	const originalDetailsSha256 = stringField(value, "originalDetailsSha256");
	if (toolCallId !== undefined) metadata.toolCallId = toolCallId;
	if (inputSummary !== undefined) metadata.inputSummary = inputSummary;
	if (originalPath !== undefined) metadata.originalPath = originalPath;
	if (originalFullOutputPath !== undefined) metadata.originalFullOutputPath = originalFullOutputPath;
	if (originalDetailsPath !== undefined) metadata.originalDetailsPath = originalDetailsPath;
	if (originalDetailsByteCount !== undefined) metadata.originalDetailsByteCount = originalDetailsByteCount;
	if (originalDetailsSha256 !== undefined) metadata.originalDetailsSha256 = originalDetailsSha256;
	return metadata;
}

function unicodeLength(text: string): number {
	return [...text].length;
}

function isAscii(text: string): boolean {
	return /^[\u0000-\u007f]*$/.test(text);
}

async function searchSources(query: string, sources: StoredSourceMetadata[], limit: number, contextLines: number): Promise<SearchMatch[]> {
	const normalizedQuery = query.toLowerCase();
	const matches: SearchMatch[] = [];
	for (const source of sources) {
		const text = await readFile(source.textPath, "utf8");
		const lines = splitLinesWithEndings(text);
		for (let index = 0; index < lines.length; index += 1) {
			const line = lineWithoutEnding(lines[index] ?? "");
			const matchStartColumn = line.toLowerCase().indexOf(normalizedQuery);
			if (matchStartColumn === -1) continue;
			const contextStart = Math.max(0, index - contextLines);
			const contextEndExclusive = Math.min(lines.length, index + contextLines + 1);
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

export class ToolResultStore {
	readonly root: string;
	readonly sourcesDir: string;
	readonly indexPath: string;
	private readonly searchIndexFactory: SearchIndexFactory;
	private searchIndexPromise?: Promise<SearchIndex | undefined>;
	private searchIndexDisabled = false;

	constructor(root: string, options: ToolResultStoreOptions = {}) {
		this.root = root;
		this.sourcesDir = join(root, SOURCES_DIR);
		this.indexPath = join(root, INDEX_FILE);
		this.searchIndexFactory = options.searchIndexFactory ?? SearchIndex.create;
	}

	async storeSource(input: StoreSourceInput): Promise<StoredSource> {
		await this.ensurePrivateRoot();
		await mkdir(this.sourcesDir, { recursive: true, mode: 0o700 });
		const sourceId = makeSourceId();
		const textPath = join(this.sourcesDir, `${sourceId}.txt`);
		const metadata: StoredSourceMetadata = {
			sourceId,
			toolName: input.toolName,
			captureStatus: input.captureStatus,
			storageKind: input.storageKind ?? "content",
			createdAt: Date.now(),
			byteCount: Buffer.byteLength(input.text, "utf8"),
			lineCount: countLines(input.text),
			sha256: hashText(input.text),
			textPath,
		};
		if (input.toolCallId !== undefined) metadata.toolCallId = input.toolCallId;
		if (input.inputSummary !== undefined) metadata.inputSummary = input.inputSummary;
		if (input.originalPath !== undefined) metadata.originalPath = input.originalPath;
		if (input.originalFullOutputPath !== undefined) metadata.originalFullOutputPath = input.originalFullOutputPath;
		const writtenPaths: string[] = [];
		try {
			if (input.originalDetailsText !== undefined) {
				const detailsPath = join(this.root, DETAILS_DIR, `${sourceId}.json`);
				await mkdir(dirname(detailsPath), { recursive: true, mode: 0o700 });
				await writeFile(detailsPath, input.originalDetailsText, { encoding: "utf8", mode: 0o600 });
				writtenPaths.push(detailsPath);
				metadata.originalDetailsPath = detailsPath;
				metadata.originalDetailsByteCount = Buffer.byteLength(input.originalDetailsText, "utf8");
				metadata.originalDetailsSha256 = hashText(input.originalDetailsText);
			}

			await writeFile(textPath, input.text, { encoding: "utf8", mode: 0o600 });
			writtenPaths.push(textPath);
			await writeFile(this.indexPath, `${JSON.stringify(metadata)}\n`, { encoding: "utf8", flag: "a", mode: 0o600 });
			await this.appendSearchIndex(metadata, input.text);
			return metadata;
		} catch (error) {
			await Promise.all(writtenPaths.map(async (path) => {
				try {
					await unlink(path);
				} catch {
					// Best-effort rollback for files created by this failed store attempt.
				}
			}));
			throw error;
		}
	}

	async listSources(limit = 20): Promise<StoredSourceMetadata[]> {
		const entries = await this.readIndex();
		return [...entries].reverse().slice(0, Math.max(1, Math.min(Math.floor(limit), 100)));
	}

	async getStats(limit = 5): Promise<StoreStats> {
		const index = await this.readIndexReport();
		const entries = index.entries;
		const totalBytes = entries.reduce((sum, entry) => sum + entry.byteCount, 0);
		const totalOriginalDetailsBytes = entries.reduce((sum, entry) => sum + detailsByteCount(entry), 0);
		return {
			root: this.root,
			sourceCount: entries.length,
			totalBytes,
			totalOriginalDetailsBytes,
			totalStoredBytes: totalBytes + totalOriginalDetailsBytes,
			totalLines: entries.reduce((sum, entry) => sum + entry.lineCount, 0),
			indexLineCount: index.indexLineCount,
			invalidIndexLineCount: index.invalidIndexLineCount,
			recentSources: [...entries].reverse().slice(0, clampPositiveInteger(limit, 5, 100)),
		};
	}

	async previewRetention(options: RetentionPreviewOptions = {}): Promise<RetentionPreview> {
		const entries = await this.readIndex();
		const selectors: { maxSources?: number; maxAgeHours?: number } = {};
		const candidates = new Map<string, RetentionCandidate>();
		if (options.maxSources !== undefined) {
			const maxSources = clampNonNegativeInteger(options.maxSources, 100_000);
			selectors.maxSources = maxSources;
			const candidateLimit = Math.max(0, entries.length - maxSources);
			for (const entry of entries.slice(0, candidateLimit)) {
				candidates.set(entry.sourceId, { ...entry, reasons: ["maxSources"] });
			}
		}
		if (options.maxAgeHours !== undefined) {
			const maxAgeHours = Math.max(0, options.maxAgeHours);
			selectors.maxAgeHours = maxAgeHours;
			const cutoff = (options.now ?? Date.now()) - (maxAgeHours * 60 * 60 * 1000);
			for (const entry of entries) {
				if (entry.createdAt >= cutoff) continue;
				const existing = candidates.get(entry.sourceId);
				if (existing) existing.reasons.push("maxAgeHours");
				else candidates.set(entry.sourceId, { ...entry, reasons: ["maxAgeHours"] });
			}
		}
		const candidateList = entries.flatMap((entry) => candidates.get(entry.sourceId) ?? []);
		const candidateIds = new Set(candidateList.map((candidate) => candidate.sourceId));
		const keptSourceIds = entries.filter((entry) => !candidateIds.has(entry.sourceId)).map((entry) => entry.sourceId);
		const candidateBytes = candidateList.reduce((sum, candidate) => sum + candidate.byteCount, 0);
		const candidateDetailsBytes = candidateList.reduce((sum, candidate) => sum + detailsByteCount(candidate), 0);
		return {
			root: this.root,
			sourceCount: entries.length,
			keptCount: keptSourceIds.length,
			candidateCount: candidateList.length,
			candidateBytes,
			candidateDetailsBytes,
			candidateStoredBytes: candidateBytes + candidateDetailsBytes,
			candidateLines: candidateList.reduce((sum, candidate) => sum + candidate.lineCount, 0),
			selectors,
			keptSourceIds,
			candidates: candidateList,
		};
	}

	async readSource(sourceId: string): Promise<SourceRead> {
		const metadata = await this.findSource(sourceId);
		const text = await readFile(metadata.textPath, "utf8");
		return { metadata, text };
	}

	async getLineWindow(sourceId: string, options: LineWindowOptions = {}): Promise<LineWindow> {
		const { text } = await this.readSource(sourceId);
		const lines = splitLinesWithEndings(text);
		const startLine = clampPositiveInteger(options.lineStart, 1, Math.max(lines.length, 1));
		const lineLimit = clampPositiveInteger(options.lineLimit, 80, 500);
		const startIndex = Math.min(startLine - 1, lines.length);
		const selected = lines.slice(startIndex, startIndex + lineLimit);
		const endLine = selected.length === 0 ? startLine - 1 : startLine + selected.length - 1;
		return {
			sourceId,
			startLine,
			endLine,
			lineCount: selected.length,
			text: selected.join(""),
		};
	}

	async exportSource(sourceId: string, options: ExportSourceOptions = {}): Promise<ExportSourceResult> {
		await this.ensurePrivateRoot();
		const { text } = await this.readSource(sourceId);
		const lines = splitLinesWithEndings(text);
		const startLine = clampPositiveInteger(options.lineStart, 1, Math.max(lines.length, 1));
		const startIndex = Math.min(startLine - 1, lines.length);
		const selected = options.lineStart === undefined && options.lineLimit === undefined
			? lines
			: lines.slice(startIndex, options.lineLimit === undefined ? undefined : startIndex + clampPositiveInteger(options.lineLimit, 80, 500));
		const exportText = selected.join("");
		const endLine = selected.length === 0 ? startLine - 1 : startLine + selected.length - 1;
		const filePath = managedExportPath(this.root, options.filePath, `${sourceId}-${Date.now().toString(36)}-${startLine}-${endLine}.txt`);
		await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
		await writeFile(filePath, exportText, { encoding: "utf8", mode: 0o600, flag: options.overwrite === true ? "w" : "wx" });
		return {
			sourceId,
			filePath,
			startLine,
			endLine,
			lineCount: selected.length,
			byteCount: Buffer.byteLength(exportText, "utf8"),
			sha256: hashText(exportText),
		};
	}

	async exportOriginalDetails(sourceId: string, options: ExportOriginalDetailsOptions = {}): Promise<ExportOriginalDetailsResult> {
		await this.ensurePrivateRoot();
		const metadata = await this.findSource(sourceId);
		if (metadata.originalDetailsPath === undefined) throw new Error(`No original details stored for tool-result source: ${sourceId}`);
		const detailsText = await readFile(metadata.originalDetailsPath, "utf8");
		const filePath = managedExportPath(this.root, options.filePath, `${sourceId}-details-${Date.now().toString(36)}.json`);
		await mkdir(dirname(filePath), { recursive: true, mode: 0o700 });
		await writeFile(filePath, detailsText, { encoding: "utf8", mode: 0o600, flag: options.overwrite === true ? "w" : "wx" });
		return {
			sourceId,
			filePath,
			byteCount: Buffer.byteLength(detailsText, "utf8"),
			sha256: hashText(detailsText),
		};
	}

	async search(query: string, options: SearchOptions = {}): Promise<SearchMatch[]> {
		if (query.trim().length === 0) throw new Error("Invalid query: expected non-empty search text");
		const limit = clampPositiveInteger(options.limit, 10, 50);
		const contextLines = Math.max(0, Math.min(Math.floor(options.contextLines ?? 1), 5));
		if (options.sourceId) return searchSources(query, [await this.findSource(options.sourceId)], limit, contextLines);
		const entries = await this.readIndex();
		const indexedCandidates = await this.indexedCandidateSources(query, entries);
		return searchSources(query, indexedCandidates ?? [...entries].reverse(), limit, contextLines);
	}

	private async indexedCandidateSources(query: string, entries: StoredSourceMetadata[]): Promise<StoredSourceMetadata[] | undefined> {
		if (this.searchIndexDisabled || unicodeLength(query) < 3 || !isAscii(query) || Buffer.byteLength(query, "utf8") > FTS_QUERY_BYTE_LIMIT) return undefined;
		try {
			const searchIndex = await this.getSearchIndex();
			if (searchIndex === undefined) return undefined;
			const candidateIds = new Set(searchIndex.candidateSourceIds(query, entries));
			return [...entries].reverse().filter((entry) => candidateIds.has(entry.sourceId));
		} catch {
			this.searchIndexDisabled = true;
			return undefined;
		}
	}

	private async appendSearchIndex(metadata: StoredSourceMetadata, text: string): Promise<void> {
		if (this.searchIndexDisabled || this.searchIndexPromise === undefined) return;
		try {
			const searchIndex = await this.getSearchIndex();
			searchIndex?.append(metadata, text);
		} catch {
			this.searchIndexDisabled = true;
		}
	}

	private async getSearchIndex(): Promise<SearchIndex | undefined> {
		if (this.searchIndexDisabled) return undefined;
		this.searchIndexPromise ??= this.searchIndexFactory(this.root);
		const searchIndex = await this.searchIndexPromise;
		if (searchIndex === undefined) this.searchIndexDisabled = true;
		return searchIndex;
	}

	private async ensurePrivateRoot(): Promise<void> {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		await chmod(this.root, 0o700);
	}

	private async findSource(sourceId: string): Promise<StoredSourceMetadata> {
		const entries = await this.readIndex();
		for (let index = entries.length - 1; index >= 0; index -= 1) {
			const entry = entries[index];
			if (entry?.sourceId === sourceId) return entry;
		}
		throw new Error(`Unknown tool-result source: ${sourceId}`);
	}

	private async readIndex(): Promise<StoredSourceMetadata[]> {
		return (await this.readIndexReport()).entries;
	}

	private async readIndexReport(): Promise<IndexRead> {
		let raw = "";
		try {
			raw = await readFile(this.indexPath, "utf8");
		} catch (error) {
			const code = error instanceof Error && "code" in error ? String((error as { code: unknown }).code) : "";
			if (code === "ENOENT") return { entries: [], indexLineCount: 0, invalidIndexLineCount: 0 };
			throw error;
		}
		const entries: StoredSourceMetadata[] = [];
		let indexLineCount = 0;
		let invalidIndexLineCount = 0;
		for (const line of raw.split("\n")) {
			if (line.length === 0) continue;
			indexLineCount += 1;
			const metadata = parseStoredSourceMetadata(line, this.root);
			if (metadata === undefined) invalidIndexLineCount += 1;
			else entries.push(metadata);
		}
		return { entries, indexLineCount, invalidIndexLineCount };
	}
}
