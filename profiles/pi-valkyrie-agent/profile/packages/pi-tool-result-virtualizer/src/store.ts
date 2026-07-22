import { createHash, randomBytes } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { StoreLimits } from "./config.ts";
import { inspectStoreConsistency } from "./diagnostics.ts";
import { StoreJournal, type JournalTransaction } from "./journal.ts";
import type {
	CaptureClassification,
	CaptureProvenance,
	CaptureScope,
	ScopeFailure,
} from "./provenance.ts";
import { SearchCoordinator } from "./search-coordinator.ts";
import {
	StoreCatalog,
	countLines,
	searchSources,
	splitLinesWithEndings,
} from "./store-catalog.ts";
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

export class ToolResultStore {
	readonly root: string;
	readonly sourcesDir: string;
	readonly indexPath: string;
	private readonly journal: StoreJournal;
	private readonly writeLock: StoreWriteLock;
	private readonly limits: StoreLimits;
	private readonly failureInjector: StoreFailureInjector | undefined;
	private readonly catalog: StoreCatalog;
	private readonly searchCoordinator: SearchCoordinator;
	private recoveryPromise: Promise<void> | undefined;
	private writeQueue: Promise<void> = Promise.resolve();

	constructor(root: string, options: ToolResultStoreOptions = {}) {
		this.root = root;
		this.sourcesDir = join(root, SOURCES_DIR);
		this.indexPath = join(root, INDEX_FILE);
		this.journal = new StoreJournal(root);
		this.writeLock = new StoreWriteLock(root);
		this.limits = options.limits ?? {};
		this.failureInjector = options.failureInjector;
		const searchIndexFactory = options.searchIndexFactory ?? SearchIndex.create;
		this.catalog = new StoreCatalog({
			root: this.root,
			sourcesDir: this.sourcesDir,
			detailsDir: join(root, DETAILS_DIR),
			indexPath: this.indexPath,
			recover: () => this.ensureRecovered(),
		});
		this.searchCoordinator = new SearchCoordinator(
			this.root,
			searchIndexFactory,
		);
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
			await this.searchCoordinator.append(metadata, input.text);
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
		const entries = this.catalog.discoveryEntries(
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
		const entries = this.catalog.discoveryEntries(index.entries, accessContext);
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
			visibleEntries: this.catalog.discoveryEntries(
				index.entries,
				accessContext,
			),
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
		const entries = this.catalog.discoveryEntries(
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
		const metadata = await this.catalog.findSource(sourceId, accessContext);
		const text = await readFile(metadata.textPath, "utf8");
		return { metadata, text };
	}

	getSourceMetadata(
		sourceId: string,
		accessContext: StoreAccessContext = SYSTEM_ACCESS,
	): Promise<StoredSourceMetadata> {
		return this.catalog.findSource(sourceId, accessContext);
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
				[await this.catalog.findSource(options.sourceId, accessContext)],
				limit,
				contextLines,
				lineStart,
				lineLimit,
			);
		if (options.sourceIds !== undefined) {
			const sources: StoredSourceMetadata[] = [];
			for (const sourceId of options.sourceIds)
				sources.push(await this.catalog.findSource(sourceId, accessContext));
			return searchSources(
				query,
				sources,
				limit,
				contextLines,
				lineStart,
				lineLimit,
			);
		}
		const entries = this.catalog.discoveryEntries(
			await this.readIndex(),
			accessContext,
		);
		const indexedCandidates = await this.searchCoordinator.candidateSources(
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

	private async ensurePrivateRoot(): Promise<void> {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		await chmod(this.root, 0o700);
	}

	private readIndex(): Promise<StoredSourceMetadata[]> {
		return this.catalog.readIndex();
	}

	private readIndexReport() {
		return this.catalog.readIndexReport();
	}
}
