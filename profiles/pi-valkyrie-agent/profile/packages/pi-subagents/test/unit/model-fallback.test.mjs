import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const {
	isRetryableModelFailure,
	resolveModelCandidate,
	resolveSubagentModelOverride,
} = await loadTs("../../src/runs/shared/model-fallback.ts");

test("classifies websocket transport closures as retryable model failures", () => {
	assert.equal(
		isRetryableModelFailure("WebSocket closed 1006 Connection ended"),
		true,
	);
	assert.equal(isRetryableModelFailure("websocket closed unexpectedly"), true);
	assert.equal(
		isRetryableModelFailure("Connection closed before response completed"),
		true,
	);
});

test("does not classify tool-policy blocks or generic task failures as retryable model failures", () => {
	assert.equal(isRetryableModelFailure("Edit without read"), false);
	assert.equal(
		isRetryableModelFailure("BLOCKED — Ambiguous edit target"),
		false,
	);
	assert.equal(isRetryableModelFailure("database connection closed"), false);
});

const availableModels = [
	{ provider: "openai", id: "gpt-4.1", fullId: "openai/gpt-4.1" },
	{ provider: "anthropic", id: "claude-sonnet-4-20250514", fullId: "anthropic/claude-sonnet-4-20250514" },
];

test("resolves loose model names with separator and date normalization", () => {
	assert.equal(resolveModelCandidate("claude_sonnet_4", availableModels), "anthropic/claude-sonnet-4-20250514");
	assert.equal(resolveModelCandidate("openai:gpt_4_1:high", availableModels), "openai/gpt-4.1:high");
});

test("subagent model override inherits parent session model when no explicit model is requested", () => {
	assert.equal(
		resolveSubagentModelOverride(undefined, { provider: "openai", id: "gpt-4.1" }, availableModels, "anthropic"),
		"openai/gpt-4.1",
	);
	assert.equal(
		resolveSubagentModelOverride("inherit", { provider: "openai", id: "gpt-4.1" }, availableModels, "anthropic"),
		"openai/gpt-4.1",
	);
});

test("subagent model scope rejects explicit out-of-scope overrides", () => {
	assert.throws(
		() => resolveSubagentModelOverride("anthropic/claude-sonnet-4-20250514", { provider: "openai", id: "gpt-4.1" }, availableModels, "openai", { scope: { enforce: true, allow: ["openai/*"] }, source: "explicit" }),
		/Model 'anthropic\/claude-sonnet-4-20250514' is outside the configured subagent model scope/,
	);
});

test("subagent model scope warns for inherited out-of-scope fallback candidates", () => {
	const warnings = [];
	assert.equal(
		resolveSubagentModelOverride(undefined, { provider: "anthropic", id: "claude-sonnet-4-20250514" }, availableModels, "openai", { scope: { enforce: true, allow: ["openai/*"] }, onWarn: (violation) => warnings.push(violation) }),
		"anthropic/claude-sonnet-4-20250514",
	);
	assert.equal(warnings.length, 1);
	assert.equal(warnings[0].severity, "warn");
});
