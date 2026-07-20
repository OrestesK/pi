import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

import {
	buildPiOutputBudgetPatch,
	PI_CONTEXT_BATCH_TOOL,
	PI_CONTEXT_SEARCH_TOOL,
	PI_OUTPUT_BUDGET_BYTES,
	PI_OUTPUT_BUDGET_NOTICE,
	PI_SEARCH_OUTPUT_BUDGET_BYTES,
} from "../build/pi-output-budget.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(__dirname, "..");

function byteLength(text) {
	return Buffer.byteLength(text, "utf8");
}

function oneTextBlock(text) {
	return [{ type: "text", text }];
}

function mcpEvent(tool, text, extra = {}) {
	return {
		toolName: "mcp",
		input: { args: "{}", tool },
		content: oneTextBlock(text),
		details: { error: null, mcpResult: { ok: true }, mode: "tool" },
		isError: false,
		...extra,
	};
}

function assertBudgetedPatch(patch, budget) {
	assert.ok(patch);
	assert.deepEqual(Object.keys(patch), ["content"]);
	assert.equal(patch.content.length, 1);
	assert.equal(patch.content[0].type, "text");
	assert.ok(patch.content[0].text.endsWith(PI_OUTPUT_BUDGET_NOTICE));
	assert.ok(byteLength(patch.content[0].text) <= budget);
	assert.equal(
		Buffer.from(patch.content[0].text, "utf8").toString("utf8"),
		patch.content[0].text,
	);
}

test("caps search output to exactly 80 KiB including notice", () => {
	const patch = buildPiOutputBudgetPatch(
		mcpEvent(PI_CONTEXT_SEARCH_TOOL, "s".repeat(100 * 1024)),
	);

	assertBudgetedPatch(patch, PI_OUTPUT_BUDGET_BYTES);
	assert.equal(byteLength(patch.content[0].text), PI_OUTPUT_BUDGET_BYTES);
});

test("caps batch output to exactly 80 KiB including notice", () => {
	const patch = buildPiOutputBudgetPatch(
		mcpEvent(PI_CONTEXT_BATCH_TOOL, "b".repeat(100 * 1024)),
	);

	assertBudgetedPatch(patch, PI_OUTPUT_BUDGET_BYTES);
	assert.equal(byteLength(patch.content[0].text), PI_OUTPUT_BUDGET_BYTES);
});

test("caps immediately before a multibyte character without splitting UTF-8", () => {
	const payloadBytes =
		PI_SEARCH_OUTPUT_BUDGET_BYTES - byteLength(PI_OUTPUT_BUDGET_NOTICE);
	const prefix = "a".repeat(payloadBytes - 1);
	const suffix = "z".repeat(byteLength(PI_OUTPUT_BUDGET_NOTICE));
	const patch = buildPiOutputBudgetPatch(
		mcpEvent(PI_CONTEXT_SEARCH_TOOL, `${prefix}🙂${suffix}`),
	);

	assertBudgetedPatch(patch, PI_SEARCH_OUTPUT_BUDGET_BYTES);
	assert.equal(patch.content[0].text, `${prefix}${PI_OUTPUT_BUDGET_NOTICE}`);
	assert.doesNotMatch(patch.content[0].text, /�/u);
});

test("returns undefined for under-budget targeted output", () => {
	assert.equal(
		buildPiOutputBudgetPatch(mcpEvent(PI_CONTEXT_SEARCH_TOOL, "small result")),
		undefined,
	);
	assert.equal(
		buildPiOutputBudgetPatch(mcpEvent(PI_CONTEXT_BATCH_TOOL, "small result")),
		undefined,
	);
});

test("caps generic MCP and native tool results", () => {
	const large = "x".repeat(100 * 1024);
	const events = [
		mcpEvent("slack_conversations_search_messages", large),
		{
			toolName: "read",
			input: { path: "/tmp/example" },
			content: oneTextBlock(large),
		},
	];

	for (const event of events)
		assertBudgetedPatch(
			buildPiOutputBudgetPatch(event),
			PI_OUTPUT_BUDGET_BYTES,
		);
});

