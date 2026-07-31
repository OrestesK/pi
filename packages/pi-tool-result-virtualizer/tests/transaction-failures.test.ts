import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { StoreJournal } from "../src/journal.ts";
import { type StoreFailurePoint, ToolResultStore } from "../src/store.ts";

async function files(path: string): Promise<string[]> {
	try {
		return (await readdir(path)).sort((left, right) =>
			left.localeCompare(right),
		);
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT")
			return [];
		throw error;
	}
}

const PRE_COMMIT_FAILURES: Array<{
	point: StoreFailurePoint;
	preservedSourceCount: number;
	preservedDetailsCount: number;
}> = [
	{
		point: "afterAdmission",
		preservedSourceCount: 0,
		preservedDetailsCount: 0,
	},
	{ point: "afterJournal", preservedSourceCount: 0, preservedDetailsCount: 0 },
	{
		point: "afterDetailsStage",
		preservedSourceCount: 0,
		preservedDetailsCount: 0,
	},
	{
		point: "afterSourceStage",
		preservedSourceCount: 0,
		preservedDetailsCount: 0,
	},
	{
		point: "afterDetailsPromotion",
		preservedSourceCount: 0,
		preservedDetailsCount: 1,
	},
	{
		point: "afterSourcePromotion",
		preservedSourceCount: 1,
		preservedDetailsCount: 1,
	},
	{
		point: "beforeMetadataAppend",
		preservedSourceCount: 1,
		preservedDetailsCount: 1,
	},
];

for (const scenario of PRE_COMMIT_FAILURES) {
	test(`pre-commit failure at ${scenario.point} is not retrievable and preserves promoted evidence`, async () => {
		const root = await mkdtemp(
			join(tmpdir(), `pi-trv-failure-${scenario.point}-`),
		);
		const store = new ToolResultStore(root, {
			async failureInjector(point) {
				if (point !== scenario.point) return;
				if (point === "beforeMetadataAppend") {
					await writeFile(join(root, "index.jsonl"), "{partial", {
						flag: "a",
						mode: 0o600,
					});
				}
				throw new Error(`injected ${point}`);
			},
		});

		await assert.rejects(
			store.storeSource({
				toolName: "read",
				text: "source evidence\n",
				captureStatus: "event.content",
				originalDetailsText: '{"detail":true}\n',
			}),
			(error: unknown) =>
				error instanceof Error &&
				error.message === `injected ${scenario.point}`,
		);

		const restarted = new ToolResultStore(root);
		assert.deepEqual(await restarted.listSources(10), []);
		assert.equal(
			(await files(join(root, "sources"))).length,
			scenario.preservedSourceCount,
		);
		assert.equal(
			(await files(join(root, "details"))).length,
			scenario.preservedDetailsCount,
		);
		assert.deepEqual(
			(await files(join(root, "transactions"))).filter((name) =>
				name.endsWith(".json"),
			),
			[],
		);
		if (scenario.point === "beforeMetadataAppend") {
			const next = await restarted.storeSource({
				toolName: "read",
				text: "next evidence\n",
				captureStatus: "event.content",
			});
			assert.equal(
				(await restarted.listSources(10))[0]?.sourceId,
				next.sourceId,
			);
		}
	});
}

for (const failurePoint of [
	"beforeOccurrenceAppend",
	"afterOccurrenceAppend",
	"afterMetadataAppend",
] as const) {
	test(`post-commit failure at ${failurePoint} leaves the committed source retrievable after restart`, async () => {
		const root = await mkdtemp(
			join(tmpdir(), `pi-trv-failure-${failurePoint}-`),
		);
		const store = new ToolResultStore(root, {
			failureInjector(point) {
				if (point === failurePoint) throw new Error(`injected ${failurePoint}`);
			},
		});
		const stored = await store.storeSource({
			toolName: "read",
			text: "committed searchable evidence\n",
			captureStatus: "event.content",
		});

		const restarted = new ToolResultStore(root);
		assert.equal(
			(await restarted.readSource(stored.sourceId)).text,
			"committed searchable evidence\n",
		);
		assert.equal(
			(await restarted.search("searchable")).some(
				(match) => match.sourceId === stored.sourceId,
			),
			true,
		);
	});
}

