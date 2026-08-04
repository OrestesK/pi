import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { createSubagentExecutor } = await loadTs("../../src/runs/foreground/subagent-executor.ts");
const { executeAsyncChain } = await loadTs("../../src/runs/background/async-execution.ts");
const { ASYNC_DIR, RESULTS_DIR } = await loadTs("../../src/shared/types.ts");

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

function makeCtx(cwd) {
	return {
		cwd,
		model: undefined,
		modelRegistry: { getAvailable: () => [] },
		sessionManager: { getSessionFile: () => null, getSessionId: () => "global-concurrency-session" },
	};
}

function makeExecutor(config, sessionBase) {
	return createSubagentExecutor({
		pi: { getSessionName: () => "global-concurrency-test", events: { emit() {}, on() { return () => {}; } } },
		state: makeState(),
		config,
		asyncByDefault: false,
		tempArtifactsDir: path.join(sessionBase, "artifacts"),
		getSubagentSessionRoot: () => sessionBase,
		expandTilde: (value) => value,
		discoverAgents: () => ({ agents: [makeAgent()] }),
	});
}

function makeConcurrencyFakePi(root, delayMs = 120) {
	const binDir = path.join(root, "bin");
	fs.mkdirSync(binDir, { recursive: true });
	const statePath = path.join(root, "state.json");
	const lockDir = path.join(root, "state.lock");
	fs.writeFileSync(statePath, JSON.stringify({ active: 0, maxActive: 0, starts: 0 }));
	fs.writeFileSync(
		path.join(binDir, "pi"),
		`#!/usr/bin/env node
const fs = require("node:fs");
const statePath = ${JSON.stringify(statePath)};
const lockDir = ${JSON.stringify(lockDir)};
const delayMs = ${JSON.stringify(delayMs)};
const sab = new SharedArrayBuffer(4);
const view = new Int32Array(sab);
function sleep(ms) { Atomics.wait(view, 0, 0, ms); }
function withLock(fn) {
  while (true) {
    try { fs.mkdirSync(lockDir); break; }
    catch { sleep(2); }
  }
  try { return fn(); }
  finally { fs.rmdirSync(lockDir); }
}
function update(delta) {
  withLock(() => {
    const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    state.active += delta;
    if (delta > 0) state.starts += 1;
    state.maxActive = Math.max(state.maxActive, state.active);
    fs.writeFileSync(statePath, JSON.stringify(state));
  });
}
(async () => {
  update(1);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  update(-1);
  console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }));
})();
`,
		{ mode: 0o700 },
	);
	return { binDir, statePath };
}

async function withConcurrencyFakePi(fn) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-global-concurrency-"));
	const { binDir, statePath } = makeConcurrencyFakePi(root);
	const oldPath = process.env.PATH;
	process.env.PATH = `${binDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		return await fn({ root, statePath });
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(root, { recursive: true, force: true });
	}
}

async function waitFor(predicate, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail("timed out waiting for condition");
}

function readMaxActive(statePath) {
	return JSON.parse(fs.readFileSync(statePath, "utf-8")).maxActive;
}

test("foreground top-level parallel honors config globalConcurrencyLimit", async () => {
	await withConcurrencyFakePi(async ({ root, statePath }) => {
		const sessionBase = path.join(root, "sessions");
		const executor = makeExecutor({ globalConcurrencyLimit: 1, parallel: { concurrency: 3 } }, sessionBase);
		const result = await executor.execute("global-concurrency-foreground", {
			tasks: [
				{ agent: "worker", task: "one" },
				{ agent: "worker", task: "two" },
				{ agent: "worker", task: "three" },
			],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(readMaxActive(statePath), 1);
	});
});

test("foreground top-level parallel still honors lower local concurrency", async () => {
	await withConcurrencyFakePi(async ({ root, statePath }) => {
		const sessionBase = path.join(root, "sessions");
		const executor = makeExecutor({ globalConcurrencyLimit: 3 }, sessionBase);
		const result = await executor.execute("global-concurrency-local", {
			tasks: [
				{ agent: "worker", task: "one" },
				{ agent: "worker", task: "two" },
				{ agent: "worker", task: "three" },
			],
			concurrency: 1,
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(readMaxActive(statePath), 1);
	});
});

test("foreground chain parallel honors config globalConcurrencyLimit", async () => {
	await withConcurrencyFakePi(async ({ root, statePath }) => {
		const sessionBase = path.join(root, "sessions");
		const executor = makeExecutor({ globalConcurrencyLimit: 1 }, sessionBase);
		const result = await executor.execute("global-concurrency-chain", {
			chain: [
				{
					parallel: [
						{ agent: "worker", task: "one" },
						{ agent: "worker", task: "two" },
						{ agent: "worker", task: "three" },
					],
					concurrency: 3,
				},
			],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(readMaxActive(statePath), 1);
	});
});

test("foreground chain parallel still honors lower local concurrency", async () => {
	await withConcurrencyFakePi(async ({ root, statePath }) => {
		const sessionBase = path.join(root, "sessions");
		const executor = makeExecutor({ globalConcurrencyLimit: 3 }, sessionBase);
		const result = await executor.execute("global-concurrency-chain-local", {
			chain: [
				{
					parallel: [
						{ agent: "worker", task: "one" },
						{ agent: "worker", task: "two" },
						{ agent: "worker", task: "three" },
					],
					concurrency: 1,
				},
			],
			cwd: root,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, makeCtx(root));

		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(readMaxActive(statePath), 1);
	});
});

test("async runner honors config globalConcurrencyLimit", async () => {
	await withConcurrencyFakePi(async ({ root, statePath }) => {
		const id = `global-concurrency-async-${process.pid}-${Date.now()}`;
		const asyncDir = path.join(ASYNC_DIR, id);
		const resultPath = path.join(RESULTS_DIR, `${id}.json`);
		try {
			const result = executeAsyncChain(id, {
				chain: [
					{
						parallel: [
							{ agent: "worker", task: "one" },
							{ agent: "worker", task: "two" },
							{ agent: "worker", task: "three" },
						],
						concurrency: 3,
					},
				],
				agents: [makeAgent()],
				ctx: { pi: { events: { emit() {}, on() { return () => {}; } } }, cwd: root, currentSessionId: "global-concurrency-session" },
				cwd: root,
				artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
				shareEnabled: false,
				progressReportMode: "file",
				maxSubagentDepth: 0,
				globalConcurrencyLimit: 1,
			});

			assert.equal(result.isError, undefined, result.content?.[0]?.text);
			await waitFor(() => fs.existsSync(resultPath));
			assert.equal(readMaxActive(statePath), 1);
		} finally {
			fs.rmSync(asyncDir, { recursive: true, force: true });
			fs.rmSync(resultPath, { force: true });
		}
	});
});
