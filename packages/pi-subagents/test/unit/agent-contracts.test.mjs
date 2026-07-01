import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadTs } from "../support/load-ts.mjs";

const {
	mergeAgentsForScope,
	sanitizeProtectedAdvisoryAgentTools,
} = await loadTs("../../src/agents/agent-selection.ts");
const { agentSatisfiesCapability, validateCapabilityRequirements } = await loadTs(
	"../../src/runs/shared/capability-requirements.ts",
);

const testDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(testDir, "../..");
const agentsDir = path.join(packageRoot, "agents");

function frontmatterTools(markdown) {
	const match = markdown.match(/^---\n(?<frontmatter>[\s\S]*?)\n---/);
	assert.ok(match?.groups?.frontmatter, "agent markdown has frontmatter");
	const toolsLine = match.groups.frontmatter
		.split("\n")
		.find((line) => line.startsWith("tools:"));
	if (!toolsLine) return [];
	return toolsLine
		.slice("tools:".length)
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean);
}

test("agents that mention contact_supervisor include the tool", () => {
	for (const fileName of fs.readdirSync(agentsDir)) {
		if (!fileName.endsWith(".md")) continue;

		const filePath = path.join(agentsDir, fileName);
		const markdown = fs.readFileSync(filePath, "utf8");
		if (!markdown.includes("contact_supervisor")) continue;

		assert.ok(
			frontmatterTools(markdown).includes("contact_supervisor"),
			`${fileName} mentions contact_supervisor but does not include it in tools`,
		);
	}
});

const advisoryAgents = [
	"context-builder.md",
	"delegate.md",
	"oracle.md",
	"planner.md",
	"researcher.md",
	"reviewer.md",
	"scout.md",
];

for (const fileName of advisoryAgents) {
	test(`${fileName} is advisory and has no direct file mutation tools`, () => {
		const filePath = path.join(agentsDir, fileName);
		const tools = frontmatterTools(fs.readFileSync(filePath, "utf8"));
		assert.equal(
			tools.includes("edit"),
			false,
			`${fileName} must not have edit`,
		);
		assert.equal(
			tools.includes("write"),
			false,
			`${fileName} must not have write`,
		);
		assert.equal(tools.includes("mcp"), false, `${fileName} must not have mcp`);
		assert.equal(
			tools.includes("ast_grep_replace"),
			false,
			`${fileName} must not have ast_grep_replace`,
		);
	});
}

test("same-name advisory overrides cannot reintroduce direct mutation tools", () => {
	const scoutOverride = {
		name: "scout",
		source: "user",
		tools: ["read", "write", "edit", "./custom-writer.ts", "bash"],
	};
	const sanitized = sanitizeProtectedAdvisoryAgentTools(scoutOverride);
	assert.deepEqual(sanitized.tools, ["read", "bash"]);
	assert.deepEqual(sanitized.extensions, []);
});

test("same-name advisory overrides cannot regain unrestricted default tools by omitting tools", () => {
	const sanitized = sanitizeProtectedAdvisoryAgentTools({
		name: "scout",
		source: "user",
	});
	assert.deepEqual(sanitized.tools, [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		"contact_supervisor",
		"intercom",
	]);
	assert.deepEqual(sanitized.extensions, []);
});

test("protected advisory overrides with omitted tools preserve role-specific defaults", () => {
	const reviewer = sanitizeProtectedAdvisoryAgentTools({
		name: "reviewer",
		source: "user",
	});
	const researcher = sanitizeProtectedAdvisoryAgentTools({
		name: "researcher",
		source: "user",
	});
	assert.equal(reviewer.tools?.includes("web_search"), false);
	assert.deepEqual(reviewer.extensions, []);
	assert.equal(researcher.tools?.includes("web_search"), true);
	assert.equal(researcher.extensions, undefined);
});

for (const name of ["researcher", "context-builder"]) {
	test(`${name} keeps default extensions for safe extension-backed research tools`, () => {
		const sanitized = sanitizeProtectedAdvisoryAgentTools({
			name,
			source: "user",
		});

		assert.equal(sanitized.tools?.includes("web_search"), true);
		assert.equal(sanitized.extensions, undefined);
	});
}

