import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { inspectSubagentStatus } = await loadTs("../../src/runs/background/run-status.ts");
const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");

function makeRoot() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-supervisor-status-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

test("status schema exposes fleet and transcript view options", () => {
	assert.ok(SubagentParams.properties.view);
	assert.ok(SubagentParams.properties.lines);
});

test("async status fleet view lists async runs", async () => {
	const root = makeRoot();
	try {
		const asyncRoot = path.join(root, "async");
		const resultsRoot = path.join(root, "results");
		const asyncDir = path.join(asyncRoot, "run-fleet");
		fs.mkdirSync(asyncDir, { recursive: true });
		fs.mkdirSync(resultsRoot, { recursive: true });
		fs.writeFileSync(path.join(asyncDir, "status.json"), JSON.stringify({
			runId: "run-fleet",
			mode: "single",
			state: "running",
			startedAt: 1000,
			lastUpdate: 2000,
			steps: [{ agent: "worker", status: "running" }],
		}, null, 2));

		const result = await inspectSubagentStatus({ action: "status", view: "fleet" }, { asyncDirRoot: asyncRoot, resultsDir: resultsRoot });

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /Subagent fleet: 1/);
		assert.match(result.content[0].text, /run-fleet/);
		assert.match(result.content[0].text, /worker/);
	} finally {
		cleanup(root);
	}
});

test("async status transcript view tails child output", async () => {
	const root = makeRoot();
	try {
		const asyncRoot = path.join(root, "async");
		const resultsRoot = path.join(root, "results");
		const asyncDir = path.join(asyncRoot, "run-transcript");
		fs.mkdirSync(asyncDir, { recursive: true });
		fs.mkdirSync(resultsRoot, { recursive: true });
		fs.writeFileSync(path.join(asyncDir, "status.json"), JSON.stringify({
			runId: "run-transcript",
			mode: "single",
			state: "running",
			startedAt: 1000,
			lastUpdate: 2000,
			steps: [{ agent: "worker", status: "running" }],
		}, null, 2));
		fs.writeFileSync(path.join(asyncDir, "output-0.log"), "line one\nline two\nline three\n", "utf-8");

		const result = await inspectSubagentStatus({ id: "run-transcript", view: "transcript", index: 0, lines: 2 }, { asyncDirRoot: asyncRoot, resultsDir: resultsRoot });

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /Transcript tail from .*output-0\.log \(tail truncated\):/);
		assert.doesNotMatch(result.content[0].text, /line one/);
		assert.match(result.content[0].text, /line two/);
		assert.match(result.content[0].text, /line three/);
	} finally {
		cleanup(root);
	}
});
