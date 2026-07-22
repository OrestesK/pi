import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AgentConfig } from "../../src/agents/agents.ts";
import { validateCapabilityRequirements } from "../../src/runs/shared/capability-requirements.ts";

const researcher: AgentConfig = {
	name: "researcher",
	description: "Researcher",
	systemPromptMode: "replace",
	inheritProjectContext: false,
	inheritSkills: false,
	systemPrompt: "",
	source: "builtin",
	filePath: "researcher.md",
};

describe("capability requirements", () => {
	it("checks capabilities after applying per-task tool extensions", () => {
		const error = validateCapabilityRequirements(
			{
				tasks: [
					{
						agent: "researcher",
						requiresCapabilities: ["mcp"],
						toolExtensions: { add: ["mcp"] },
					},
				],
			},
			[researcher],
			{
				toolExtensions: {
					mcp: {
						description: "Regular MCP access",
						builtinTools: ["mcp"],
						allowedAgents: ["researcher"],
					},
				},
			},
		);

		assert.equal(error, undefined);
	});
});
