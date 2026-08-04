import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { mapConcurrent, resolveEffectiveConcurrency } = await loadTs("../../src/runs/shared/parallel-utils.ts");

async function measureMapConcurrent(limit) {
	let active = 0;
	let maxActive = 0;
	const results = await mapConcurrent([1, 2, 3, 4], limit, async (value) => {
		active++;
		maxActive = Math.max(maxActive, active);
		await Promise.resolve();
		active--;
		return value * 10;
	});
	return { results, maxActive };
}

test("mapConcurrent preserves output order while respecting the local limit", async () => {
	const { results, maxActive } = await measureMapConcurrent(2);

	assert.deepEqual(results, [10, 20, 30, 40]);
	assert.equal(maxActive, 2);
});

test("mapConcurrent coerces local limits below one to one", async () => {
	const { maxActive } = await measureMapConcurrent(0);

	assert.equal(maxActive, 1);
});

test("effective concurrency clamps local concurrency by global cap", () => {
	assert.equal(resolveEffectiveConcurrency(4, 2), 2);
	assert.equal(resolveEffectiveConcurrency(2, 4), 2);
	assert.equal(resolveEffectiveConcurrency(4, undefined), 4);
	assert.equal(resolveEffectiveConcurrency(0, 3), 1);
	assert.equal(resolveEffectiveConcurrency(4, 0), 1);
});
