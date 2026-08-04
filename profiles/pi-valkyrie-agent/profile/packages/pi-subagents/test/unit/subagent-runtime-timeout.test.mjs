import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTs } from "../support/load-ts.mjs";

const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");
const { ASYNC_DIR, RESULTS_DIR } = await loadTs("../../src/shared/types.ts");
const { executeAsyncSingle } = await loadTs("../../src/runs/background/async-execution.ts");
const { runSync } = await loadTs("../../src/runs/foreground/execution.ts");
const { resolveForegroundTimeout } = await loadTs("../../src/runs/foreground/subagent-executor.ts");

async function waitFor(predicate, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail("timed out waiting for condition");
}

function makeDelayedFakePi(delayMs = 100) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-timeout-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node
setTimeout(() => {
  console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "late success" }], stopReason: "stop" } }));
}, ${delayMs});
`,
		{ mode: 0o700 },
	);
	return tmp;
}

function timeoutAgent() {
	return {
		name: "delegate",
		description: "Delegate",
		source: "builtin",
		filePath: "builtin/delegate.md",
		systemPrompt: "Delegate.",
		systemPromptMode: "replace",
		inheritProjectContext: true,
		inheritSkills: false,
		tools: [],
	};
}

test("execution schema exposes timeout aliases", () => {
	assert.ok(SubagentParams.properties.timeoutMs);
	assert.ok(SubagentParams.properties.maxRuntimeMs);
});

test("foreground timeout resolver validates alias values", () => {
	assert.equal(typeof resolveForegroundTimeout, "function");
	assert.deepEqual(resolveForegroundTimeout({}), {});
	assert.deepEqual(resolveForegroundTimeout({ timeoutMs: 50 }), { timeoutMs: 50 });
	assert.deepEqual(resolveForegroundTimeout({ maxRuntimeMs: 50 }), { timeoutMs: 50 });
	assert.deepEqual(resolveForegroundTimeout({ timeoutMs: 50, maxRuntimeMs: 50 }), { timeoutMs: 50 });
	assert.match(resolveForegroundTimeout({ timeoutMs: 50, maxRuntimeMs: 60 }).error, /aliases/);
	assert.match(resolveForegroundTimeout({ timeoutMs: 0 }).error, /positive integer/);
});

test("async single preserves paused step/result semantics after interrupt", async () => {
	const id = `interrupt-async-${process.pid}-${Date.now()}`;
	const fakePiDir = makeDelayedFakePi(10_000);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const asyncDir = path.join(ASYNC_DIR, id);
	const resultPath = path.join(RESULTS_DIR, `${id}.json`);
	const signal = process.platform === "win32" ? "SIGBREAK" : "SIGUSR2";
	try {
		const start = executeAsyncSingle(id, {
			agent: "delegate",
			task: "Wait until interrupted",
			agentConfig: timeoutAgent(),
			ctx: {
				pi: { events: { emit() {}, on() { return () => {}; } } },
				cwd: fakePiDir,
				currentSessionId: "interrupt-session",
			},
			cwd: fakePiDir,
			artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
			shareEnabled: false,
			maxSubagentDepth: 0,
		});

		assert.equal(start.isError, undefined, start.content?.[0]?.text);
		await waitFor(() => {
			if (!fs.existsSync(path.join(asyncDir, "status.json"))) return false;
			const status = JSON.parse(fs.readFileSync(path.join(asyncDir, "status.json"), "utf-8"));
			return typeof status.pid === "number" && status.steps?.[0]?.status === "running";
		});
		const runningStatus = JSON.parse(fs.readFileSync(path.join(asyncDir, "status.json"), "utf-8"));
		process.kill(runningStatus.pid, signal);
		await waitFor(() => fs.existsSync(resultPath));

		const status = JSON.parse(fs.readFileSync(path.join(asyncDir, "status.json"), "utf-8"));
		const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
		const events = fs.readFileSync(path.join(asyncDir, "events.jsonl"), "utf-8");
		assert.equal(status.state, "paused");
		assert.equal(status.steps[0].status, "paused");
		assert.equal(result.state, "paused");
		assert.equal(result.success, false);
		assert.equal(result.results[0].success, false);
		assert.equal(result.results[0].interrupted, true);
		assert.match(events, /subagent\.step\.paused/);
		assert.doesNotMatch(events, /subagent\.step\.completed/);
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(asyncDir, { recursive: true, force: true });
		fs.rmSync(resultPath, { force: true });
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});

test("async single marks status and result timed out", async () => {
	const id = `timeout-async-${process.pid}-${Date.now()}`;
	const fakePiDir = makeDelayedFakePi(500);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const asyncDir = path.join(ASYNC_DIR, id);
	const resultPath = path.join(RESULTS_DIR, `${id}.json`);
	try {
		const start = executeAsyncSingle(id, {
			agent: "delegate",
			task: "Respond too late",
			agentConfig: timeoutAgent(),
			ctx: {
				pi: { events: { emit() {}, on() { return () => {}; } } },
				cwd: fakePiDir,
				currentSessionId: "timeout-session",
			},
			cwd: fakePiDir,
			artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
			shareEnabled: false,
			maxSubagentDepth: 0,
			timeoutMs: 20,
			deadlineAt: Date.now() + 20,
		});

		assert.equal(start.isError, undefined, start.content?.[0]?.text);
		await waitFor(() => fs.existsSync(resultPath));

		const status = JSON.parse(fs.readFileSync(path.join(asyncDir, "status.json"), "utf-8"));
		const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
		assert.equal(status.state, "failed");
		assert.equal(status.timedOut, true);
		assert.match(status.error ?? "", /timed out after 20ms/);
		assert.equal(result.success, false);
		assert.equal(result.timedOut, true);
		assert.equal(result.exitCode, 1);
		assert.match(result.summary ?? "", /timed out after 20ms/);
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(asyncDir, { recursive: true, force: true });
		fs.rmSync(resultPath, { force: true });
	}
});

test("runSync marks a child timed out and returns timeout output", async () => {
	const fakePiDir = makeDelayedFakePi(100);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		const result = await runSync(
			fakePiDir,
			[timeoutAgent()],
			"delegate",
			"Respond too late",
			{
				runId: "timeout-run",
				index: 0,
				timeoutMs: 10,
			},
		);

		assert.equal(result.exitCode, 1);
		assert.equal(result.timedOut, true);
		assert.match(result.error ?? "", /timed out after 10ms/);
		assert.match(result.finalOutput ?? "", /timed out after 10ms/);
		assert.equal(result.progress?.status, "failed");
	} finally {
		process.env.PATH = oldPath;
	}
});
