import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const {
	buildParallelStragglerNotice,
	formatParallelStragglerNotice,
} = await loadTs("../../src/runs/shared/parallel-straggler.ts");
const { handleSubagentOrchestratorNotice } = await loadTs("../../src/extension/control-notices.ts");
const { maybeEmitAsyncStragglerNotice } = await loadTs("../../src/runs/background/async-job-tracker.ts");

const NOW = 1_000_000;

function completed(index, agent, durationMs) {
	return {
		index,
		agent,
		status: "completed",
		startedAt: NOW - durationMs - 10_000,
		endedAt: NOW - 10_000,
		durationMs,
	};
}

function running(index, agent, elapsedMs, extra = {}) {
	return {
		index,
		agent,
		status: "running",
		startedAt: NOW - elapsedMs,
		...extra,
	};
}

test("detects a small all-but-one parallel barrier straggler", () => {
	const notice = buildParallelStragglerNotice({
		runId: "run-1",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "reviewer", 40_000),
			completed(1, "reviewer", 50_000),
			running(2, "reviewer", 90_000, { lastActivityAt: NOW - 12_000, toolCount: 4, tokens: 1200 }),
		],
	});

	assert.equal(notice?.key, "run-1:parallel:top-level parallel:2");
	assert.equal(notice?.completedCount, 2);
	assert.equal(notice?.totalCount, 3);
	assert.equal(notice?.running.length, 1);
	assert.equal(notice?.thresholdMs, 75_000);
	assert.match(formatParallelStragglerNotice(notice), /Parallel barrier blocked by straggler/);
	assert.match(formatParallelStragglerNotice(notice), /2\/3 complete; 1 still running/);
	assert.match(formatParallelStragglerNotice(notice), /reviewer 3\/3, elapsed 1m30s, last activity 12s ago, 4 tools, 1200 tokens/);
	assert.match(formatParallelStragglerNotice(notice), /No automatic action taken/);
});

test("does not detect while siblings are still queued", () => {
	const notice = buildParallelStragglerNotice({
		runId: "run-queued",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "scout", 20_000),
			running(1, "scout", 120_000),
			{ index: 2, agent: "scout", status: "pending" },
		],
	});

	assert.equal(notice, undefined);
});

test("does not detect when another sibling failed or paused", () => {
	const failedNotice = buildParallelStragglerNotice({
		runId: "run-failed",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "reviewer", 20_000),
			{ index: 1, agent: "reviewer", status: "failed", startedAt: NOW - 40_000, endedAt: NOW - 1_000 },
			running(2, "reviewer", 120_000),
		],
	});
	const pausedNotice = buildParallelStragglerNotice({
		runId: "run-paused",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "reviewer", 20_000),
			{ index: 1, agent: "reviewer", status: "paused", startedAt: NOW - 40_000 },
			running(2, "reviewer", 120_000),
		],
	});

	assert.equal(failedNotice, undefined);
	assert.equal(pausedNotice, undefined);
});

test("uses slowest completed sibling duration as the relative baseline", () => {
	const notice = buildParallelStragglerNotice({
		runId: "run-baseline",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "delegate", 40_000),
			completed(1, "delegate", 240_000),
			running(2, "delegate", 300_000),
		],
	});

	assert.equal(notice, undefined);

	const laterNotice = buildParallelStragglerNotice({
		runId: "run-baseline",
		mode: "parallel",
		barrierLabel: "top-level parallel",
		now: NOW,
		tasks: [
			completed(0, "delegate", 40_000),
			completed(1, "delegate", 240_000),
			running(2, "delegate", 370_000),
		],
	});

	assert.equal(laterNotice?.thresholdMs, 360_000);
	assert.equal(laterNotice?.running[0]?.elapsedMs, 370_000);
});

