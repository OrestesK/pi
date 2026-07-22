import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

import type { StoreLimits } from "./config.ts";
import type { JournalInspection } from "./journal.ts";
import { SearchIndex } from "./search-index.ts";
import type {
	StoredSourceMetadata,
	StoreConsistencyIssue,
	StoreConsistencyIssueCode,
	StoreConsistencyReport,
	StoreFootprint,
	StoreQuotaState,
} from "./store.ts";

type StoreDiagnosticsInput = {
	root: string;
	sourcesDir: string;
	indexPath: string;
	allEntries: StoredSourceMetadata[];
	visibleEntries: StoredSourceMetadata[];
	indexLineCount: number;
	invalidIndexLineCount: number;
	journal: JournalInspection;
	limits: StoreLimits;
	recentLimit: number;
	includeGlobalState: boolean;
};

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

async function directoryFiles(path: string): Promise<string[]> {
	try {
		const entries = await readdir(path, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile())
			.map((entry) => join(path, entry.name));
	} catch (error) {
		if (isMissing(error)) return [];
		throw error;
	}
}

async function hashFile(path: string): Promise<string> {
	const hash = createHash("sha256");
	for await (const chunk of createReadStream(path)) hash.update(chunk);
	return hash.digest("hex");
}

async function fileByteCount(path: string): Promise<number> {
	try {
		const fileStats = await stat(path);
		return fileStats.isFile() ? fileStats.size : 0;
	} catch (error) {
		if (isMissing(error)) return 0;
		throw error;
	}
}

async function directoryByteCount(path: string): Promise<number> {
	let entries;
	try {
		entries = await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (isMissing(error)) return 0;
		throw error;
	}
	let total = 0;
	for (const entry of entries) {
		const entryPath = join(path, entry.name);
		if (entry.isFile()) total += await fileByteCount(entryPath);
		else if (entry.isDirectory()) total += await directoryByteCount(entryPath);
	}
	return total;
}

function sampleSourceIds(sourceIds: string[], limit = 5): string[] {
	return [...sourceIds]
		.sort((left, right) => left.localeCompare(right))
		.slice(0, limit);
}

function detailsByteCount(source: StoredSourceMetadata): number {
	return source.originalDetailsByteCount ?? 0;
}