test("caps aggregate text across blocks while preserving non-text blocks", () => {
	const patch = buildPiOutputBudgetPatch({
		toolName: "mcp",
		input: { tool: "notion_notion_fetch" },
		content: [
			{ type: "text", text: "a".repeat(70 * 1024) },
			{ type: "image", data: "preserve-me", mimeType: "image/png" },
			{ type: "text", text: "b".repeat(20 * 1024) },
		],
	});

	assert.ok(patch);
	assert.equal(patch.content[1].type, "image");
	assert.equal(patch.content[1].data, "preserve-me");
	const text = patch.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("");
	assert.ok(byteLength(text) <= PI_OUTPUT_BUDGET_BYTES);
	assert.ok(text.endsWith(PI_OUTPUT_BUDGET_NOTICE));
});

test("passes through under-budget and empty results", () => {
	assert.equal(
		buildPiOutputBudgetPatch({
			toolName: "mcp",
			input: { tool: "slack" },
			content: [],
		}),
		undefined,
	);
	assert.equal(
		buildPiOutputBudgetPatch({
			toolName: "mcp",
			input: { tool: "slack" },
			content: oneTextBlock("small result"),
		}),
		undefined,
	);
});

test("real Pi adapter returns budget patches without session tracking", async () => {
	const tempHome = await mkdtemp(join(tmpdir(), "pi-context-mode-home-"));
	const childScript = join(tempHome, "adapter-budget-child.mjs");
	await writeFile(
		childScript,
		`
      import assert from "node:assert/strict";
      const {
        PI_CONTEXT_BATCH_TOOL,
        PI_CONTEXT_SEARCH_TOOL,
        PI_OUTPUT_BUDGET_BYTES,
        PI_OUTPUT_BUDGET_NOTICE,
      } = await import(${JSON.stringify(pathToFileURL(join(packageRoot, "build/pi-output-budget.js")).href)});
      const { default: piExtension } = await import(${JSON.stringify(pathToFileURL(join(packageRoot, "build/pi-extension.js")).href)});
      const handlers = new Map();
      piExtension({
        on(name, handler) {
          handlers.set(name, handler);
        },
        registerCommand() {},
      });
      const toolResult = handlers.get("tool_result");
      assert.equal(typeof toolResult, "function");
      const oneTextBlock = (text) => [{ type: "text", text }];
      const byteLength = (text) => Buffer.byteLength(text, "utf8");
      for (const [tool, budget, payload] of [
        [PI_CONTEXT_SEARCH_TOOL, PI_OUTPUT_BUDGET_BYTES, "s".repeat(100 * 1024)],
        [PI_CONTEXT_BATCH_TOOL, PI_OUTPUT_BUDGET_BYTES, "b".repeat(100 * 1024)],
        ["slack_conversations_search_messages", PI_OUTPUT_BUDGET_BYTES, "x".repeat(100 * 1024)],
      ]) {
        const patch = toolResult({
          toolName: "mcp",
          input: { args: "{}", tool },
          content: oneTextBlock(payload),
          details: { error: null, mcpResult: { ok: true }, mode: "tool" },
          isError: false,
        });
        assert.ok(patch);
        assert.deepEqual(Object.keys(patch), ["content"]);
        assert.equal(patch.content.length, 1);
        assert.equal(patch.content[0].type, "text");
        assert.ok(patch.content[0].text.endsWith(PI_OUTPUT_BUDGET_NOTICE));
        assert.ok(byteLength(patch.content[0].text) <= budget);
      }
    `,
	);

	try {
		const result = await new Promise((resolve) => {
			execFile(
				process.execPath,
				[childScript],
				{
					cwd: packageRoot,
					env: { ...process.env, HOME: tempHome, PI_PROJECT_DIR: packageRoot },
					timeout: 15_000,
				},
				(error, stdout, stderr) => resolve({ error, stdout, stderr }),
			);
		});

		assert.equal(result.error, null, result.stderr || result.stdout);
		assert.equal(result.stderr, "");
	} finally {
		await rm(tempHome, { recursive: true, force: true });
	}
});
