import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveExecutionAgentScope } from "../../src/agents/agent-scope.ts";
import { PROJECT_RESOURCES_ENV } from "../../src/shared/project-resources.ts";

describe("resolveExecutionAgentScope", () => {
	it("defaults to both when scope is omitted", () => {
		assert.equal(resolveExecutionAgentScope(undefined), "both");
	});

	it("passes through explicit scopes", () => {
		assert.equal(resolveExecutionAgentScope("user"), "user");
		assert.equal(resolveExecutionAgentScope("project"), "project");
		assert.equal(resolveExecutionAgentScope("both"), "both");
	});

	it("forces user scope when project resources are ignored", () => {
		const previous = process.env[PROJECT_RESOURCES_ENV];
		process.env[PROJECT_RESOURCES_ENV] = "ignore";
		try {
			assert.equal(resolveExecutionAgentScope(undefined), "user");
			assert.equal(resolveExecutionAgentScope("project"), "user");
			assert.equal(resolveExecutionAgentScope("both"), "user");
		} finally {
			if (previous === undefined) delete process.env[PROJECT_RESOURCES_ENV];
			else process.env[PROJECT_RESOURCES_ENV] = previous;
		}
	});

	it("falls back to both for invalid scopes", () => {
		assert.equal(resolveExecutionAgentScope("invalid"), "both");
		assert.equal(resolveExecutionAgentScope(""), "both");
	});
});
