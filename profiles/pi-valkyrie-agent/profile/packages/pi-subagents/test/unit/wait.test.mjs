import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { waitForSubagents } = await loadTs("../../src/runs/background/wait.ts");
const { WaitParams } = await loadTs("../../src/extension/schemas.ts");

function makeRoots() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-wait-test-"));
	const asyncDirRoot = path.join(root, "async");
	const resultsDir = path.join(root, "results");
	fs.mkdirSync(asyncDirRoot, { recursive: true });
	fs.mkdirSync(resultsDir, { recursive: true });
	return { root, asyncDirRoot, resultsDir };
}

function writeStatus(asyncDirRoot, id, status) {
	const asyncDir = path.join(asyncDirRoot, id);
	fs.mkdirSync(asyncDir, { recursive: true });
	fs.writeFileSync(path.join(asyncDir, "status.json"), JSON.stringify({
		runId: id,
		mode: "single",
		state: status.state,
		startedAt: 1000,
		lastUpdate: status.lastUpdate ?? 1000,
		sessionId: status.sessionId ?? "session-1",
		steps: [{ agent: "worker", status: status.stepStatus ?? status.state }],
	}, null, 2));
}

function makeState() {
	return {
		currentSessionId: "session-1",
	};
}

test("wait tool schema exposes id, all, and timeout options", () => {
	assert.ok(WaitParams.properties.id);
	assert.ok(WaitParams.properties.all);
	assert.ok(WaitParams.properties.timeoutMs);
});

test("wait reports no active async runs", async () => {
	const { root, asyncDirRoot, resultsDir } = makeRoots();
	try {
		const result = await waitForSubagents({}, undefined, { state: makeState(), asyncDirRoot, resultsDir });

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /No active async runs in this session/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("wait does not widen scope when current session is unknown", async () => {
	const { root, asyncDirRoot, resultsDir } = makeRoots();
	try {
		writeStatus(asyncDirRoot, "run-1", { state: "running", sessionId: "session-1" });
		writeStatus(asyncDirRoot, "run-2", { state: "running", sessionId: "session-2" });

		const result = await waitForSubagents({}, undefined, {
			state: { currentSessionId: null },
			asyncDirRoot,
			resultsDir,
		});

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /No active async runs in this session/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("wait returns when one initially active run finishes", async () => {
	const { root, asyncDirRoot, resultsDir } = makeRoots();
	try {
		writeStatus(asyncDirRoot, "run-1", { state: "running" });
		writeStatus(asyncDirRoot, "run-2", { state: "running" });
		let slept = false;
		const result = await waitForSubagents({}, undefined, {
			state: makeState(),
			asyncDirRoot,
			resultsDir,
			pollIntervalMs: 1,
			now: () => 1000,
			sleep: async () => {
				if (!slept) {
					slept = true;
					writeStatus(asyncDirRoot, "run-1", { state: "complete", stepStatus: "complete", lastUpdate: 1100 });
				}
			},
		});

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /1 of 2 run\(s\) finished/);
		assert.match(result.content[0].text, /1 run\(s\) still in flight/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("wait timeout reports timeout without mutating active run state", async () => {
	const { root, asyncDirRoot, resultsDir } = makeRoots();
	try {
		writeStatus(asyncDirRoot, "run-1", { state: "running" });
		let now = 1000;
		const result = await waitForSubagents({ timeoutMs: 10 }, undefined, {
			state: makeState(),
			asyncDirRoot,
			resultsDir,
			pollIntervalMs: 1,
			now: () => now,
			sleep: async () => {
				now = 1011;
			},
		});

		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /Wait timed out after 10ms/);
		const status = JSON.parse(fs.readFileSync(path.join(asyncDirRoot, "run-1", "status.json"), "utf-8"));
		assert.equal(status.state, "running");
		assert.equal(status.timedOut, undefined);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("wait returns when an initially active run needs attention", async () => {
	const { root, asyncDirRoot, resultsDir } = makeRoots();
	try {
		writeStatus(asyncDirRoot, "run-1", { state: "running" });
		let slept = false;
		const result = await waitForSubagents({ all: true }, undefined, {
			state: makeState(),
			asyncDirRoot,
			resultsDir,
			pollIntervalMs: 1,
			now: () => 1000,
			sleep: async () => {
				if (!slept) {
					slept = true;
					const asyncDir = path.join(asyncDirRoot, "run-1");
					const statusPath = path.join(asyncDir, "status.json");
					const status = JSON.parse(fs.readFileSync(statusPath, "utf-8"));
					status.activityState = "needs_attention";
					fs.writeFileSync(statusPath, JSON.stringify(status), "utf-8");
				}
			},
		});

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /attention required|need attention/);
		assert.match(result.content[0].text, /run-1/);
	} finally {
		fs.rmSync(root, { recursive: true, force: true });
	}
});
