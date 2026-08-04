import assert from "node:assert/strict";
import * as path from "node:path";
import { describe, it } from "node:test";
import type { AgentConfig } from "../../src/agents/agents.ts";
import { buildAsyncRunnerSteps } from "../../src/runs/background/async-execution.ts";
import { buildPiArgs } from "../../src/runs/shared/pi-args.ts";
import type { ExtensionConfig } from "../../src/shared/types.ts";

const ctx = {
	pi: {} as never,
	cwd: process.cwd(),
	currentSessionId: "session-1",
	currentModel: undefined,
	currentModelProvider: undefined,
	modelScope: undefined,
};

function agent(name: string, tools: string[] = ["read"]): AgentConfig {
	return {
		name,
		description: name,
		tools,
		systemPromptMode: "replace",
		inheritProjectContext: false,
		inheritSkills: false,
		systemPrompt: "",
		source: "builtin",
		filePath: `/agents/${name}.md`,
	};
}

function config(
	toolExtensions: NonNullable<ExtensionConfig["toolExtensions"]>,
): ExtensionConfig {
	return { toolExtensions };
}

function build(
	agents: AgentConfig[],
	extensionConfig: ExtensionConfig,
	toolExtensions: { add?: string[] },
	agentName = "researcher",
) {
	return buildAsyncRunnerSteps("run-tools", {
		chain: [{ agent: agentName, task: "research", toolExtensions }],
		agents,
		extensionConfig,
		ctx,
		asyncDir: path.join(process.cwd(), ".tmp-async-test"),
		maxSubagentDepth: 2,
	});
}

describe("tool extensions", () => {
	it("merges configured additions without mutating the base agent", () => {
		const base = agent("researcher", ["read", "grep"]);
		const result = build(
			[base],
			config({
				mcp: {
					description: "Regular MCP access",
					builtinTools: ["mcp", "mcp"],
					allowedAgents: ["researcher"],
				},
			}),
			{ add: ["mcp"] },
		);

		assert.ok("steps" in result);
		const step = result.steps[0];
		assert.ok(step && !("parallel" in step));
		assert.deepEqual(step.tools, ["read", "grep", "mcp"]);
		assert.deepEqual(base.tools, ["read", "grep"]);
	});

	it("passes merged builtin tools to the child CLI argument builder", () => {
		const result = build(
			[agent("researcher")],
			config({
				mcp: {
					description: "Regular MCP access",
					builtinTools: ["mcp"],
					allowedAgents: ["researcher"],
				},
			}),
			{ add: ["mcp"] },
		);
		assert.ok("steps" in result);
		const step = result.steps[0];
		assert.ok(step && !("parallel" in step));

		const { args } = buildPiArgs({
			baseArgs: [],
			task: "research",
			sessionEnabled: true,
			inheritProjectContext: false,
			inheritSkills: false,
			tools: step.tools,
		});

		assert.deepEqual(args.slice(0, 2), ["--tools", "read,mcp"]);
	});

	it("rejects unknown bundles, invalid tools, and disallowed agents", () => {
		const valid = config({
			mcp: {
				description: "Regular MCP access",
				builtinTools: ["mcp"],
				allowedAgents: ["researcher"],
			},
		});

		assert.throws(
			() => build([agent("researcher")], valid, { add: ["missing"] }),
			/Unknown tool extension bundle 'missing'/,
		);
		for (const id of ["toString", "constructor", "__proto__"]) {
			assert.throws(
				() => build([agent("researcher")], valid, { add: [id] }),
				(error: unknown) =>
					error instanceof Error &&
					error.message === `Unknown tool extension bundle '${id}'.`,
			);
		}
		assert.throws(
			() =>
				build(
					[agent("researcher"), agent("scout")],
					valid,
					{ add: ["mcp"] },
					"scout",
				),
			/Agent 'scout' is not allowed/,
		);
		assert.throws(
			() =>
				build(
					[agent("researcher")],
					config({
						mcp: {
							description: "MCP",
							builtinTools: ["not-a-tool"],
							allowedAgents: ["researcher"],
						},
					}),
					{ add: ["mcp"] },
				),
			/Unknown builtin tool 'not-a-tool'/,
		);
	});
});
