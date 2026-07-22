import assert from "node:assert/strict";
import {
	chmod,
	mkdir,
	readdir,
	readFile,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";

import { ToolResultStore } from "../src/store.ts";
import { makeStore, supportsFts5Trigram } from "./test-helpers.ts";

test("store returns exact line windows and cited search matches", async () => {
	const { store } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "search_call",
		text: "alpha\nbeta needle\ngamma\nneedle delta\n",
		captureStatus: "event.content",
	});

	const window = await store.getLineWindow(stored.sourceId, {
		lineStart: 2,
		lineLimit: 2,
	});
	assert.equal(window.text, "beta needle\ngamma\n");
	assert.equal(window.startLine, 2);
	assert.equal(window.endLine, 3);

	const matches = await store.search("needle", { limit: 3, contextLines: 0 });
	assert.deepEqual(
		matches.map((match) => ({
			sourceId: match.sourceId,
			lineNumber: match.lineNumber,
			line: match.line,
		})),
		[
			{ sourceId: stored.sourceId, lineNumber: 2, line: "beta needle" },
			{ sourceId: stored.sourceId, lineNumber: 4, line: "needle delta" },
		],
	);

	const raw = await readFile(stored.textPath, "utf8");
	assert.equal(raw, "alpha\nbeta needle\ngamma\nneedle delta\n");
});

test("store searches bounded ranges across explicit sources with one global limit", async () => {
	const { store } = await makeStore();
	const first = await store.storeSource({
		toolName: "bash",
		text: "outside needle\nfirst context\nfirst needle\nfirst tail\n",
		captureStatus: "event.content",
	});
	const second = await store.storeSource({
		toolName: "read",
		text: "second head\nsecond context\nsecond needle\nsecond tail\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("needle", {
		sourceIds: [first.sourceId, second.sourceId],
		lineStart: 2,
		lineLimit: 2,
		limit: 5,
		contextLines: 1,
	});
	assert.deepEqual(
		matches.map((match) => ({
			sourceId: match.sourceId,
			lineNumber: match.lineNumber,
			contextStartLine: match.contextStartLine,
			contextEndLine: match.contextEndLine,
			context: match.context,
		})),
		[
			{
				sourceId: first.sourceId,
				lineNumber: 3,
				contextStartLine: 2,
				contextEndLine: 3,
				context: "first context\nfirst needle\n",
			},
			{
				sourceId: second.sourceId,
				lineNumber: 3,
				contextStartLine: 2,
				contextEndLine: 3,
				context: "second context\nsecond needle\n",
			},
		],
	);

	const limited = await store.search("needle", {
		sourceIds: [first.sourceId, second.sourceId],
		limit: 1,
		contextLines: 0,
	});
	assert.deepEqual(
		limited.map((match) => match.sourceId),
		[first.sourceId],
	);
	await assert.rejects(
		store.search("needle", {
			sourceIds: Array.from({ length: 11 }, () => first.sourceId),
		}),
		/sourceIds.*at most 10/i,
	);
	await assert.rejects(
		store.search("needle", {
			sourceId: first.sourceId,
			sourceIds: [second.sourceId],
		}),
		/sourceId.*sourceIds.*not both/i,
	);
});

test("store searches recent sources first when sourceId is omitted", async () => {
	const { store } = await makeStore();
	const oldSource = await store.storeSource({
		toolName: "bash",
		toolCallId: "old_search_call",
		text: "needle from old source\n",
		captureStatus: "event.content",
	});
	const recentSource = await store.storeSource({
		toolName: "bash",
		toolCallId: "recent_search_call",
		text: "needle from recent source\n",
		captureStatus: "event.content",
	});

	const broadMatches = await store.search("needle", {
		limit: 1,
		contextLines: 0,
	});
	assert.deepEqual(
		broadMatches.map((match) => ({
			sourceId: match.sourceId,
			line: match.line,
		})),
		[{ sourceId: recentSource.sourceId, line: "needle from recent source" }],
	);

	const restrictedMatches = await store.search("needle", {
		sourceId: oldSource.sourceId,
		limit: 1,
		contextLines: 0,
	});
	assert.deepEqual(
		restrictedMatches.map((match) => ({
			sourceId: match.sourceId,
			line: match.line,
		})),
		[{ sourceId: oldSource.sourceId, line: "needle from old source" }],
	);
});

