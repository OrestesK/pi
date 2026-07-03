import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	createAsyncJobTracker,
} = await loadTs("../../src/runs/background/async-job-tracker.ts");
const {
	renderWidget,
	stopResultAnimations,
	stopWidgetAnimation,
	syncResultAnimation,
} = await loadTs("../../src/tui/render.ts");

function withCapturedIntervals(fn) {
	const originalSetInterval = globalThis.setInterval;
	const originalClearInterval = globalThis.clearInterval;
	const intervals = [];
	globalThis.setInterval = (callback, delay, ...args) => {
		const timer = { callback, delay, args, unref() {} };
		intervals.push(timer);
		return timer;
	};
	globalThis.clearInterval = () => {};
	try {
		fn(intervals);
	} finally {
		stopResultAnimations();
		stopWidgetAnimation();
		globalThis.setInterval = originalSetInterval;
		globalThis.clearInterval = originalClearInterval;
	}
}

function makeState(ctx) {
	return {
		baseCwd: process.cwd(),
		currentSessionId: null,
		asyncJobs: new Map(),
		foregroundControls: new Map(),
		lastForegroundControlId: null,
		cleanupTimers: new Map(),
		lastUiContext: ctx,
		poller: null,
		completionSeen: new Map(),
		watcher: null,
		watcherRestartTimer: null,
		watcherScanTimer: null,
		resultFileCoalescer: {
			schedule() {
				return true;
			},
			clear() {},
		},
	};
}

function writeStatus(asyncDir, status) {
	fs.mkdirSync(asyncDir, { recursive: true });
	fs.writeFileSync(path.join(asyncDir, "status.json"), JSON.stringify(status), "utf-8");
}

test("async widget animation refreshes at low frequency", () => {
	withCapturedIntervals((intervals) => {
		renderWidget(
			{
				hasUI: true,
				ui: {
					setWidget() {},
					getToolsExpanded() {
						return false;
					},
				},
			},
			[
				{
					status: "running",
					mode: "single",
					agents: ["run-monitor"],
				},
			],
		);

		assert.deepEqual(intervals.map((timer) => timer.delay), [1000]);
	});
});

test("async tracker does not repaint unchanged running status on every poll", () => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-tui-render-test-"));
	try {
		const asyncDir = path.join(root, "run-1");
		writeStatus(asyncDir, {
			runId: "run-1",
			mode: "single",
			state: "running",
			startedAt: 1000,
			lastUpdate: 2000,
			activityState: "active",
			lastActivityAt: 1500,
			currentTool: "bash",
			currentToolStartedAt: 1600,
			turnCount: 4,
			toolCount: 9,
		});
		let setWidgetCount = 0;
		let requestRenderCount = 0;
		const ctx = {
			hasUI: true,
			ui: {
				setWidget() {
					setWidgetCount++;
				},
				requestRender() {
					requestRenderCount++;
				},
				getToolsExpanded() {
					return false;
				},
			},
		};
		withCapturedIntervals((intervals) => {
			const tracker = createAsyncJobTracker(
				{ events: { emit() {} } },
				makeState(ctx),
				root,
				{ pollIntervalMs: 10 },
			);

			tracker.handleStarted({ id: "run-1", asyncDir, agent: "run-monitor", mode: "single" });
			assert.equal(setWidgetCount, 1);
			assert.equal(requestRenderCount, 1);

			const pollTimer = intervals.find((timer) => timer.delay === 10);
			assert.ok(pollTimer);
			pollTimer.callback();
			assert.equal(setWidgetCount, 2);
			assert.equal(requestRenderCount, 2);

			pollTimer.callback();
			assert.equal(setWidgetCount, 2);
			assert.equal(requestRenderCount, 2);
		});
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("foreground result animation keeps spinner cadence", () => {
	withCapturedIntervals((intervals) => {
		syncResultAnimation(
			{
				details: {
					progress: [{ status: "running" }],
					results: [],
				},
			},
			{
				state: {},
				invalidate() {},
			},
		);

		assert.deepEqual(intervals.map((timer) => timer.delay), [80]);
	});
});
