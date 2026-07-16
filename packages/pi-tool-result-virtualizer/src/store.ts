import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";

import type { StoreLimits } from "./config.ts";
import { inspectStoreConsistency } from "./diagnostics.ts";
import { StoreJournal, type JournalTransaction } from "./journal.ts";
import type {
	CaptureClassification,
	CaptureProvenance,
	CaptureScope,
	ScopeFailure,
} from "./provenance.ts";
import { SearchIndex } from "./search-index.ts";
import { StoreWriteLock } from "./write-lock.ts";

export type CaptureStatus =
	| "details.fullOutputPath"
	| "read.input.path"
	| "event.content";

export type StoredSourceMetadata = {
	metadataVersion: 1 | 2;
	sourceId: string;
	toolName: string;
	captureStatus: CaptureStatus;
	storageKind: "content" | "details";
	scope: CaptureScope;
	classification: CaptureClassification;
	createdAt: number;
	byteCount: number;
	lineCount: number;
	sha256: string;
	textPath: string;
	projectId?: string;
	scopeFailure?: ScopeFailure;
	sessionId?: string;
	subagentRunId?: string;
	agentName?: string;
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
	provenance?: CaptureProvenance;
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

export type StoreAccessContext = {
	actor: "system" | "parent" | "subagent";
	projectId?: string;
	sessionId?: string;
	subagentRunId?: string;
	subagentAgentName?: string;
	grantedSourceIds?: ReadonlySet<string>;
	includeGlobal?: boolean;
	includeLegacy?: boolean;
};

export type SearchOptions = {
	sourceId?: string;
	sourceIds?: string[];
	lineStart?: number;
	lineLimit?: number;
	limit?: number;
	contextLines?: number;
	access?: StoreAccessContext;
};

export type LineWindowOptions = {
	lineStart?: number;
	lineLimit?: number;
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

export type StoreConsistencyIssueCode =
	| "invalid_index_lines"
	| "duplicate_source_id"
	| "missing_source_file"
	| "missing_details_file"
	| "source_hash_mismatch"
	| "details_hash_mismatch"
	| "orphan_source_file"
	| "orphan_details_file"
	| "pending_transaction"
	| "invalid_journal"
	| "scope_key_unavailable"
	| "fts_mismatch"
	| "fts_unavailable";

export type StoreConsistencyIssue = {
	code: StoreConsistencyIssueCode;
	count: number;
	sourceIds?: string[];
};

export type StoreFootprint = {
	scope: "store" | "visible";
	sourceBytes: number;
	detailsBytes: number;
	indexBytes: number;
	ftsBytes: number;
	totalBytes: number;
};

export type StoreQuotaState = {
	usageScope: "store" | "visible";
	currentSources: number;
	currentStoredBytes: number;
	maxSources?: number;
	maxStoredBytes?: number;
	sourceLimitExceeded: boolean;
	storedBytesLimitExceeded: boolean;
};

export type StoreConsistencyReport = {
	scope: "store" | "visible";
	healthy: boolean;
	indexLineCount: number;
	validSourceCount: number;
	invalidIndexLineCount: number;
	duplicateSourceIdCount: number;
	missingSourceFileCount: number;
	missingDetailsFileCount: number;
	hashMismatchCount: number;
	detailsHashMismatchCount: number;
	orphanSourceFileCount: number;
	orphanDetailsFileCount: number;
	pendingTransactionCount: number;
	invalidJournalCount: number;
	scopeKeyUnavailable: boolean;
	ftsStatus: "missing" | "healthy" | "mismatch" | "unavailable";
	ftsMismatchCount: number;
	footprint: StoreFootprint;
	quota: StoreQuotaState;
	recentSources: StoredSourceMetadata[];
	issues: StoreConsistencyIssue[];
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

const INDEX_FILE = "index.jsonl";
const SOURCES_DIR = "sources";
const DETAILS_DIR = "details";
const FTS_QUERY_BYTE_LIMIT = 512;
const SYSTEM_ACCESS: StoreAccessContext = { actor: "system" };

export type SearchIndexFactory = (
	root: string,
) => Promise<SearchIndex | undefined>;

export type StoreFailurePoint =
	| "afterAdmission"
	| "afterJournal"
	| "afterDetailsStage"
	| "afterSourceStage"
	| "afterDetailsPromotion"
	| "afterSourcePromotion"
	| "beforeMetadataAppend"
	| "afterMetadataAppend"
	| "beforeFtsAppend"
	| "afterFtsAppend";

export type StoreFailureInjector = (
	point: StoreFailurePoint,
) => void | Promise<void>;

type ToolResultStoreOptions = {
	searchIndexFactory?: SearchIndexFactory;
	limits?: StoreLimits;
	failureInjector?: StoreFailureInjector;
};

export type StoreQuotaLimit = "maxSources" | "maxStoredBytes";

export class StoreQuotaError extends Error {
	readonly limit: StoreQuotaLimit;
	readonly current: number;
	readonly attempted: number;
	readonly maximum: number;

	constructor(
		limit: StoreQuotaLimit,
		current: number,
		attempted: number,
		maximum: number,
	) {
		super(`tool-result store quota exceeded: ${limit}`);
		this.name = "StoreQuotaError";
		this.limit = limit;
		this.current = current;
		this.attempted = attempted;
		this.maximum = maximum;
	}
}

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
	return `tr_${Date.now().toString(36)}_${randomBytes(16).toString("hex")}`;
}

function hashText(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

function clampPositiveInteger(
	value: number | undefined,
	fallback: number,
	max: number,
): number {
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
	const textPath = managedStorePath(root, SOURCES_DIR, rawTextPath);
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
			: managedStorePath(root, DETAILS_DIR, rawOriginalDetailsPath);
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

function unicodeLength(text: string): number {
	return [...text].length;
}

function isAscii(text: string): boolean {
	return /^[\u0000-\u007f]*$/.test(text);
}

async function searchSources(
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

export class ToolResultStore {
	readonly root: string;
	readonly sourcesDir: string;
	readonly indexPath: string;
	private readonly journal: StoreJournal;
	private readonly writeLock: StoreWriteLock;
	private readonly limits: StoreLimits;
	private readonly failureInjector: StoreFailureInjector | undefined;
	private readonly searchIndexFactory: SearchIndexFactory;
	private recoveryPromise: Promise<void> | undefined;
	private writeQueue: Promise<void> = Promise.resolve();
	private searchIndexPromise?: Promise<SearchIndex | undefined>;
	private searchIndexDisabled = false;

	constructor(root: string, options: ToolResultStoreOptions = {}) {
		this.root = root;
		this.sourcesDir = join(root, SOURCES_DIR);
		this.indexPath = join(root, INDEX_FILE);
		this.journal = new StoreJournal(root);
		this.writeLock = new StoreWriteLock(root);
		this.limits = options.limits ?? {};
		this.failureInjector = options.failureInjector;
		this.searchIndexFactory = options.searchIndexFactory ?? SearchIndex.create;
	}

	private async injectFailure(point: StoreFailurePoint): Promise<void> {
		await this.failureInjector?.(point);
	}

	storeSource(input: StoreSourceInput): Promise<StoredSource> {
		const write = this.writeQueue.then(() =>
			this.storeSourceTransaction(input),
		);
		this.writeQueue = write.then(
			() => undefined,
			() => undefined,
		);
		return write;
	}

	private async storeSourceTransaction(
		input: StoreSourceInput,
	): Promise<StoredSource> {
		await this.ensureRecovered();
		return this.writeLock.runExclusive(() =>
			this.storeSourceWhileLocked(input),
		);
	}

	private async storeSourceWhileLocked(
		input: StoreSourceInput,
	): Promise<StoredSource> {
		const sourceBytes = Buffer.byteLength(input.text, "utf8");
		const detailsBytes =
			input.originalDetailsText === undefined
				? 0
				: Buffer.byteLength(input.originalDetailsText, "utf8");
		await this.assertAdmission(sourceBytes + detailsBytes);
		await this.injectFailure("afterAdmission");
		const sourceId = makeSourceId();
		const transaction = await this.journal.begin(
			sourceId,
			input.originalDetailsText !== undefined,
		);
		const metadata = this.metadataForInput(
			input,
			transaction,
			sourceBytes,
			detailsBytes,
		);
		try {
			await this.injectFailure("afterJournal");
			if (input.originalDetailsText !== undefined) {
				await writeFile(
					transaction.stagedDetailsPath,
					input.originalDetailsText,
					{ encoding: "utf8", mode: 0o600 },
				);
				await this.injectFailure("afterDetailsStage");
			}
			await writeFile(transaction.stagedSourcePath, input.text, {
				encoding: "utf8",
				mode: 0o600,
			});
			await this.injectFailure("afterSourceStage");
			if (input.originalDetailsText !== undefined) {
				await rename(
					transaction.stagedDetailsPath,
					transaction.finalDetailsPath,
				);
				await this.injectFailure("afterDetailsPromotion");
			}
			await rename(transaction.stagedSourcePath, transaction.finalSourcePath);
			await this.injectFailure("afterSourcePromotion");
			await this.injectFailure("beforeMetadataAppend");
			await writeFile(this.indexPath, `\n${JSON.stringify(metadata)}\n`, {
				encoding: "utf8",
				flag: "a",
				mode: 0o600,
			});
			await this.injectFailure("afterMetadataAppend");
			await this.injectFailure("beforeFtsAppend");
			await this.appendSearchIndex(metadata, input.text);
			await this.injectFailure("afterFtsAppend");
			await this.journal.commit(transaction).catch(() => undefined);
			return metadata;
		} catch (error) {
			let committed = false;
			try {
				committed = (await this.readIndexReport()).entries.some(
					(entry) => entry.sourceId === sourceId,
				);
			} catch {
				// The original write error remains authoritative when the index cannot be inspected.
			}
			if (committed) {
				await this.journal.commit(transaction).catch(() => undefined);
				return metadata;
			}
			await this.journal.rollback(transaction).catch(() => undefined);
			throw error;
		}
	}

	private metadataForInput(
		input: StoreSourceInput,
		transaction: JournalTransaction,
		sourceBytes: number,
		detailsBytes: number,
	): StoredSourceMetadata {
		const metadata: StoredSourceMetadata = {
			metadataVersion: input.provenance ? 2 : 1,
			sourceId: transaction.sourceId,
			toolName: input.toolName,
			captureStatus: input.captureStatus,
			storageKind: input.storageKind ?? "content",
			scope: input.provenance?.scope ?? "legacy",
			classification: input.provenance?.classification ?? "legacy-unclassified",
			createdAt: Date.now(),
			byteCount: sourceBytes,
			lineCount: countLines(input.text),
			sha256: hashText(input.text),
			textPath: transaction.finalSourcePath,
		};
		if (input.provenance?.projectId !== undefined)
			metadata.projectId = input.provenance.projectId;
		if (input.provenance?.scopeFailure !== undefined)
			metadata.scopeFailure = input.provenance.scopeFailure;
		if (input.provenance?.sessionId !== undefined)
			metadata.sessionId = input.provenance.sessionId;
		if (input.provenance?.subagentRunId !== undefined)
			metadata.subagentRunId = input.provenance.subagentRunId;
		if (input.provenance?.agentName !== undefined)
			metadata.agentName = input.provenance.agentName;
		if (input.toolCallId !== undefined) metadata.toolCallId = input.toolCallId;
		if (input.inputSummary !== undefined)
			metadata.inputSummary = input.inputSummary;
		if (input.originalPath !== undefined)
			metadata.originalPath = input.originalPath;
		if (input.originalFullOutputPath !== undefined)
			metadata.originalFullOutputPath = input.originalFullOutputPath;
		if (input.originalDetailsText !== undefined) {
			metadata.originalDetailsPath = transaction.finalDetailsPath;
			metadata.originalDetailsByteCount = detailsBytes;
			metadata.originalDetailsSha256 = hashText(input.originalDetailsText);
		}
		return metadata;
	}

	private async assertAdmission(attemptedBytes: number): Promise<void> {
		if (
			this.limits.maxSources === undefined &&
			this.limits.maxStoredBytes === undefined
		)
			return;
		const entries = (await this.readIndexReport()).entries;
		if (
			this.limits.maxSources !== undefined &&
			entries.length + 1 > this.limits.maxSources
		) {
			throw new StoreQuotaError(
				"maxSources",
				entries.length,
				1,
				this.limits.maxSources,
			);
		}
		if (this.limits.maxStoredBytes !== undefined) {
			const currentBytes = entries.reduce(
				(total, entry) => total + entry.byteCount + detailsByteCount(entry),
				0,
			);
			if (currentBytes + attemptedBytes > this.limits.maxStoredBytes) {
				throw new StoreQuotaError(
					"maxStoredBytes",
					currentBytes,
					attemptedBytes,
					this.limits.maxStoredBytes,
				);
			}
		}
	}

	private async ensureRecovered(): Promise<void> {
		this.recoveryPromise ??= this.writeLock.runExclusive(() =>
			this.recoverTransactions(),
		);
		const recovery = this.recoveryPromise;
		try {
			await recovery;
		} catch (error) {
			if (this.recoveryPromise === recovery) this.recoveryPromise = undefined;
			throw error;
		}
	}

	private async recoverTransactions(): Promise<void> {
		await this.ensurePrivateRoot();
		const committedSourceIds = new Set(
			(await this.readIndexReport()).entries.map((entry) => entry.sourceId),
		);
		await this.journal.recover(committedSourceIds);
	}

	async listSources(
		limit = 20,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<StoredSourceMetadata[]> {
		const entries = this.discoveryEntries(
			await this.readIndex(),
			accessContext,
		);
		return [...entries]
			.reverse()
			.slice(0, Math.max(1, Math.min(Math.floor(limit), 100)));
	}

	async getStats(
		limit = 5,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<StoreStats> {
		const index = await this.readIndexReport();
		const entries = this.discoveryEntries(index.entries, accessContext);
		const totalBytes = entries.reduce((sum, entry) => sum + entry.byteCount, 0);
		const totalOriginalDetailsBytes = entries.reduce(
			(sum, entry) => sum + detailsByteCount(entry),
			0,
		);
		return {
			root: this.root,
			sourceCount: entries.length,
			totalBytes,
			totalOriginalDetailsBytes,
			totalStoredBytes: totalBytes + totalOriginalDetailsBytes,
			totalLines: entries.reduce((sum, entry) => sum + entry.lineCount, 0),
			indexLineCount:
				accessContext.actor === "system"
					? index.indexLineCount
					: entries.length,
			invalidIndexLineCount:
				accessContext.actor === "system" ? index.invalidIndexLineCount : 0,
			recentSources: [...entries]
				.reverse()
				.slice(0, clampPositiveInteger(limit, 5, 100)),
		};
	}

	async diagnoseConsistency(
		limit = 5,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<StoreConsistencyReport> {
		const index = await this.readIndexReport();
		return inspectStoreConsistency({
			root: this.root,
			sourcesDir: this.sourcesDir,
			indexPath: this.indexPath,
			allEntries: index.entries,
			visibleEntries: this.discoveryEntries(index.entries, accessContext),
			indexLineCount: index.indexLineCount,
			invalidIndexLineCount: index.invalidIndexLineCount,
			journal: await this.journal.inspect(),
			limits: this.limits,
			recentLimit: limit,
			includeGlobalState: accessContext.actor === "system",
		});
	}

	async previewRetention(
		options: RetentionPreviewOptions = {},
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<RetentionPreview> {
		const entries = this.discoveryEntries(
			await this.readIndex(),
			accessContext,
		);
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
			const cutoff = (options.now ?? Date.now()) - maxAgeHours * 60 * 60 * 1000;
			for (const entry of entries) {
				if (entry.createdAt >= cutoff) continue;
				const existing = candidates.get(entry.sourceId);
				if (existing) existing.reasons.push("maxAgeHours");
				else
					candidates.set(entry.sourceId, {
						...entry,
						reasons: ["maxAgeHours"],
					});
			}
		}
		const candidateList = entries.flatMap(
			(entry) => candidates.get(entry.sourceId) ?? [],
		);
		const candidateIds = new Set(
			candidateList.map((candidate) => candidate.sourceId),
		);
		const keptSourceIds = entries
			.filter((entry) => !candidateIds.has(entry.sourceId))
			.map((entry) => entry.sourceId);
		const candidateBytes = candidateList.reduce(
			(sum, candidate) => sum + candidate.byteCount,
			0,
		);
		const candidateDetailsBytes = candidateList.reduce(
			(sum, candidate) => sum + detailsByteCount(candidate),
			0,
		);
		return {
			root: this.root,
			sourceCount: entries.length,
			keptCount: keptSourceIds.length,
			candidateCount: candidateList.length,
			candidateBytes,
			candidateDetailsBytes,
			candidateStoredBytes: candidateBytes + candidateDetailsBytes,
			candidateLines: candidateList.reduce(
				(sum, candidate) => sum + candidate.lineCount,
				0,
			),
			selectors,
			keptSourceIds,
			candidates: candidateList,
		};
	}

	async readSource(
		sourceId: string,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<SourceRead> {
		const metadata = await this.findSource(sourceId, accessContext);
		const text = await readFile(metadata.textPath, "utf8");
		return { metadata, text };
	}

	async getSourceMetadata(
		sourceId: string,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<StoredSourceMetadata> {
		return this.findSource(sourceId, accessContext);
	}

	async getLineWindow(
		sourceId: string,
		options: LineWindowOptions = {},
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<LineWindow> {
		const { text } = await this.readSource(sourceId, accessContext);
		const lines = splitLinesWithEndings(text);
		const startLine = clampPositiveInteger(
			options.lineStart,
			1,
			Math.max(lines.length, 1),
		);
		const lineLimit = clampPositiveInteger(options.lineLimit, 80, 500);
		const startIndex = Math.min(startLine - 1, lines.length);
		const selected = lines.slice(startIndex, startIndex + lineLimit);
		const endLine =
			selected.length === 0 ? startLine - 1 : startLine + selected.length - 1;
		return {
			sourceId,
			startLine,
			endLine,
			lineCount: selected.length,
			text: selected.join(""),
		};
	}

	async search(
		query: string,
		options: SearchOptions = {},
	): Promise<SearchMatch[]> {
		if (query.trim().length === 0)
			throw new Error("Invalid query: expected non-empty search text");
		if (options.sourceId !== undefined && options.sourceIds !== undefined)
			throw new Error("sourceId and sourceIds may not both be provided");
		if (options.sourceIds !== undefined) {
			if (options.sourceIds.length === 0)
				throw new Error("sourceIds must contain at least one source id");
			if (options.sourceIds.length > 10)
				throw new Error("sourceIds may contain at most 10 source ids");
			if (new Set(options.sourceIds).size !== options.sourceIds.length)
				throw new Error("sourceIds must be unique");
		}
		const limit = clampPositiveInteger(options.limit, 10, 50);
		const contextLines = Math.max(
			0,
			Math.min(Math.floor(options.contextLines ?? 1), 5),
		);
		const lineStart = clampPositiveInteger(
			options.lineStart,
			1,
			Number.MAX_SAFE_INTEGER,
		);
		const lineLimit =
			options.lineLimit === undefined
				? undefined
				: clampPositiveInteger(options.lineLimit, 80, 500);
		const accessContext = options.access ?? SYSTEM_ACCESS;
		if (options.sourceId !== undefined)
			return searchSources(
				query,
				[await this.findSource(options.sourceId, accessContext)],
				limit,
				contextLines,
				lineStart,
				lineLimit,
			);
		if (options.sourceIds !== undefined) {
			const sources: StoredSourceMetadata[] = [];
			for (const sourceId of options.sourceIds)
				sources.push(await this.findSource(sourceId, accessContext));
			return searchSources(
				query,
				sources,
				limit,
				contextLines,
				lineStart,
				lineLimit,
			);
		}
		const entries = this.discoveryEntries(
			await this.readIndex(),
			accessContext,
		);
		const indexedCandidates = await this.indexedCandidateSources(
			query,
			entries,
		);
		return searchSources(
			query,
			indexedCandidates ?? [...entries].reverse(),
			limit,
			contextLines,
			lineStart,
			lineLimit,
		);
	}

	private async indexedCandidateSources(
		query: string,
		entries: StoredSourceMetadata[],
	): Promise<StoredSourceMetadata[] | undefined> {
		if (
			this.searchIndexDisabled ||
			unicodeLength(query) < 3 ||
			!isAscii(query) ||
			Buffer.byteLength(query, "utf8") > FTS_QUERY_BYTE_LIMIT
		)
			return undefined;
		try {
			const searchIndex = await this.getSearchIndex();
			if (searchIndex === undefined) return undefined;
			const candidateIds = new Set(
				searchIndex.candidateSourceIds(query, entries),
			);
			return [...entries]
				.reverse()
				.filter((entry) => candidateIds.has(entry.sourceId));
		} catch {
			this.searchIndexDisabled = true;
			return undefined;
		}
	}

	private async appendSearchIndex(
		metadata: StoredSourceMetadata,
		text: string,
	): Promise<void> {
		if (this.searchIndexDisabled || this.searchIndexPromise === undefined)
			return;
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

	private discoveryEntries(
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

	private hasExactAccess(
		entry: StoredSourceMetadata,
		accessContext: StoreAccessContext,
	): boolean {
		if (accessContext.actor === "system") return true;
		if (accessContext.actor === "subagent")
			return accessContext.grantedSourceIds?.has(entry.sourceId) === true;
		return true;
	}

	private async findSource(
		sourceId: string,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
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

	private async readIndex(): Promise<StoredSourceMetadata[]> {
		await this.ensureRecovered();
		return (await this.readIndexReport()).entries;
	}

	private async readIndexReport(): Promise<IndexRead> {
		let raw = "";
		try {
			raw = await readFile(this.indexPath, "utf8");
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
			const metadata = parseStoredSourceMetadata(line, this.root);
			if (metadata === undefined) invalidIndexLineCount += 1;
			else entries.push(metadata);
		}
		return { entries, indexLineCount, invalidIndexLineCount };
	}
}