test("broad store search builds an FTS candidate index without changing newest-first matches", async () => {
	if (!(await supportsFts5Trigram())) return;
	const { store, dir } = await makeStore();
	const oldSource = await store.storeSource({
		toolName: "bash",
		toolCallId: "old_fts_search_call",
		text: "needle from old source\n",
		captureStatus: "event.content",
	});
	const recentSource = await store.storeSource({
		toolName: "bash",
		toolCallId: "recent_fts_search_call",
		text: "needle from recent source\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("needle", { limit: 2, contextLines: 0 });

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[
			{ sourceId: recentSource.sourceId, line: "needle from recent source" },
			{ sourceId: oldSource.sourceId, line: "needle from old source" },
		],
	);
	assert.equal(
		(await stat(join(dir, "search-index.sqlite"))).mode & 0o777,
		0o600,
	);
});

test("short broad store searches keep the linear fallback without creating an FTS index", async () => {
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "short_query_search_call",
		text: "xy from short query\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("xy", { limit: 1, contextLines: 0 });

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[{ sourceId: stored.sourceId, line: "xy from short query" }],
	);
	await assert.rejects(() => stat(join(dir, "search-index.sqlite")), {
		code: "ENOENT",
	});
});

test("non-ASCII broad store searches keep the linear fallback without creating an FTS index", async () => {
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "unicode_query_search_call",
		text: "İstanbul token\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("i̇stanbul", { limit: 1, contextLines: 0 });

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[{ sourceId: stored.sourceId, line: "İstanbul token" }],
	);
	await assert.rejects(() => stat(join(dir, "search-index.sqlite")), {
		code: "ENOENT",
	});
});

test("broad store searches fall back to linear scan when SQLite indexing is unavailable", async () => {
	const { dir } = await makeStore();
	const store = new ToolResultStore(dir, {
		searchIndexFactory: async () => undefined,
	});
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "unavailable_fts_search_call",
		text: "needle survives unavailable sqlite\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("needle", { limit: 1, contextLines: 0 });

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[{ sourceId: stored.sourceId, line: "needle survives unavailable sqlite" }],
	);
	await assert.rejects(() => stat(join(dir, "search-index.sqlite")), {
		code: "ENOENT",
	});
});

test("broad FTS candidate search escapes query syntax before exact line scanning", async () => {
	if (!(await supportsFts5Trigram())) return;
	const { store, dir } = await makeStore();
	await chmod(dir, 0o755);
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "quoted_fts_search_call",
		text: 'alpha "beta" gamma\n',
		captureStatus: "event.content",
	});

	const matches = await store.search('alpha "beta"', {
		limit: 1,
		contextLines: 0,
	});

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[{ sourceId: stored.sourceId, line: 'alpha "beta" gamma' }],
	);
	assert.equal((await stat(dir)).mode & 0o777, 0o700);
	const dbPath = join(dir, "search-index.sqlite");
	assert.equal((await stat(dbPath)).mode & 0o777, 0o600);
	const sqlite = await import("node:sqlite");
	const db = new sqlite.DatabaseSync(dbPath);
	try {
		const version = db.prepare("PRAGMA user_version").get()?.user_version;
		const columns = db
			.prepare("PRAGMA table_info(indexed_sources)")
			.all()
			.map((row) => row.name);
		assert.equal(version, 2);
		assert.deepEqual(columns, ["id", "source_id", "sha256"]);
	} finally {
		db.close();
	}
	await assert.rejects(() => stat(join(dir, "search-index.sqlite-wal")), {
		code: "ENOENT",
	});
	await assert.rejects(() => stat(join(dir, "search-index.sqlite-shm")), {
		code: "ENOENT",
	});
});

