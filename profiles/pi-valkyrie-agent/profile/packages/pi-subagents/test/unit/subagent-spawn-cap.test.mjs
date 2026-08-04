import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { createSubagentExecutor } = await loadTs("../../src/runs/foreground/subagent-executor.ts");

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

function makeRecordingFakePi(recordPath) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-spawn-cap-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\nconst fs = require("node:fs");\nconst path = ${JSON.stringify(recordPath)};\nconst current = fs.existsSync(path) ? JSON.parse(fs.readFileSync(path, "utf8")) : [];\ncurrent.push(process.argv);\nfs.writeFileSync(path, JSON.stringify(current));\nconsole.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }));\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

function makeAgent() {
	return {
		name: "worker",
		description: "Worker",
		source: "test",
		filePath: "worker.md",
		systemPrompt: "Worker.",
		systemPromptMode: "replace",
		inheritProjectContext: false,
		inheritSkills: false,
		tools: ["read"],
	};
}

function makeExecutor(config = {}) {
	const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-spawn-cap-session-"));
	return {
		sessionBase,
		executor: createSubagentExecutor({
			pi: { getSessionName: () => "spawn-cap-test", events: { emit() {}, on() { return () => {}; } } },
			state: makeState(),
			config,
			asyncByDefault: false,
			tempArtifactsDir: path.join(sessionBase, "artifacts"),
			getSubagentSessionRoot: () => sessionBase,
			expandTilde: (value) => value,
			discoverAgents: () => ({ agents: [makeAgent()] }),
		}),
	};
}

function makeCtx(cwd) {
	return {
		cwd,
		model: undefined,
		modelRegistry: { getAvailable: () => [] },
		sessionManager: { getSessionFile: () => null, getSessionId: () => "spawn-cap-session" },
	};
}

async function withFakePi(fn) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-spawn-cap-"));
	const recordPath = path.join(root, "argv.json");
	const fakePiDir = makeRecordingFakePi(recordPath);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		return await fn({ root, recordPath });
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(root, { recursive: true, force: true });
	}
}

test("spawn cap is optional by default", async () => {
	await withFakePi(async ({ root, recordPath }) => {
		const { executor } = makeExecutor();
		const result = await executor.execute("spawn-cap-default", {
			tasks: [
				{ agent: "worker", task: "one" },
				{ agent: "worker", task: "two" },
			],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(JSON.parse(fs.readFileSync(recordPath, "utf-8")).length, 2);
	});
});

test("spawn cap rejects expanded top-level parallel count before spawn", async () => {
	await withFakePi(async ({ root, recordPath }) => {
		const { executor } = makeExecutor({ maxSubagentSpawns: 2 });
		const result = await executor.execute("spawn-cap-parallel", {
			tasks: [{ agent: "worker", task: "too many", count: 3 }],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /spawn cap/i);
		assert.match(result.content[0].text, /attempted 3/i);
		assert.match(result.content[0].text, /cap 2/i);
		assert.equal(fs.existsSync(recordPath), false);
	});
});

test("spawn cap counts sequential chain steps and expanded parallel chain tasks", async () => {
	await withFakePi(async ({ root, recordPath }) => {
		const { executor } = makeExecutor({ maxSubagentSpawns: 2 });
		const result = await executor.execute("spawn-cap-chain", {
			chain: [
				{ agent: "worker", task: "first" },
				{ parallel: [{ agent: "worker", task: "second", count: 2 }] },
			],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /spawn cap/i);
		assert.match(result.content[0].text, /attempted 3/i);
		assert.match(result.content[0].text, /cap 2/i);
		assert.equal(fs.existsSync(recordPath), false);
	});
});

test("depth errors remain distinct from spawn-cap errors", async () => {
	const oldDepth = process.env.PI_SUBAGENT_DEPTH;
	const oldMaxDepth = process.env.PI_SUBAGENT_MAX_DEPTH;
	process.env.PI_SUBAGENT_DEPTH = "1";
	process.env.PI_SUBAGENT_MAX_DEPTH = "1";
	try {
		const { executor } = makeExecutor({ maxSubagentSpawns: 1 });
		const result = await executor.execute("spawn-cap-depth", {
			tasks: [
				{ agent: "worker", task: "one" },
				{ agent: "worker", task: "two" },
			],
			async: false,
		}, new AbortController().signal, undefined, makeCtx(process.cwd()));

		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /Nested subagent call blocked/);
		assert.doesNotMatch(result.content[0].text, /spawn cap/i);
	} finally {
		if (oldDepth === undefined) delete process.env.PI_SUBAGENT_DEPTH;
		else process.env.PI_SUBAGENT_DEPTH = oldDepth;
		if (oldMaxDepth === undefined) delete process.env.PI_SUBAGENT_MAX_DEPTH;
		else process.env.PI_SUBAGENT_MAX_DEPTH = oldMaxDepth;
	}
});
