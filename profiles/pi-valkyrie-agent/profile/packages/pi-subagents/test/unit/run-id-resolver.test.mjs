import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { resolveSubagentRunId } = await loadTs("../../src/runs/background/run-id-resolver.ts");

function makeState() {
	return {
		foregroundControls: new Map(),
		foregroundRuns: new Map(),
	};
}

function makeRoots() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-run-id-resolver-"));
	const asyncDirRoot = path.join(root, "async");
	const resultsDir = path.join(root, "results");
	fs.mkdirSync(asyncDirRoot, { recursive: true });
	fs.mkdirSync(resultsDir, { recursive: true });
	return { root, asyncDirRoot, resultsDir };
}

function makeAsyncRun(asyncDirRoot, resultsDir, id) {
	const asyncDir = path.join(asyncDirRoot, id);
	fs.mkdirSync(asyncDir, { recursive: true });
	const resultPath = path.join(resultsDir, `${id}.json`);
	fs.writeFileSync(resultPath, JSON.stringify({ id, success: true }));
	return { asyncDir, resultPath };
}

test("resolves exact foreground before same-id async run", () => {
	const state = makeState();
	const { asyncDirRoot, resultsDir } = makeRoots();
	state.foregroundControls.set("same-run", { runId: "same-run" });
	makeAsyncRun(asyncDirRoot, resultsDir, "same-run");

	assert.deepEqual(
		resolveSubagentRunId("same-run", { state, asyncDirRoot, resultsDir }),
		{ kind: "foreground", id: "same-run" },
	);
});

test("throws on cross-domain prefix ambiguity", () => {
	const state = makeState();
	const { asyncDirRoot, resultsDir } = makeRoots();
	state.foregroundControls.set("shared-foreground", { runId: "shared-foreground" });
	makeAsyncRun(asyncDirRoot, resultsDir, "shared-async");

	assert.throws(
		() => resolveSubagentRunId("shared-", { state, asyncDirRoot, resultsDir }),
		/Ambiguous subagent run id prefix 'shared-' matched: async:shared-async, foreground:shared-foreground|Ambiguous subagent run id prefix 'shared-' matched: foreground:shared-foreground, async:shared-async/,
	);
});

test("resolves async-only exact run with location", () => {
	const state = makeState();
	const { asyncDirRoot, resultsDir } = makeRoots();
	const { asyncDir, resultPath } = makeAsyncRun(asyncDirRoot, resultsDir, "async-only");

	assert.deepEqual(
		resolveSubagentRunId("async-only", { state, asyncDirRoot, resultsDir }),
		{ kind: "async", id: "async-only", location: { asyncDir, resultPath, resolvedId: "async-only" } },
	);
});

test("rejects path-like ids", () => {
	assert.throws(
		() => resolveSubagentRunId("../bad", { state: makeState(), ...makeRoots() }),
		/id must be a subagent run id or prefix, not a path/,
	);
});