for (const name of ["scout", "reviewer", "planner", "delegate", "oracle"]) {
	test(`${name} disables extensions when no safe extension-backed tools are allowed`, () => {
		const sanitized = sanitizeProtectedAdvisoryAgentTools({
			name,
			source: "user",
		});

		assert.deepEqual(sanitized.extensions, []);
	});

	test(`${name} disables extensions even when overrides request safe extension-backed tools`, () => {
		const sanitized = sanitizeProtectedAdvisoryAgentTools({
			name,
			source: "user",
			tools: ["read", "web_search"],
		});

		assert.deepEqual(sanitized.tools, ["read", "web_search"]);
		assert.deepEqual(sanitized.extensions, []);
	});
}

test("packaged advisory runtime names are sanitized by local role name", () => {
	const sanitized = sanitizeProtectedAdvisoryAgentTools({
		name: "pkg.scout",
		localName: "scout",
		packageName: "pkg",
		source: "user",
		tools: ["read", "write", "./custom-writer.ts"],
	});
	assert.deepEqual(sanitized.tools, ["read"]);
	assert.deepEqual(sanitized.extensions, []);
});

test("protected advisory role names are normalized before sanitizing", () => {
	for (const name of ["Scout", "scout ", "pkg.scout"]) {
		const sanitized = sanitizeProtectedAdvisoryAgentTools({
			name,
			source: "user",
			tools: ["read", "write", "./custom-writer.ts"],
			mcpDirectTools: ["custom_mutator"],
		});
		assert.deepEqual(sanitized.tools, ["read"], `${name} tools`);
		assert.equal(sanitized.mcpDirectTools, undefined, `${name} mcpDirectTools`);
		assert.deepEqual(sanitized.extensions, [], `${name} extensions`);
	}
});

test("protected advisory generic/direct MCP tools and extensions are stripped", () => {
	const sanitized = sanitizeProtectedAdvisoryAgentTools({
		name: "scout",
		source: "user",
		tools: ["read", "mcp"],
		mcpDirectTools: ["google_docs_editDocument", "custom_mutator"],
		extensions: ["./custom-writer.ts"],
	});
	assert.deepEqual(sanitized.tools, ["read"]);
	assert.equal(sanitized.mcpDirectTools, undefined);
	assert.deepEqual(sanitized.extensions, []);
});

test("same-name advisory override is sanitized after user/project precedence", () => {
	const merged = mergeAgentsForScope(
		"both",
		[{ name: "scout", source: "user", tools: ["read", "write"] }],
		[{ name: "scout", source: "project", tools: ["read", "edit", "grep"] }],
		[{ name: "scout", source: "builtin", tools: ["read", "grep"] }],
	);
	assert.deepEqual(merged, [
		{
			name: "scout",
			source: "project",
			tools: ["read", "grep"],
			extensions: [],
		},
	]);
});

test("custom non-advisory agents keep explicit mutation tools", () => {
	const custom = {
		name: "repo-mutator",
		source: "user",
		tools: ["read", "write", "./custom-writer.ts"],
	};
	assert.deepEqual(sanitizeProtectedAdvisoryAgentTools(custom), custom);
});

test("protected advisory agents cannot satisfy MCP capabilities before sanitization", () => {
	assert.equal(
		agentSatisfiesCapability(
			{ name: "scout", source: "user", tools: ["read", "mcp"] },
			"mcp",
		),
		false,
	);
	assert.equal(
		agentSatisfiesCapability(
			{ name: "scout", source: "user", mcpDirectTools: ["example_readOnlyTool"] },
			"direct-mcp",
		),
		false,
	);
});

test("declared MCP capability requirements fail fast for sanitized advisory agents", () => {
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

	assert.match(
		validateCapabilityRequirements(
			{
				tasks: [{ agent: "researcher", task: "use extensions", requiresCapabilities: ["custom-extension"] }],
			},
			[{ name: "researcher", source: "builtin", tools: ["read", "web_search"] }],
		) ?? "",
		/requires custom-extension/,
	);
});
