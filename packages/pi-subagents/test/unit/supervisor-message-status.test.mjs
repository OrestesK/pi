import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { inspectSubagentStatus } = await loadTs("../../src/runs/background/run-status.ts");
const { appendSupervisorMessage } = await loadTs("../../src/shared/supervisor-inbox.ts");

function makeRoot() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-supervisor-status-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

test("async status renders pending supervisor messages as additive step facts", async () => {
	const root = makeRoot();
	try {
		const asyncRoot = path.join(root, "async");
		const resultsRoot = path.join(root, "results");
		const asyncDir = path.join(asyncRoot, "run-status");
		fs.mkdirSync(asyncDir, { recursive: true });
		fs.mkdirSync(resultsRoot, { recursive: true });
		fs.writeFileSync(path.join(asyncDir, "status.json"), JSON.stringify({
			runId: "run-status",
			mode: "parallel",
			state: "running",
			startedAt: 1000,
			lastUpdate: 2000,
			currentStep: 0,
			steps: [
				{ agent: "run-monitor", status: "running", startedAt: 1000 },
				{ agent: "reviewer", status: "pending" },
			],
		}, null, 2));
		await appendSupervisorMessage(asyncDir, {
			toIndex: 0,
			agent: "run-monitor",
			text: "Also watch /tmp/build.log",
			urgent: true,
		}, { id: () => "sm-status", now: () => 1500 });

		const result = await inspectSubagentStatus({ id: "run-status" }, { asyncDirRoot: asyncRoot, resultsDir: resultsRoot });

		assert.equal(result.isError, undefined);
		assert.match(result.content[0].text, /Agent 1\/2: run-monitor running/);
		assert.match(result.content[0].text, /Supervisor: 1 pending supervisor message \(1 urgent\)/);
		assert.match(result.content[0].text, /Agent 2\/2: reviewer pending/);
	} finally {
		cleanup(root);
	}
});
