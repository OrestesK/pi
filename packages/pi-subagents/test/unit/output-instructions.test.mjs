import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { injectSingleOutputInstruction } = await loadTs(
	"../../src/runs/shared/single-output.ts",
);
const { buildChainInstructions } = await loadTs("../../src/shared/settings.ts");
const { expectsImplementationMutation } = await loadTs(
	"../../src/runs/shared/completion-guard.ts",
);
const { extractOutputTarget } = await loadTs("../../src/tui/render.ts");

test("single output instruction says the parent saves the final response", () => {
	const task = injectSingleOutputInstruction("Research the topic", "/tmp/research.md");

	assert.match(task, /final response will be saved to: \/tmp\/research\.md/i);
	assert.doesNotMatch(task, /write your findings to/i);
});

test("single output save instructions do not imply implementation mutation", () => {
	const task = injectSingleOutputInstruction("Summarize findings", "/tmp/add.md");

	assert.equal(expectsImplementationMutation("worker", task), false);
});

test("chain output save instructions do not imply implementation mutation", () => {
	assert.equal(
		expectsImplementationMutation(
			"worker",
			"[Final response will be saved to: /tmp/add.md]\n\nSummarize findings",
		),
		false,
	);
});

test("TUI output target parser handles supported output formats and spaces", () => {
	assert.equal(
		extractOutputTarget("**Output:** Your final response will be saved to: /tmp/report with spaces.md"),
		"/tmp/report with spaces.md",
	);
	assert.equal(
		extractOutputTarget("[Final response will be saved to: /tmp/chain report.md]"),
		"/tmp/chain report.md",
	);
	assert.equal(
		extractOutputTarget("[Write to: /tmp/legacy bracket report.md]"),
		"/tmp/legacy bracket report.md",
	);
	assert.equal(
		extractOutputTarget("Write your findings to: /tmp/legacy report.md"),
		"/tmp/legacy report.md",
	);
	assert.equal(
		extractOutputTarget("Output: /tmp/manual report.md"),
		"/tmp/manual report.md",
	);
	assert.equal(
		extractOutputTarget("Output to: /tmp/manual output-to report.md"),
		"/tmp/manual output-to report.md",
	);
});

test("chain output instruction says the parent saves the final response", () => {
	const { prefix } = buildChainInstructions(
		{
			output: "research.md",
			outputMode: "inline",
			reads: false,
			progress: false,
			skills: false,
		},
		"/tmp/chain-run",
		false,
	);

	assert.match(prefix, /final response will be saved to: \/tmp\/chain-run\/research\.md/i);
	assert.doesNotMatch(prefix, /write to:/i);
});