test("v1 journal transactions remain recoverable", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-v1-journal-"));
	const journal = new StoreJournal(root);
	const transaction = await journal.begin("tr_" + "a".repeat(64), false);
	await writeFile(transaction.stagedSourcePath, "staged\n", { mode: 0o600 });
	const v1 = JSON.parse(await readFile(transaction.journalPath, "utf8")) as Record<string, unknown>;
	v1.ownerPid = 999_999;
	await writeFile(transaction.journalPath, JSON.stringify(v1), { mode: 0o600 });
	const restarted = new ToolResultStore(root);
	assert.deepEqual(await restarted.listSources(), []);
	await assert.rejects(() => stat(transaction.journalPath), { code: "ENOENT" });
});

test("committed v2 occurrence replays exactly once after restart", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-v2-occurrence-"));
	const store = new ToolResultStore(root);
	const stored = await store.storeSource({
		toolName: "read", text: "committed\n", captureStatus: "event.content",
	});
	const journal = new StoreJournal(root);
	const transaction = await journal.begin(stored.sourceId, false);
	const occurrence = { occurrenceId: "oc_replay", sourceId: stored.sourceId, createdAt: 1 };
	await journal.setOccurrence(transaction, occurrence);
	const v2 = JSON.parse(await readFile(transaction.journalPath, "utf8")) as Record<string, unknown>;
	v2.ownerPid = 999_999;
	await writeFile(transaction.journalPath, JSON.stringify(v2), { mode: 0o600 });
	const restarted = new ToolResultStore(root);
	await restarted.listSources();
	const recordPath = join(root, "occurrences", "records", "oc_replay.json");
	assert.deepEqual(JSON.parse(await readFile(recordPath, "utf8")), occurrence);
	await restarted.listSources();
	assert.equal((await readdir(join(root, "occurrences", "records"))).filter((name) => name === "oc_replay.json").length, 1);
});

test("duplicate occurrence details are admitted against maxStoredBytes", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-occurrence-quota-"));
	const projectId = "a".repeat(64);
	const initial = new ToolResultStore(root);
	await initial.storeSource({
		toolName: "read", text: "same\n", captureStatus: "event.content",
		provenance: { scope: "project", projectId, classification: "unclassified-local" },
	});
	const limit = (await initial.getStats()).totalStoredBytes + 100;
	const limited = new ToolResultStore(root, { limits: { maxStoredBytes: limit } });
	await assert.rejects(
		limited.storeSource({
			toolName: "read", text: "same\n", captureStatus: "event.content",
			originalDetailsText: "x".repeat(101),
			provenance: { scope: "project", projectId, classification: "unclassified-local" },
		}),
		/error.*maxStoredBytes|maxStoredBytes/i,
	);
});

test("legacy occurrence bytes are included in store totals", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-legacy-occurrence-"));
	const store = new ToolResultStore(root);
	const stored = await store.storeSource({ toolName: "read", text: "source\n", captureStatus: "event.content" });
	const before = (await store.getStats()).totalOccurrenceBytes;
	const detailsPath = join(root, "occurrences", "legacy.details.json");
	await writeFile(detailsPath, "legacy details\n", { mode: 0o600 });
	const legacy = { occurrenceId: "oc_legacy", sourceId: stored.sourceId, createdAt: 1, originalDetailsPath: detailsPath };
	await writeFile(join(root, "occurrences.jsonl"), `${JSON.stringify(legacy)}\n`, { mode: 0o600 });
	const stats = await store.getStats();
	assert.equal(stats.totalOccurrenceBytes - before, Buffer.byteLength(`${JSON.stringify(legacy)}\n`) + Buffer.byteLength("legacy details\n"));
});
