import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "../support/load-ts.mjs";

const { mergeAgentsForScope } = await loadTs("../../src/agents/agent-selection.ts");
const { agentSatisfiesCapability, validateCapabilityRequirements } =
	await loadTs("../../src/runs/shared/capability-requirements.ts");
const { handleManagementAction } = await loadTs(
	"../../src/agents/agent-management.ts",
);

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "../..");
const agentsDir = path.join(packageRoot, "agents");

const roleAgentFiles = [
	"context-builder.md",
	"delegate.md",
	"oracle.md",
	"planner.md",
	"researcher.md",
	"reviewer.md",
	"scout.md",
	"worker.md",
];

test("packaged roles declare capability authority in frontmatter", () => {
	for (const fileName of roleAgentFiles) {
		const markdown = fs.readFileSync(path.join(agentsDir, fileName), "utf8");
		const match = markdown.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/);
		assert.ok(match?.groups?.frontmatter, `${fileName} has frontmatter`);
		assert.match(
			match.groups.frontmatter,
			/^tools: .+/m,
			`${fileName} declares tools`,
		);
		if (fileName === "reviewer.md") {
			assert.match(
				match.groups.frontmatter,
				/^description: Read-only review specialist/m,
			);
		}
	}
});

test("management get reports the selected file's tools unchanged", () => {
	const root = fs.mkdtempSync(
		path.join(os.tmpdir(), "pi-subagents-management-profile-"),
	);
	const agentDir = path.join(root, "agent-home");
	const oldAgentDir = process.env.PI_CODING_AGENT_DIR;
	process.env.PI_CODING_AGENT_DIR = agentDir;
	fs.mkdirSync(path.join(agentDir, "agents"), { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "agents", "general-purpose.md"),
		"---\nname: general-purpose\ndescription: Context analyst\ntools: write, mcp:custom/mutate\n---\n\nAnalyze context.\n",
		"utf8",
	);

	try {
		const got = handleManagementAction(
			"get",
			{ agent: "general-purpose" },
			{ cwd: root, modelRegistry: { getAvailable: () => [] } },
		);
		const text = got.content[0]?.text ?? "";
		assert.match(text, /Tools: write, mcp:custom\/mutate/);
	} finally {
		if (oldAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = oldAgentDir;
		fs.rmSync(root, { recursive: true, force: true });
	}
});

test("capability checks use the selected file's declared tools", () => {
	assert.equal(
		agentSatisfiesCapability(
			{ name: "scout", source: "user", tools: ["read", "mcp"] },
			"mcp",
		),
		true,
	);
	assert.equal(
		agentSatisfiesCapability(
			{ name: "scout", source: "user", mcpDirectTools: ["example_readOnlyTool"] },
			"direct-mcp",
		),
		true,
	);
});

test("declared capability requirements fail when the selected file lacks them", () => {
	const message = validateCapabilityRequirements(
		{
			tasks: [
				{
					agent: "scout",
					task: "inspect an MCP resource",
					requiresCapabilities: ["mcp"],
				},
			],
		},
		[{ name: "scout", source: "builtin", tools: ["read"] }],
	);

	assert.match(message ?? "", /scout/);
	assert.match(message ?? "", /requires mcp/);
	assert.match(message ?? "", /cannot satisfy/);
});

test("declared capability requirements pass when the selected agent exposes them", () => {
	const message = validateCapabilityRequirements(
		{
			tasks: [
				{
					agent: "mcp-reader",
					task: "inspect an MCP resource",
					requiresCapabilities: ["mcp", "direct-mcp"],
				},
			],
		},
		[
			{
				name: "mcp-reader",
				source: "project",
				tools: ["read", "mcp"],
				mcpDirectTools: ["example_readResource"],
			},
		],
	);

	assert.equal(message, undefined);
});

test("declared capability requirements are rejected when not attached to a concrete agent", () => {
	assert.match(
		validateCapabilityRequirements(
			{ tasks: [{ agent: "scout", task: "read" }], requiresCapabilities: ["mcp"] },
			[{ name: "scout", source: "builtin", tools: ["read"] }],
		) ?? "",
		/concrete agent-bearing task/,
	);
	assert.match(
		validateCapabilityRequirements(
			{
				chain: [
					{
						requiresCapabilities: ["mcp"],
						parallel: [{ agent: "scout", task: "read" }],
					},
				],
			},
			[{ name: "scout", source: "builtin", tools: ["read"] }],
		) ?? "",
		/concrete agent-bearing task/,
	);
});

test("custom-extension capability allows default extension loading but rejects explicit no-extension agents", () => {
	assert.equal(
		validateCapabilityRequirements(
			{
				tasks: [{ agent: "custom", task: "use default extensions", requiresCapabilities: ["custom-extension"] }],
			},
			[{ name: "custom", source: "project", tools: ["read"] }],
		),
		undefined,
	);

	assert.match(
		validateCapabilityRequirements(
			{
				tasks: [{ agent: "scout", task: "use extensions", requiresCapabilities: ["custom-extension"] }],
			},
			[{ name: "scout", source: "builtin", tools: ["read"], extensions: [] }],
		) ?? "",
		/requires custom-extension/,
	);

	assert.equal(
		validateCapabilityRequirements(
			{
				tasks: [{ agent: "researcher", task: "use extensions", requiresCapabilities: ["custom-extension"] }],
			},
			[{ name: "researcher", source: "builtin", tools: ["read", "web_search"] }],
		),
		undefined,
	);
});

test("merge precedence preserves the winning file's capabilities", () => {
	const merged = mergeAgentsForScope(
		"both",
		[{ name: "general-purpose", source: "user", tools: ["read", "write"] }],
		[
			{
				name: "general-purpose",
				source: "project",
				tools: ["read", "write", "mcp", "subagent"],
				mcpDirectTools: [
					"context-mode/ctx_search",
					"context-mode/ctx_execute",
					"custom/mutate",
				],
				extensions: ["./custom-writer.ts"],
			},
		],
		[{ name: "general-purpose", source: "builtin", tools: ["read"] }],
	);
	assert.deepEqual(merged, [
		{
			name: "general-purpose",
			source: "project",
			tools: ["read", "write", "mcp", "subagent"],
			mcpDirectTools: [
				"context-mode/ctx_search",
				"context-mode/ctx_execute",
				"custom/mutate",
			],
			extensions: ["./custom-writer.ts"],
		},
	]);
});
