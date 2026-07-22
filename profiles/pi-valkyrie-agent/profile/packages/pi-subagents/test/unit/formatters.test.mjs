import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { buildChainSummary, formatModelThinking } = await loadTs("../../src/shared/formatters.ts");

test("formatModelThinking strips provider prefixes", () => {
	assert.equal(formatModelThinking("anthropic/claude-sonnet-4"), "claude-sonnet-4");
});

test("formatModelThinking renders known thinking suffixes", () => {
	assert.equal(formatModelThinking("google/gemini-2.5-pro:xhigh"), "gemini-2.5-pro · thinking xhigh");
});

test("formatModelThinking renders explicit thinking metadata", () => {
	assert.equal(formatModelThinking("openai/gpt-5", "high"), "gpt-5 · thinking high");
});

test("formatModelThinking ignores unknown explicit thinking metadata", () => {
	assert.equal(formatModelThinking("openai/gpt-5", "unsupported"), "gpt-5");
});

test("buildChainSummary labels dynamic fanout steps", () => {
	const summary = buildChainSummary(
		[
			{
				expand: { from: { output: "targets" } },
				parallel: { agent: "reviewer", task: "Review {item}" },
				collect: { as: "reviews" },
			},
		],
		[
			{
				agent: "reviewer",
				task: "Review target",
				exitCode: 0,
				messages: [],
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
				progress: { index: 0, agent: "reviewer", status: "completed", task: "Review target", recentTools: [], recentOutput: [], toolCount: 0, tokens: 0, durationMs: 0 },
			},
		],
		"/tmp/chain-run",
		"completed",
	);

	assert.match(summary, /Chain completed: expand:reviewer/);
});
