import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");
const { ASYNC_DIR, RESULTS_DIR } = await loadTs("../../src/shared/types.ts");
const { executeAsyncSingle } = await loadTs(
	"../../src/runs/background/async-execution.ts",
);
const { runSync } = await loadTs("../../src/runs/foreground/execution.ts");
const { appendTurnBudgetSystemPrompt, shouldAbortForTurnBudget } = await loadTs(
	"../../src/runs/shared/turn-budget.ts",
);

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
		tools: [],
	};
}

function makeTwoTurnFakePi(delayMs = 500) {
	const tmp = fs.mkdtempSync(
		path.join(os.tmpdir(), "pi-subagents-turn-budget-pi-"),
	);
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node
console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "first turn" }], stopReason: "tool_use" } }));
setTimeout(() => {
  console.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "late second turn" }], stopReason: "stop" } }));
}, ${delayMs});
`,
		{ mode: 0o700 },
	);
	return tmp;
}

test("turn budget prompt asks the child to wrap up", () => {
	const prompt = appendTurnBudgetSystemPrompt("Base prompt", {
		maxTurns: 2,
		graceTurns: 0,
	});

	assert.match(prompt, /Base prompt/);
	assert.match(prompt, /Turn budget/);
	assert.match(prompt, /soft budget of 2 assistant turns/);
	assert.match(prompt, /return the final answer immediately/);
});

test("turn budget abort decision distinguishes terminal final stop", () => {
	const budget = { maxTurns: 2, graceTurns: 0 };

	assert.equal(shouldAbortForTurnBudget(budget, 1, false), false);
	assert.equal(shouldAbortForTurnBudget(budget, 2, true), false);
	assert.equal(shouldAbortForTurnBudget(budget, 2, false), true);
	assert.equal(shouldAbortForTurnBudget(budget, 3, true), true);
});

test("public schema does not expose turnBudget", () => {
	assert.equal(SubagentParams.properties.turnBudget, undefined);
});

test("async single aborts a nonterminal child when turn budget is exceeded", async () => {
	const id = `turn-budget-async-${process.pid}-${Date.now()}`;
	const fakePiDir = makeTwoTurnFakePi(1000);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const asyncDir = path.join(ASYNC_DIR, id);
	const resultPath = path.join(RESULTS_DIR, `${id}.json`);
	try {
		const start = executeAsyncSingle(id, {
			agent: "delegate",
			task: "Keep working",
			agentConfig: makeAgent(),
			ctx: {
				pi: {
					events: {
						emit() {},
						on() {
							return () => {};
						},
					},
				},
				cwd: fakePiDir,
				currentSessionId: "turn-budget-session",
			},
			cwd: fakePiDir,
			artifactConfig: {
				enabled: false,
				includeInput: false,
				includeOutput: false,
				includeJsonl: false,
				includeMetadata: false,
				cleanupDays: 1,
			},
			shareEnabled: false,
			maxSubagentDepth: 0,
			turnBudget: { maxTurns: 1, graceTurns: 0 },
		});

		assert.equal(start.isError, undefined, start.content?.[0]?.text);
		await waitFor(() => fs.existsSync(resultPath));

		const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
		const step = result.results[0];
		assert.equal(result.success, false);
		assert.equal(step.turnBudgetExceeded, true);
		assert.equal(step.turnBudget?.outcome, "exceeded");
		assert.match(step.error ?? "", /turn budget/i);
		assert.match(step.output ?? "", /Partial output before turn-budget abort/);
		assert.match(step.output ?? "", /first turn/);
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(asyncDir, { recursive: true, force: true });
		fs.rmSync(resultPath, { force: true });
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});

test("runSync aborts a nonterminal child when turn budget is exceeded", async () => {
	const fakePiDir = makeTwoTurnFakePi(1000);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	try {
		const result = await runSync(
			fakePiDir,
			[makeAgent()],
			"delegate",
			"Keep working",
			{
				runId: "turn-budget-run",
				index: 0,
				turnBudget: { maxTurns: 1, graceTurns: 0 },
			},
		);

		assert.equal(result.exitCode, 1);
		assert.equal(result.turnBudgetExceeded, true);
		assert.equal(result.turnBudget?.outcome, "exceeded");
		assert.match(result.error ?? "", /turn budget/i);
		assert.match(result.finalOutput ?? "", /first turn/);
		assert.match(
			result.finalOutput ?? "",
			/Partial output before turn-budget abort/,
		);
		assert.equal(result.progress?.status, "failed");
	} finally {
		process.env.PATH = oldPath;
		fs.rmSync(fakePiDir, { recursive: true, force: true });
	}
});