test("orchestrator notice handler dedupes by barrier key and does not trigger foreground turns", () => {
	const sent = [];
	const visible = new Set();
	const pi = {
		sendMessage(message, options) {
			sent.push({ message, options });
		},
	};
	const details = {
		key: "run-1:parallel:top-level parallel:2",
		runId: "run-1",
		source: "foreground",
		noticeText: "Parallel barrier blocked by straggler",
	};

	handleSubagentOrchestratorNotice({ pi, visibleControlNotices: visible, details });
	handleSubagentOrchestratorNotice({ pi, visibleControlNotices: visible, details });

	assert.equal(sent.length, 1);
	assert.equal(sent[0].message.content, "Parallel barrier blocked by straggler");
	assert.equal(sent[0].options.triggerTurn, false);
});

test("async tracker emits straggler notices from active parallel group status", () => {
	const emitted = [];
	const asyncNow = Date.now();
	const pi = {
		events: {
			emit(type, payload) {
				emitted.push({ type, payload });
			},
		},
	};

	maybeEmitAsyncStragglerNotice(
		pi,
		{ asyncId: "async-1", asyncDir: "/tmp/async-1", status: "running" },
		{
			runId: "async-1",
			mode: "parallel",
			state: "running",
			startedAt: asyncNow - 120_000,
			currentStep: 0,
			chainStepCount: 1,
			parallelGroups: [{ start: 0, count: 3, stepIndex: 0 }],
			steps: [
				{ agent: "reviewer", status: "completed", startedAt: asyncNow - 70_000, endedAt: asyncNow - 30_000, durationMs: 40_000 },
				{ agent: "reviewer", status: "completed", startedAt: asyncNow - 80_000, endedAt: asyncNow - 30_000, durationMs: 50_000 },
				{ agent: "reviewer", status: "running", startedAt: asyncNow - 90_000, lastActivityAt: asyncNow - 5_000, toolCount: 2, tokens: { input: 10, output: 20, total: 30 } },
			],
		},
	);

	assert.equal(emitted.length, 1);
	assert.equal(emitted[0].type, "subagent:orchestrator-notice");
	assert.equal(emitted[0].payload.key, "async-1:parallel:top-level parallel:2");
	assert.equal(emitted[0].payload.source, "async");
	assert.match(emitted[0].payload.noticeText, /2\/3 complete; 1 still running/);
});

test("async chain active-group straggler notice uses group-relative task numbering", () => {
	const emitted = [];
	const asyncNow = Date.now();
	const pi = {
		events: {
			emit(type, payload) {
				emitted.push({ type, payload });
			},
		},
	};

	maybeEmitAsyncStragglerNotice(
		pi,
		{ asyncId: "chain-1", asyncDir: "/tmp/chain-1", status: "running" },
		{
			runId: "chain-1",
			mode: "chain",
			state: "running",
			startedAt: asyncNow - 200_000,
			currentStep: 6,
			chainStepCount: 6,
			parallelGroups: [{ start: 4, count: 3, stepIndex: 4 }],
			steps: [
				{ agent: "setup", status: "completed", startedAt: asyncNow - 190_000, endedAt: asyncNow - 180_000, durationMs: 10_000 },
				{ agent: "setup", status: "completed", startedAt: asyncNow - 170_000, endedAt: asyncNow - 160_000, durationMs: 10_000 },
				{ agent: "setup", status: "completed", startedAt: asyncNow - 150_000, endedAt: asyncNow - 140_000, durationMs: 10_000 },
				{ agent: "setup", status: "completed", startedAt: asyncNow - 130_000, endedAt: asyncNow - 120_000, durationMs: 10_000 },
				{ agent: "reviewer", status: "completed", startedAt: asyncNow - 100_000, endedAt: asyncNow - 60_000, durationMs: 40_000 },
				{ agent: "reviewer", status: "completed", startedAt: asyncNow - 110_000, endedAt: asyncNow - 60_000, durationMs: 50_000 },
				{ agent: "reviewer", status: "running", startedAt: asyncNow - 120_000, lastActivityAt: asyncNow - 5_000 },
			],
		},
	);

	assert.equal(emitted.length, 1);
	assert.match(emitted[0].payload.noticeText, /step 5\/6: parallel group/);
	assert.match(emitted[0].payload.noticeText, /Running: reviewer 3\/3/);
	assert.doesNotMatch(emitted[0].payload.noticeText, /7\/3/);
});
