import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Compile } from "typebox/compile";

import { loadTs } from "../support/load-ts.mjs";

const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");
const { ASYNC_DIR, RESULTS_DIR } = await loadTs("../../src/shared/types.ts");
const { executeAsyncSingle } = await loadTs("../../src/runs/background/async-execution.ts");
const { runSync } = await loadTs("../../src/runs/foreground/execution.ts");
const { buildPiArgs } = await loadTs("../../src/runs/shared/pi-args.ts");
const {
	TOOL_BUDGET_ENV,
	decodeToolBudgetEnv,
	encodeToolBudgetEnv,
	shouldBlockToolForBudget,
	toolBudgetState,
	validateToolBudgetConfig,
} = await loadTs("../../src/runs/shared/tool-budget.ts");

async function waitFor(predicate, timeoutMs = 5000) {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 25));
	}
	assert.fail("timed out waiting for condition");
}

function makeAgent() {
	return {
		name: "delegate",
		description: "Delegate",
		source: "builtin",
		filePath: "builtin/delegate.md",
		systemPrompt: "Delegate.",
		systemPromptMode: "replace",
		inheritProjectContext: true,
		inheritSkills: false,
		tools: ["read", "grep"],
	};
}

function makeTwoToolFakePi(delayMs = 500) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-tool-budget-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node
console.log(JSON.stringify({ type: "tool_execution_start", toolName: "grep", args: { pattern: "x" } }));
console.log(JSON.stringify({ type: "tool_execution_end", toolName: "grep" }));
console.log(JSON.stringify({ type: "tool_execution_start", toolName: "read", args: { path: "file.ts" } }));
setTimeout(() => {
  console.log(JSON.stringify({ type: "tool_execution_end", toolName: "read" }));
  console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "late success" }], stopReason: "stop" } }));
}, ${delayMs});
`,
		{ mode: 0o700 },
	);
	return tmp;
}

test("tool budget validates explicit config only", () => {
	assert.deepEqual(validateToolBudgetConfig(undefined), {});
	assert.deepEqual(validateToolBudgetConfig({ hard: 3 }), { budget: { hard: 3, block: ["read", "grep", "find", "ls"] } });
	assert.deepEqual(validateToolBudgetConfig({ soft: 2, hard: 3, block: "*" }), { budget: { soft: 2, hard: 3, block: "*" } });
	assert.deepEqual(validateToolBudgetConfig({ hard: 3, block: ["read", "read", " grep "] }), { budget: { hard: 3, block: ["read", "grep"] } });
	assert.match(validateToolBudgetConfig({}).error, /hard/);
	assert.match(validateToolBudgetConfig({ hard: 0 }).error, /integer >= 1/);
	assert.match(validateToolBudgetConfig({ soft: 4, hard: 3 }).error, /soft.*<=/);
});

test("tool budget helper reports soft and hard states", () => {
	const budget = { soft: 2, hard: 3, block: ["read"] };

	assert.deepEqual(toolBudgetState(budget, 1), { ...budget, toolCount: 1, outcome: "within-budget" });
	assert.deepEqual(toolBudgetState(budget, 2), { ...budget, toolCount: 2, outcome: "soft-reached", softReachedAt: 2 });
	assert.deepEqual(toolBudgetState(budget, 4), { ...budget, toolCount: 4, outcome: "hard-exceeded", softReachedAt: 2, hardReachedAt: 3 });
	assert.deepEqual(toolBudgetState(budget, 4, "read"), { ...budget, toolCount: 4, outcome: "hard-blocked", softReachedAt: 2, hardReachedAt: 3, blockedTool: "read" });
	assert.equal(shouldBlockToolForBudget(budget, "grep", 4), false);
	assert.equal(shouldBlockToolForBudget(budget, "read", 4), true);
	assert.equal(shouldBlockToolForBudget({ hard: 1, block: "*" }, "write", 2), true);
});

test("tool budget env round-trips through buildPiArgs", () => {
	const budget = { hard: 2, block: ["read"] };
	const { env } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "use few tools",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		toolBudget: budget,
	});

	assert.equal(env[TOOL_BUDGET_ENV], encodeToolBudgetEnv(budget));
	assert.deepEqual(decodeToolBudgetEnv(env[TOOL_BUDGET_ENV]), budget);
});

test("public schema exposes toolBudget and validates values", () => {
	const validator = Compile(SubagentParams);

	assert.equal(validator.Check({ agent: "delegate", task: "x", toolBudget: { hard: 2 } }), true);
	assert.equal(validator.Check({ agent: "delegate", task: "x", toolBudget: { soft: 1, hard: 2, block: "*" } }), true);
	assert.equal(validator.Check({ agent: "delegate", task: "x", toolBudget: { hard: 0 } }), false);
	assert.equal(validator.Check({ agent: "delegate", task: "x", toolBudget: { block: [] } }), false);
});

test("async single hard-blocks configured tools after the hard budget", async () => {
	const id = `tool-budget-async-${process.pid}-${Date.now()}`;
	const fakePiDir = makeTwoToolFakePi(1000);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const asyncDir = path.join(ASYNC_DIR, id);
	const resultPath = path.join(RESULTS_DIR, `${id}.json`);
	try {
		const start = executeAsyncSingle(id, {
			agent: "delegate",
			task: "Use too many tools",
			agentConfig: makeAgent(),
			ctx: {
				pi: { events: { emit() {}, on() { return () => {}; } } },
				cwd: fakePiDir,
				currentSessionId: "tool-budget-session",
			},
			cwd: fakePiDir,
			artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
			shareEnabled: false,
			maxSubagentDepth: 0,
			toolBudget: { hard: 1, block: ["read"] },
		});

		assert.equal(start.isError, undefined, start.content?.[0]?.text);
		await waitFor(() => fs.existsSync(resultPath));

		const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
		const step = result.results[0];
		assert.equal(result.success, false);
		assert.equal(step.toolBudgetBlocked, true);
		assert.equal(step.toolBudget?.outcome, "hard-blocked");
		assert.equal(step.toolBudget?.blockedTool, "read");
		assert.match(step.error ?? "", /Tool budget hard limit reached/);
		assert.match(step.output ?? "", /Tool budget hard limit reached/);
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(asyncDir, { recursive: true, force: true });
		fs.rmSync(resultPath, { force: true });
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});

test("runSync records hard-exceeded without blocking unblocked tools", async () => {
	const fakePiDir = makeTwoToolFakePi(10);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		const result = await runSync(fakePiDir, [makeAgent()], "delegate", "Use unblocked tools", {
			runId: "tool-budget-hard-exceeded-run",
			index: 0,
			toolBudget: { hard: 1, block: ["write"] },
		});

		assert.equal(result.exitCode, 0);
		assert.equal(result.toolBudgetBlocked, undefined);
		assert.equal(result.toolBudget?.outcome, "hard-exceeded");
		assert.equal(result.toolBudget?.blockedTool, undefined);
		assert.match(result.finalOutput ?? "", /late success/);
		assert.doesNotMatch(result.finalOutput ?? "", /Tool budget hard limit reached/);
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});

test("runSync hard-blocks configured tools after the hard budget", async () => {
	const fakePiDir = makeTwoToolFakePi(1000);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		const result = await runSync(fakePiDir, [makeAgent()], "delegate", "Use too many tools", {
			runId: "tool-budget-run",
			index: 0,
			toolBudget: { hard: 1, block: ["read"] },
		});

		assert.equal(result.exitCode, 1);
		assert.equal(result.toolBudgetBlocked, true);
		assert.equal(result.toolBudget?.outcome, "hard-blocked");
		assert.equal(result.toolBudget?.blockedTool, "read");
		assert.match(result.error ?? "", /Tool budget hard limit reached/);
		assert.match(result.finalOutput ?? "", /Tool budget hard limit reached/);
		assert.equal(result.progress?.status, "failed");
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});
