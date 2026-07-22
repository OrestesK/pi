import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { createCompletionBatcher } = await loadTs("../../src/runs/background/completion-batcher.ts");

function makeTimers() {
	const scheduled = [];
	return {
		scheduled,
		timers: {
			setTimeout(handler, delayMs) {
				const timer = { handler, delayMs, cleared: false };
				scheduled.push(timer);
				return timer;
			},
			clearTimeout(timer) {
				timer.cleared = true;
			},
		},
		activeDelays() {
			return scheduled.filter((timer) => !timer.cleared).map((timer) => timer.delayMs).sort((a, b) => a - b);
		},
		runDelay(delayMs) {
			const timer = scheduled.find((candidate) => !candidate.cleared && candidate.delayMs === delayMs);
			assert.ok(timer, `expected active timer with delay ${delayMs}`);
			timer.cleared = true;
			timer.handler();
		},
	};
}

const config = {
	enabled: true,
	debounceMs: 100,
	maxWaitMs: 250,
	stragglerDebounceMs: 10,
	stragglerMaxWaitMs: 50,
	stragglerWindowMs: 500,
};

test("completion batcher emits pending items at max wait", () => {
	const clock = makeTimers();
	const emitted = [];
	const batcher = createCompletionBatcher({
		config: { ...config, debounceMs: 100, maxWaitMs: 25 },
		timers: clock.timers,
		emit: (items) => emitted.push(items),
		now: () => 1000,
	});

	batcher.push("alpha");
	batcher.push("beta");

	assert.deepEqual(clock.activeDelays(), [25, 100]);
	clock.runDelay(25);

	assert.deepEqual(emitted, [["alpha", "beta"]]);
	assert.deepEqual(clock.activeDelays(), []);
});

test("completion batcher uses straggler timers after a recent emit", () => {
	const clock = makeTimers();
	const emitted = [];
	let now = 1000;
	const batcher = createCompletionBatcher({
		config,
		timers: clock.timers,
		emit: (items) => emitted.push(items),
		now: () => now,
	});

	batcher.push("first");
	assert.deepEqual(clock.activeDelays(), [100, 250]);
	now = 1100;
	clock.runDelay(100);
	assert.deepEqual(emitted, [["first"]]);

	now = 1200;
	batcher.push("late");
	assert.deepEqual(clock.activeDelays(), [10, 50]);
	clock.runDelay(10);

	assert.deepEqual(emitted, [["first"], ["late"]]);
	assert.deepEqual(clock.activeDelays(), []);
});

test("completion batcher stops using straggler timers after the straggler window", () => {
	const clock = makeTimers();
	const emitted = [];
	let now = 1000;
	const batcher = createCompletionBatcher({
		config,
		timers: clock.timers,
		emit: (items) => emitted.push(items),
		now: () => now,
	});

	batcher.push("first");
	now = 1100;
	clock.runDelay(100);

	now = 2000;
	batcher.push("later");

	assert.deepEqual(clock.activeDelays(), [100, 250]);
});
