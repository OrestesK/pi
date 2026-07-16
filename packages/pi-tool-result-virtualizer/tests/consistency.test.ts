import assert from "node:assert/strict";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

import { StoreJournal } from "../src/journal.ts";
import { ToolResultStore } from "../src/store.ts";

test("consistency diagnostics report a clean committed store", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-consistency-clean-"));
	const store = new ToolResultStore(root);
	await store.storeSource({
		toolName: "read",
		text: "evidence\n",
		captureStatus: "event.content",
	});

	const report = await store.diagnoseConsistency();
	assert.equal(report.healthy, true);
	assert.equal(report.validSourceCount, 1);
	assert.equal(report.hashMismatchCount, 0);
	assert.equal(report.detailsHashMismatchCount, 0);
	assert.equal(report.scopeKeyUnavailable, false);
	assert.equal(report.ftsStatus, "missing");
	assert.equal(report.footprint.sourceBytes, Buffer.byteLength("evidence\n"));
	assert.equal(report.quota.maxSources, undefined);
	assert.equal(report.quota.maxStoredBytes, undefined);
	assert.deepEqual(report.issues, []);
});

test("consistency diagnostics expose corruption without mutating it", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-consistency-broken-"));
	const store = new ToolResultStore(root);
	const stored = await store.storeSource({
		toolName: "read",
		text: "committed\n",
		captureStatus: "event.content",
		originalDetailsText: JSON.stringify({ retained: true }),
	});
	await unlink(stored.textPath);
	assert.ok(stored.originalDetailsPath);
	await unlink(stored.originalDetailsPath);
	const orphanSource = join(root, "sources", "tr_orphan_1234abcd.txt");
	const orphanDetails = join(root, "details", "tr_orphan_1234abcd.json");
	await writeFile(orphanSource, "orphan\n", { mode: 0o600 });
	await writeFile(orphanDetails, "{}\n", { mode: 0o600 });
	await writeFile(join(root, "index.jsonl"), "not-json\n", {
		flag: "a",
		mode: 0o600,
	});
	await mkdir(join(root, "transactions"), { recursive: true, mode: 0o700 });
	const invalidJournal = join(root, "transactions", "invalid.json");
	await writeFile(invalidJournal, "not-json\n", { mode: 0o600 });

	const report = await store.diagnoseConsistency();
	assert.equal(report.healthy, false);
	assert.equal(report.invalidIndexLineCount, 1);
	assert.equal(report.missingSourceFileCount, 1);
	assert.equal(report.missingDetailsFileCount, 1);
	assert.equal(report.orphanSourceFileCount, 1);
	assert.equal(report.orphanDetailsFileCount, 1);
	assert.equal(report.invalidJournalCount, 1);
	assert.deepEqual(
		report.issues.map((issue) => issue.code),
		[
			"invalid_index_lines",
			"missing_source_file",
			"missing_details_file",
			"orphan_source_file",
			"orphan_details_file",
			"invalid_journal",
		],
	);

	await Promise.all([
		access(orphanSource),
		access(orphanDetails),
		access(invalidJournal),
	]);
});

test("consistency diagnostics report a valid pending journal without mutation", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-consistency-pending-"));
	const transaction = await new StoreJournal(root).begin(
		"tr_pending_1234abcd",
		false,
	);
	await writeFile(transaction.stagedSourcePath, "pending evidence\n", {
		mode: 0o600,
	});
	const journalBefore = await readFile(transaction.journalPath, "utf8");

	const report = await new ToolResultStore(root).diagnoseConsistency();
	assert.equal(report.healthy, false);
	assert.equal(report.pendingTransactionCount, 1);
	assert.deepEqual(
		report.issues.map((issue) => issue.code),
		["pending_transaction"],
	);
	assert.equal(await readFile(transaction.journalPath, "utf8"), journalBefore);
	assert.equal(
		await readFile(transaction.stagedSourcePath, "utf8"),
		"pending evidence\n",
	);
});

test("consistency diagnostics report hash, scope-key, FTS, footprint, and quota divergence without repair", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-consistency-complete-"));
	const store = new ToolResultStore(root, {
		limits: { maxSources: 3, maxStoredBytes: 10_000 },
	});
	await writeFile(join(root, "scope.key"), Buffer.alloc(32, 7), {
		mode: 0o600,
	});
	const stored = await store.storeSource({
		toolName: "read",
		text: "original searchable evidence\n",
		captureStatus: "event.content",
		originalDetailsText: '{"original":true}\n',
		provenance: {
			scope: "project",
			projectId: "a".repeat(64),
			classification: "unclassified-local",
		},
	});
	await store.search("searchable");
	assert.ok(stored.originalDetailsPath);
	await writeFile(stored.textPath, "tampered source\n");
	await writeFile(stored.originalDetailsPath, '{"tampered":true}\n');
	await unlink(join(root, "scope.key"));
	const searchIndexPath = join(root, "search-index.sqlite");
	const db = new DatabaseSync(searchIndexPath);
	db.prepare(
		"INSERT INTO sources_fts(sources_fts, rowid, text) VALUES('delete', ?, ?)",
	).run(1, "original searchable evidence\n");
	db.close();

	const report = await store.diagnoseConsistency();
	assert.equal(report.healthy, false);
	assert.equal(report.hashMismatchCount, 1);
	assert.equal(report.detailsHashMismatchCount, 1);
	assert.equal(report.scopeKeyUnavailable, true);
	assert.equal(report.ftsStatus, "mismatch");
	assert.equal(report.ftsMismatchCount, 1);
	assert.equal(
		report.footprint.sourceBytes,
		Buffer.byteLength("tampered source\n"),
	);
	assert.equal(
		report.footprint.detailsBytes,
		Buffer.byteLength('{"tampered":true}\n'),
	);
	assert.ok(report.footprint.indexBytes > 0);
	assert.ok(report.footprint.ftsBytes > 0);
	assert.equal(report.quota.maxSources, 3);
	assert.equal(report.quota.maxStoredBytes, 10_000);
	assert.equal(report.quota.currentSources, 1);
	assert.deepEqual(
		report.issues.map((issue) => issue.code),
		[
			"source_hash_mismatch",
			"details_hash_mismatch",
			"scope_key_unavailable",
			"fts_mismatch",
		],
	);

	assert.equal(await readFile(stored.textPath, "utf8"), "tampered source\n");
	const verificationDb = new DatabaseSync(searchIndexPath, { readOnly: true });
	const ftsCount = verificationDb
		.prepare("SELECT count(*) AS count FROM sources_fts")
		.get() as { count: number };
	verificationDb.close();
	assert.equal(ftsCount.count, 0);
});
