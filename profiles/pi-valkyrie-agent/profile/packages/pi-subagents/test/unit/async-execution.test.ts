import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import { buildAsyncRunnerSteps, formatAsyncStartedMessage, resolveAsyncRunnerLogPaths } from "../../src/runs/background/async-execution.ts";
import type { AgentConfig } from "../../src/agents/agents.ts";

const agent = (name: string, toolBudget?: AgentConfig["toolBudget"]): AgentConfig => ({
	name,
	description: `${name} agent`,
	systemPromptMode: "replace",
	inheritProjectContext: false,
	inheritSkills: false,
	systemPrompt: "You are a test agent.",
	source: "project",
	filePath: `${name}.md`,
	...(toolBudget ? { toolBudget } : {}),
});

const ctx = {
	pi: {} as never,
	cwd: process.cwd(),
	currentSessionId: "session-1",
	currentModel: undefined,
	currentModelProvider: undefined,
	modelScope: undefined,
};

describe("async runner execution", () => {
	it("guides async parents to yield for completion notifications", () => {
		const message = formatAsyncStartedMessage("Async: worker [run-1]");

		assert.match(message, /Do not run sleep timers or polling loops/i);
		assert.match(message, /Persistent interactive parents should continue useful work/i);
		assert.match(message, /During waits, they may do independent reflection or permitted internal-state maintenance, but only when this work cannot delay required work/i);
		assert.match(message, /When no useful work, independent reflection, or permitted maintenance remains, yield/i);
		assert.doesNotMatch(message, /\bSlack\b/i);
		assert.match(message, /completion notifications resume persistent interactive parents/i);
		assert.match(message, /without another user prompt/i);
		assert.match(message, /inspect relevant completed outputs before dependent decisions or final claims/i);
		assert.doesNotMatch(message, /\bwait\(\)/i);
		assert.doesNotMatch(message, /\bwait tool\b/i);
	});

	it("places detached runner stdio logs in the async run directory", () => {
		const asyncDir = path.join("tmp", "async-run");
		assert.deepEqual(resolveAsyncRunnerLogPaths({ asyncDir }), {
			stdoutPath: path.join(asyncDir, "runner.stdout.log"),
			stderrPath: path.join(asyncDir, "runner.stderr.log"),
		});
	});

	it("omits runner log paths when asyncDir is unavailable", () => {
		assert.equal(resolveAsyncRunnerLogPaths({}), undefined);
	});

	it("resolves async step tool budgets with step over run over agent over config precedence", () => {
		const result = buildAsyncRunnerSteps("run-1", {
			chain: [
				{ agent: "worker", task: "agent beats config" },
				{ agent: "worker", task: "step beats run", toolBudget: { hard: 2, block: ["grep"] } },
			],
			agents: [agent("worker", { hard: 4, block: ["read"] })],
			extensionConfig: {},
			ctx,
			asyncDir: path.join(process.cwd(), ".tmp-async-test"),
			maxSubagentDepth: 2,
			toolBudget: { hard: 3, block: ["find"] },
			configToolBudget: { hard: 5, block: ["ls"] },
		});

		assert.ok("steps" in result, "expected successful step build");
		const firstStep = result.steps[0];
		const secondStep = result.steps[1];
		assert.ok(firstStep && !("parallel" in firstStep));
		assert.ok(secondStep && !("parallel" in secondStep));
		assert.deepEqual(firstStep.toolBudget, { hard: 3, block: ["find"] });
		assert.deepEqual(secondStep.toolBudget, { hard: 2, block: ["grep"] });
	});

	it("resolves tool-extension bundles into async runner steps", () => {
		const result = buildAsyncRunnerSteps("run-tools", {
			chain: [
				{ agent: "worker", task: "use MCP", toolExtensions: { add: ["mcp"] } },
			],
			agents: [{ ...agent("worker"), tools: ["read"] }],
			extensionConfig: {
				toolExtensions: {
					mcp: {
						description: "Regular MCP access",
						builtinTools: ["mcp"],
						allowedAgents: ["worker"],
					},
				},
			},
			ctx,
			asyncDir: path.join(process.cwd(), ".tmp-async-test"),
			maxSubagentDepth: 2,
		});

		assert.ok("steps" in result, "expected successful step build");
		const step = result.steps[0];
		assert.ok(step && !("parallel" in step));
		assert.deepEqual(step.tools, ["read", "mcp"]);
	});

	it("uses agent tool budget before config default when no run override exists", () => {
		const result = buildAsyncRunnerSteps("run-2", {
			chain: [{ agent: "worker", task: "agent beats config" }],
			agents: [agent("worker", { hard: 4, block: ["read"] })],
			extensionConfig: {},
			ctx,
			asyncDir: path.join(process.cwd(), ".tmp-async-test"),
			maxSubagentDepth: 2,
			configToolBudget: { hard: 5, block: ["ls"] },
		});

		assert.ok("steps" in result, "expected successful step build");
		const step = result.steps[0];
		assert.ok(step && !("parallel" in step));
		assert.deepEqual(step.toolBudget, { hard: 4, block: ["read"] });
	});

	it("uses config default when no step, run, or agent budget exists", () => {
		const result = buildAsyncRunnerSteps("run-3", {
			chain: [{ agent: "worker", task: "config default" }],
			agents: [agent("worker")],
			extensionConfig: {},
			ctx,
			asyncDir: path.join(process.cwd(), ".tmp-async-test"),
			maxSubagentDepth: 2,
			configToolBudget: { hard: 5, block: ["ls"] },
		});

		assert.ok("steps" in result, "expected successful step build");
		const step = result.steps[0];
		assert.ok(step && !("parallel" in step));
		assert.deepEqual(step.toolBudget, { hard: 5, block: ["ls"] });
	});
});