test("broad FTS candidate search preserves exact line context and first-hit columns", async () => {
	if (!(await supportsFts5Trigram())) return;
	const { store } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "context_fts_search_call",
		text: "before\nneedle then needle again\nafter\n",
		captureStatus: "event.content",
	});

	const matches = await store.search("needle", { limit: 3, contextLines: 1 });

	assert.equal(matches.length, 1);
	assert.deepEqual(
		matches.map((match) => ({
			sourceId: match.sourceId,
			lineNumber: match.lineNumber,
			contextStartLine: match.contextStartLine,
			contextEndLine: match.contextEndLine,
			matchStartColumn: match.matchStartColumn,
			matchEndColumn: match.matchEndColumn,
			context: match.context,
		})),
		[
			{
				sourceId: stored.sourceId,
				lineNumber: 2,
				contextStartLine: 1,
				contextEndLine: 3,
				matchStartColumn: 0,
				matchEndColumn: 6,
				context: "before\nneedle then needle again\nafter\n",
			},
		],
	);
});

test("broad search falls back to linear scan when the FTS sidecar is unreadable", async () => {
	if (!(await supportsFts5Trigram())) return;
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "corrupt_fts_search_call",
		text: "needle survives corrupt sqlite sidecar\n",
		captureStatus: "event.content",
	});
	await writeFile(join(dir, "search-index.sqlite"), "not a sqlite database", {
		mode: 0o600,
	});

	const matches = await store.search("needle", { limit: 1, contextLines: 0 });

	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[
			{
				sourceId: stored.sourceId,
				line: "needle survives corrupt sqlite sidecar",
			},
		],
	);
});

test("store skips malformed index rows while preserving valid sources", async () => {
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "malformed_index_valid_source",
		text: "needle survives malformed index rows\n",
		captureStatus: "event.content",
	});
	await writeFile(
		join(dir, "index.jsonl"),
		[
			"{malformed json}",
			JSON.stringify(stored),
			JSON.stringify({ sourceId: stored.sourceId, toolName: "bash" }),
			"",
		].join("\n"),
		{ encoding: "utf8", mode: 0o600 },
	);

	assert.deepEqual(
		(await store.listSources()).map((source) => source.sourceId),
		[stored.sourceId],
	);
	const stats = await store.getStats();
	assert.equal(stats.invalidIndexLineCount, 2);
	assert.equal(stats.indexLineCount, 3);
	assert.equal(
		(await store.readSource(stored.sourceId)).text,
		"needle survives malformed index rows\n",
	);
	const matches = await store.search("needle", { limit: 1, contextLines: 0 });
	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[
			{
				sourceId: stored.sourceId,
				line: "needle survives malformed index rows",
			},
		],
	);
});

test("store rejects poisoned index paths outside managed sidecar directories", async () => {
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "poisoned_index_valid_source",
		text: "valid needle source\n",
		captureStatus: "event.content",
		originalDetailsText: JSON.stringify({ valid: true }),
	});
	const outsideSecret = join(dir, "outside-secret.txt");
	await writeFile(outsideSecret, "POISONED_INDEX_SECRET needle\n", "utf8");
	await writeFile(
		join(dir, "index.jsonl"),
		[
			JSON.stringify({
				...stored,
				sourceId: "tr_poison_text",
				textPath: outsideSecret,
			}),
			JSON.stringify({
				...stored,
				sourceId: "tr_poison_details",
				originalDetailsPath: outsideSecret,
				originalDetailsByteCount: 29,
				originalDetailsSha256: "fake",
			}),
			JSON.stringify(stored),
		].join("\n") + "\n",
		{ encoding: "utf8", mode: 0o600 },
	);

	assert.deepEqual(
		(await store.listSources()).map((source) => source.sourceId),
		[stored.sourceId],
	);
	const stats = await store.getStats();
	assert.equal(stats.invalidIndexLineCount, 2);
	await assert.rejects(
		() => store.getLineWindow("tr_poison_text"),
		/Unknown tool-result source/,
	);
	await assert.rejects(
		() => store.readSource("tr_poison_details"),
		/Unknown tool-result source/,
	);
	const matches = await store.search("POISONED_INDEX_SECRET", {
		limit: 1,
		contextLines: 0,
	});
	assert.deepEqual(matches, []);
});

