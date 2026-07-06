import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { createSubagentExecutor } = await loadTs("../../src/runs/foreground/subagent-executor.ts");
const { listPendingSupervisorMessages } = await loadTs("../../src/shared/supervisor-inbox.ts");

function makeState() {
	return {
		baseCwd: process.cwd(),
		currentSessionId: null,
		asyncJobs: new Map(),
		foregroundRuns: new Map(),
		foregroundControls: new Map(),
		lastForegroundControlId: null,
		pendingForegroundControlNotices: new Map(),
		cleanupTimers: new Map(),
		lastUiContext: null,
		poller: null,
		completionSeen: new Map(),
		watcher: null,
		watcherRestartTimer: null,
		watcherScanTimer: null,
		resultFileCoalescer: { schedule: () => false, clear() {} },
	};
}

function makeExecutor(state) {
	return createSubagentExecutor({
		pi: { events: { emit() {}, on() { return () => {}; } } },
		state,
		config: {},
		asyncByDefault: false,
		tempArtifactsDir: path.join(os.tmpdir(), "pi-subagents-test-artifacts"),
		getSubagentSessionRoot: () => fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-session-root-")),
		expandTilde: (value) => value,
		discoverAgents: () => ({ agents: [] }),
	});
}

const ctx = {
	cwd: process.cwd(),
	sessionManager: {
		getSessionFile: () => null,
		getSessionId: () => "session-test",
	},
};

test("message action queues supervisor message for an explicitly targeted foreground child", async () => {
	const state = makeState();
	const supervisorRunDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-supervisor-action-"));
	try {
		state.foregroundControls.set("run-foreground", {
			runId: "run-foreground",
			mode: "parallel",
			startedAt: Date.now(),
			updatedAt: Date.now(),
			supervisorRunDir,
			supervisorChildren: [
				{ agent: "run-monitor", index: 0 },
				{ agent: "reviewer", index: 1 },
			],
		});
		const executor = makeExecutor(state);

		const result = await executor.execute("tool-call", {
			action: "message",
			id: "run-foreground",
			index: 0,
			message: "Also watch /tmp/build.log",
		}, new AbortController().signal, undefined, ctx);

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /Supervisor message queued/);
		assert.match(result.content[0].text, /Child: 0 \(run-monitor\)/);
		const pending = await listPendingSupervisorMessages(supervisorRunDir, 0);
		assert.equal(pending.length, 1);
		assert.equal(pending[0].text, "Also watch /tmp/build.log");
		assert.equal(pending[0].metadata.agent, "run-monitor");
	} finally {
		fs.rmSync(supervisorRunDir, { recursive: true, force: true });
	}
});

test("message action refuses implicit latest-run targeting", async () => {
	const state = makeState();
	const executor = makeExecutor(state);

	const result = await executor.execute("tool-call", {
		action: "message",
		message: "No implicit target",
	}, new AbortController().signal, undefined, ctx);

	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /requires id, runId, or dir/);
});
