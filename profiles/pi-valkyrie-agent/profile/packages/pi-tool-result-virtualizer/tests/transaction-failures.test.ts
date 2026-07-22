import assert from "node:assert/strict";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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
	"afterMetadataAppend",
	"beforeFtsAppend",
	"afterFtsAppend",
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