test("store previews retention candidates without deleting stored sources", async () => {
	const { store } = await makeStore();
	const originalDetailsText = JSON.stringify({
		matches: Array.from({ length: 12 }, (_unused, index) => ({
			tool: `old_tool_${index}`,
		})),
	});
	const oldSource = await store.storeSource({
		toolName: "bash",
		text: "old source\n",
		captureStatus: "event.content",
		originalDetailsText,
	});
	const recentSource = await store.storeSource({
		toolName: "bash",
		text: "recent source\n",
		captureStatus: "event.content",
	});

	const stats = await store.getStats(2);
	assert.equal(
		stats.totalOriginalDetailsBytes,
		Buffer.byteLength(originalDetailsText, "utf8"),
	);
	assert.equal(
		stats.totalStoredBytes,
		stats.totalBytes + stats.totalOriginalDetailsBytes,
	);

	const preview = await store.previewRetention({ maxSources: 1 });

	assert.equal(preview.sourceCount, 2);
	assert.equal(preview.candidateCount, 1);
	assert.equal(
		preview.candidateDetailsBytes,
		Buffer.byteLength(originalDetailsText, "utf8"),
	);
	assert.equal(
		preview.candidateStoredBytes,
		preview.candidateBytes + preview.candidateDetailsBytes,
	);
	assert.deepEqual(
		preview.candidates.map((candidate) => candidate.sourceId),
		[oldSource.sourceId],
	);
	assert.equal(preview.keptSourceIds.includes(recentSource.sourceId), true);
	assert.equal(
		(await store.readSource(oldSource.sourceId)).text,
		"old source\n",
	);
});

test("broad search rebuilds FTS sidecar when FTS rows are missing", async () => {
	if (!(await supportsFts5Trigram())) return;
	const { store, dir } = await makeStore();
	const stored = await store.storeSource({
		toolName: "bash",
		toolCallId: "missing_fts_row_search_call",
		text: "needle survives missing fts row\n",
		captureStatus: "event.content",
	});
	assert.equal(
		(await store.search("needle", { limit: 1, contextLines: 0 })).length,
		1,
	);

	const sqlite = await import("node:sqlite");
	const db = new sqlite.DatabaseSync(join(dir, "search-index.sqlite"));
	try {
		db.exec("DROP TABLE sources_fts");
		db.exec(
			"CREATE VIRTUAL TABLE sources_fts USING fts5(text, content='', tokenize='trigram')",
		);
	} finally {
		db.close();
	}

	const matches = await store.search("needle", { limit: 1, contextLines: 0 });
	assert.deepEqual(
		matches.map((match) => ({ sourceId: match.sourceId, line: match.line })),
		[{ sourceId: stored.sourceId, line: "needle survives missing fts row" }],
	);
});

test("store writes sidecar files with owner-only permissions", async () => {
	const { store, dir } = await makeStore();
	await chmod(dir, 0o755);
	const stored = await store.storeSource({
		toolName: "bash",
		text: "private source\n",
		captureStatus: "event.content",
		originalDetailsText: JSON.stringify({ secretLike: "private details" }),
	});
	assert.ok(stored.originalDetailsPath);

	assert.equal((await stat(dir)).mode & 0o777, 0o700);
	assert.equal((await stat(dirname(stored.textPath))).mode & 0o777, 0o700);
	assert.equal((await stat(stored.textPath)).mode & 0o777, 0o600);
	assert.equal((await stat(stored.originalDetailsPath)).mode & 0o777, 0o600);
});

test("store rolls back just-written sidecar files when index append fails", async () => {
	const { store, dir } = await makeStore();
	await mkdir(join(dir, "index.jsonl"));

	await assert.rejects(
		() =>
			store.storeSource({
				toolName: "bash",
				text: "orphan source\n",
				captureStatus: "event.content",
				originalDetailsText: JSON.stringify({ secretLike: "orphan details" }),
			}),
		/illegal operation|EISDIR|directory/i,
	);

	await assert.rejects(readdir(join(dir, "sources")), { code: "ENOENT" });
	await assert.rejects(readdir(join(dir, "details")), { code: "ENOENT" });
});
