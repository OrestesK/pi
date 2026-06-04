import assert from "node:assert/strict";
import { test } from "node:test";
import {
	createInitialState,
	reduceState,
	restoreStateFromEntries,
	serializeState,
} from "../src/state.ts";
import { STATE_CUSTOM_TYPE, type CustomSessionEntry } from "../src/types.ts";

test("creates running state with configured budgets", () => {
	const state = createInitialState({
		objective: "ship the feature",
		cwd: "/tmp/project",
		sessionId: "session-1",
		now: "2026-06-03T00:00:00.000Z",
		maxIterations: 7,
		maxNoProgressTurns: 3,
		maxWallClockMs: 60_000,
	});

	assert.equal(state.status, "running");
	assert.equal(state.objective, "ship the feature");
	assert.equal(state.iteration, 0);
	assert.equal(state.budget.maxIterations, 7);
	assert.equal(state.pendingContinuation, undefined);
});

test("restores latest valid custom entry from active branch", () => {
	const first = createInitialState({
		objective: "old",
		cwd: "/tmp/project",
		sessionId: "session-1",
		now: "2026-06-03T00:00:00.000Z",
	});
	const second = reduceState(first, {
		type: "started",
		objective: "new",
		now: "2026-06-03T00:01:00.000Z",
	});
	const entries: CustomSessionEntry[] = [
		{
			type: "custom",
			customType: STATE_CUSTOM_TYPE,
			data: serializeState(first),
		},
		{ type: "custom", customType: STATE_CUSTOM_TYPE, data: { nope: true } },
		{ type: "custom", customType: "other", data: serializeState(first) },
		{
			type: "custom",
			customType: STATE_CUSTOM_TYPE,
			data: serializeState(second),
		},
	];

	const restored = restoreStateFromEntries(entries);

	assert.equal(restored?.objective, "new");
	assert.equal(restored?.updatedAt, "2026-06-03T00:01:00.000Z");
});

test("pause resume stop and blocked transitions control liveness state", () => {
	const initial = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		sessionId: "session-1",
		now: "2026-06-03T00:00:00.000Z",
	});
	const paused = reduceState(initial, {
		type: "paused",
		reason: "manual",
		now: "2026-06-03T00:01:00.000Z",
	});
	const resumed = reduceState(paused, {
		type: "resumed",
		now: "2026-06-03T00:02:00.000Z",
	});
	const blocked = reduceState(resumed, {
		type: "blocked",
		reason: "needs credentials",
		now: "2026-06-03T00:03:00.000Z",
	});
	const stopped = reduceState(blocked, {
		type: "stopped",
		reason: "manual",
		now: "2026-06-03T00:04:00.000Z",
	});

	assert.equal(paused.status, "paused");
	assert.equal(resumed.status, "running");
	assert.equal(blocked.status, "blocked");
	assert.equal(blocked.lastBlocker?.reason, "needs credentials");
	assert.equal(stopped.status, "stopped");
	assert.equal(stopped.pendingContinuation, undefined);
});

test("turn accounting enforces wall-clock budget", () => {
	const initial = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		sessionId: "session-1",
		now: "2026-06-03T00:00:00.000Z",
		maxWallClockMs: 1_000,
	});

	const over = reduceState(initial, {
		type: "turn_recorded",
		assistantText: "progress",
		fingerprint: "abc",
		now: "2026-06-03T00:00:02.000Z",
	});

	assert.equal(over.status, "budget_limited");
	assert.match(over.lastBlocker?.reason ?? "", /wall-clock budget/i);
});

test("turn accounting marks repeated no-progress and budget limit", () => {
	const initial = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		sessionId: "session-1",
		now: "2026-06-03T00:00:00.000Z",
		maxIterations: 2,
		maxNoProgressTurns: 2,
	});
	const once = reduceState(initial, {
		type: "turn_recorded",
		assistantText: "same",
		fingerprint: "abc",
		now: "2026-06-03T00:01:00.000Z",
	});
	const twice = reduceState(once, {
		type: "turn_recorded",
		assistantText: "same",
		fingerprint: "abc",
		now: "2026-06-03T00:02:00.000Z",
	});
	const over = reduceState(twice, {
		type: "turn_recorded",
		assistantText: "same",
		fingerprint: "abc",
		now: "2026-06-03T00:03:00.000Z",
	});

	assert.equal(once.iteration, 1);
	assert.equal(twice.noProgressTurns, 1);
	assert.equal(over.status, "budget_limited");
	assert.match(over.lastBlocker?.reason ?? "", /iteration budget/i);
});