export async function inspectStoreConsistency(
	input: StoreDiagnosticsInput,
): Promise<StoreConsistencyReport> {
	const detailsDir = join(input.root, "details");
	const ftsInspection = await SearchIndex.inspect(
		input.root,
		input.visibleEntries,
	);
	const fts =
		!input.includeGlobalState && ftsInspection.status === "missing"
			? { status: "healthy" as const, mismatchSourceIds: [] }
			: ftsInspection;
	const [sourceFiles, detailsFiles] = input.includeGlobalState
		? await Promise.all([
				directoryFiles(input.sourcesDir),
				directoryFiles(detailsDir),
			])
		: [[], []];
	const sourceIdCounts = new Map<string, number>();
	const visibleSourcePaths = new Map<string, StoredSourceMetadata>();
	const visibleDetailsPaths = new Map<string, StoredSourceMetadata>();
	const allSourcePaths = new Set<string>();
	const allDetailsPaths = new Set<string>();
	for (const entry of input.allEntries) {
		allSourcePaths.add(resolve(entry.textPath));
		if (entry.originalDetailsPath)
			allDetailsPaths.add(resolve(entry.originalDetailsPath));
	}
	for (const entry of input.visibleEntries) {
		sourceIdCounts.set(
			entry.sourceId,
			(sourceIdCounts.get(entry.sourceId) ?? 0) + 1,
		);
		visibleSourcePaths.set(resolve(entry.textPath), entry);
		if (entry.originalDetailsPath)
			visibleDetailsPaths.set(resolve(entry.originalDetailsPath), entry);
	}
	const duplicateSourceIds = [...sourceIdCounts]
		.filter(([, count]) => count > 1)
		.map(([sourceId]) => sourceId);
	const sourceChecks = await Promise.all(
		[...visibleSourcePaths].map(async ([path, entry]) => {
			if (!(await pathExists(path))) return { missing: entry.sourceId };
			return (await hashFile(path)) === entry.sha256
				? {}
				: { mismatch: entry.sourceId };
		}),
	);
	const detailsChecks = await Promise.all(
		[...visibleDetailsPaths].map(async ([path, entry]) => {
			if (!(await pathExists(path))) return { missing: entry.sourceId };
			if (!entry.originalDetailsSha256) return {};
			return (await hashFile(path)) === entry.originalDetailsSha256
				? {}
				: { mismatch: entry.sourceId };
		}),
	);
	const missingSourceIds = sourceChecks.flatMap((check) =>
		check.missing ? [check.missing] : [],
	);
	const hashMismatchIds = sourceChecks.flatMap((check) =>
		check.mismatch ? [check.mismatch] : [],
	);
	const missingDetailsIds = detailsChecks.flatMap((check) =>
		check.missing ? [check.missing] : [],
	);
	const detailsHashMismatchIds = detailsChecks.flatMap((check) =>
		check.mismatch ? [check.mismatch] : [],
	);
	const orphanSourceIds = sourceFiles
		.filter((path) => !allSourcePaths.has(resolve(path)))
		.map((path) => relative(input.sourcesDir, path).replace(/\.txt$/, ""));
	const orphanDetailsIds = detailsFiles
		.filter((path) => !allDetailsPaths.has(resolve(path)))
		.map((path) => relative(detailsDir, path).replace(/\.json$/, ""));
	let scopeKeyUnavailable = false;
	if (input.visibleEntries.some((entry) => entry.scope === "project")) {
		try {
			const scopeKeyStats = await stat(join(input.root, "scope.key"));
			scopeKeyUnavailable =
				!scopeKeyStats.isFile() || scopeKeyStats.size !== 32;
		} catch {
			scopeKeyUnavailable = true;
		}
	}
	let sourceBytes: number;
	let detailsBytes: number;
	let indexBytes: number;
	let ftsBytes: number;
	if (input.includeGlobalState) {
		const rootFiles = await directoryFiles(input.root);
		const ftsFiles = rootFiles.filter((path) =>
			relative(input.root, path).startsWith("search-index.sqlite"),
		);
		const measured = await Promise.all([
			directoryByteCount(input.sourcesDir),
			directoryByteCount(detailsDir),
			fileByteCount(input.indexPath),
			Promise.all(ftsFiles.map(fileByteCount)),
		]);
		[sourceBytes, detailsBytes, indexBytes] = measured;
		ftsBytes = measured[3].reduce((total, bytes) => total + bytes, 0);
	} else {
		const [visibleSourceSizes, visibleDetailsSizes] = await Promise.all([
			Promise.all([...visibleSourcePaths.keys()].map(fileByteCount)),
			Promise.all([...visibleDetailsPaths.keys()].map(fileByteCount)),
		]);
		sourceBytes = visibleSourceSizes.reduce((total, bytes) => total + bytes, 0);
		detailsBytes = visibleDetailsSizes.reduce(
			(total, bytes) => total + bytes,
			0,
		);
		indexBytes = 0;
		ftsBytes = 0;
	}
	const footprint: StoreFootprint = {
		scope: input.includeGlobalState ? "store" : "visible",
		sourceBytes,
		detailsBytes,
		indexBytes,
		ftsBytes,
		totalBytes: sourceBytes + detailsBytes + indexBytes + ftsBytes,
	};
	const quotaEntries = input.includeGlobalState
		? input.allEntries
		: input.visibleEntries;
	const currentStoredBytes = quotaEntries.reduce(
		(total, entry) => total + entry.byteCount + detailsByteCount(entry),
		0,
	);
	const quota: StoreQuotaState = {
		usageScope: input.includeGlobalState ? "store" : "visible",
		currentSources: quotaEntries.length,
		currentStoredBytes,
		sourceLimitExceeded:
			input.limits.maxSources !== undefined &&
			quotaEntries.length > input.limits.maxSources,
		storedBytesLimitExceeded:
			input.limits.maxStoredBytes !== undefined &&
			currentStoredBytes > input.limits.maxStoredBytes,
	};
	if (input.limits.maxSources !== undefined)
		quota.maxSources = input.limits.maxSources;
	if (input.limits.maxStoredBytes !== undefined)
		quota.maxStoredBytes = input.limits.maxStoredBytes;
	const issues: StoreConsistencyIssue[] = [];
	const addIssue = (
		code: StoreConsistencyIssueCode,
		count: number,
		sourceIds?: string[],
	): void => {
		if (count === 0) return;
		const issue: StoreConsistencyIssue = { code, count };
		if (sourceIds && sourceIds.length > 0)
			issue.sourceIds = sampleSourceIds(sourceIds);
		issues.push(issue);
	};
	const invalidIndexLineCount = input.includeGlobalState
		? input.invalidIndexLineCount
		: 0;
	const orphanSourceFileCount = input.includeGlobalState
		? orphanSourceIds.length
		: 0;
	const orphanDetailsFileCount = input.includeGlobalState
		? orphanDetailsIds.length
		: 0;
	const pendingTransactionCount = input.includeGlobalState
		? input.journal.pendingTransactionCount
		: 0;
	const invalidJournalCount = input.includeGlobalState
		? input.journal.invalidJournalCount
		: 0;
	addIssue("invalid_index_lines", invalidIndexLineCount);
	addIssue(
		"duplicate_source_id",
		duplicateSourceIds.length,
		duplicateSourceIds,
	);
	addIssue("missing_source_file", missingSourceIds.length, missingSourceIds);
	addIssue("missing_details_file", missingDetailsIds.length, missingDetailsIds);
	addIssue("source_hash_mismatch", hashMismatchIds.length, hashMismatchIds);
	addIssue(
		"details_hash_mismatch",
		detailsHashMismatchIds.length,
		detailsHashMismatchIds,
	);
	addIssue(
		"orphan_source_file",
		orphanSourceFileCount,
		input.includeGlobalState ? orphanSourceIds : undefined,
	);
	addIssue(
		"orphan_details_file",
		orphanDetailsFileCount,
		input.includeGlobalState ? orphanDetailsIds : undefined,
	);
	addIssue("pending_transaction", pendingTransactionCount);
	addIssue("invalid_journal", invalidJournalCount);
	addIssue("scope_key_unavailable", scopeKeyUnavailable ? 1 : 0);
	addIssue("fts_mismatch", fts.mismatchSourceIds.length, fts.mismatchSourceIds);
	addIssue("fts_unavailable", fts.status === "unavailable" ? 1 : 0);
	const recentLimit = Math.max(1, Math.min(Math.floor(input.recentLimit), 100));
	return {
		scope: input.includeGlobalState ? "store" : "visible",
		healthy: issues.length === 0,
		indexLineCount: input.includeGlobalState
			? input.indexLineCount
			: input.visibleEntries.length,
		validSourceCount: input.visibleEntries.length,
		invalidIndexLineCount,
		duplicateSourceIdCount: duplicateSourceIds.length,
		missingSourceFileCount: missingSourceIds.length,
		missingDetailsFileCount: missingDetailsIds.length,
		hashMismatchCount: hashMismatchIds.length,
		detailsHashMismatchCount: detailsHashMismatchIds.length,
		orphanSourceFileCount,
		orphanDetailsFileCount,
		pendingTransactionCount,
		invalidJournalCount,
		scopeKeyUnavailable,
		ftsStatus: fts.status,
		ftsMismatchCount: fts.mismatchSourceIds.length,
		footprint,
		quota,
		recentSources: [...input.visibleEntries].reverse().slice(0, recentLimit),
		issues,
	};
}
