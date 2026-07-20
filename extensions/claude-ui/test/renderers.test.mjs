import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { visibleWidth } from "@earendil-works/pi-tui";

import { loadTs } from "../../../packages/pi-subagents/test/support/load-ts.mjs";

const corePath = fileURLToPath(new URL("../core.ts", import.meta.url));
const { __claudeUiTestInternals: ui } = await loadTs(corePath);

const theme = {
	fg: (_name, text) => text,
	bg: (_name, text) => text,
	bold: (text) => text,
	italic: (text) => text,
	strikethrough: (text) => text,
};

const renderLines = (component, width = 160) => component.render(width);
const render = (component, width = 160) =>
	renderLines(component, width).join("\n");
const textResult = (text, details = undefined) => ({
	content: [{ type: "text", text }],
	...(details === undefined ? {} : { details }),
});
const context = (args = {}, extra = {}) => ({
	args,
	toolCallId: "tool-call-test",
	cwd: process.cwd(),
	executionStarted: true,
	argsComplete: true,
	isPartial: false,
	expanded: false,
	showImages: false,
	isError: false,
	invalidate() {},
	...extra,
});
const options = (extra = {}) => ({
	expanded: false,
	isPartial: false,
	...extra,
});
const virtualizedReceipt = (toolName = "read") =>
	[
		`[tool-result-virtualizer] Large ${toolName} result stored locally`,
		"Source: tr_mock",
		"Capture: event.content; size: 50.0 KiB, 1800 lines; sha256: abc",
		"Preview only — not complete evidence. Do not make claims about hidden content from this receipt alone.",
		"",
		"## Cropped preview",
		"Preview only — not complete evidence. Use the recommended summary path or exact retrieval/export before making claims about hidden content.",
		"Sampled 30 of 1800 lines; omitted 1770 hidden lines.",
		"### Head lines 1-10",
		...Array.from(
			{ length: 10 },
			(_, index) => `${index + 1}: head ${index + 1}`,
		),
		"[omitted 885 lines between samples]",
		"### Middle lines 896-905",
		...Array.from(
			{ length: 10 },
			(_, index) => `${896 + index}: middle ${896 + index}`,
		),
		"[omitted 885 lines between samples]",
		"### Tail lines 1791-1800",
		...Array.from(
			{ length: 10 },
			(_, index) => `${1791 + index}: tail ${1791 + index}`,
		),
		"",
		"## Choose before relying on hidden content",
		'Recommended summary path: call tool_result_summary_contract sourceId:"tr_mock" prompt:"<focused question>".',
	].join("\n");
const virtualizerDetails = (extra = {}) => ({
	toolResultVirtualizer: {
		sourceId: "tr_mock",
		toolName: "read",
		lineCount: 1800,
		contentReplaced: true,
		...extra,
	},
});
const virtualizerFailureDetails = (extra = {}) => ({
	toolResultVirtualizerFailure: {
		toolName: "read",
		byteCount: 51200,
		lineCount: 1800,
		contentWithheld: true,
		receiptBytes: 160,
		...extra,
	},
});
const virtualizedFailureReceipt = (toolName = "read") =>
	[
		`[tool-result-virtualizer] Large ${toolName} result failed before local storage completed`,
		"Original content withheld: 50.0 KiB, 1800 lines",
		"No source id was created. Retry the original tool call after fixing the local tool-result virtualizer store.",
	].join("\n");
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function assertRenderedWithinWidth(component, widths = [40, 80, 160]) {
	for (const width of widths) {
		for (const line of renderLines(component, width)) {
			assert.ok(
				visibleWidth(line) <= width,
				`line exceeds width ${width}: ${line}`,
			);
		}
	}
}

const expectedAllowlist = [
	"web_search",
	"code_search",
	"fetch_content",
	"get_search_content",
	"Agent",
	"mcp",
	"intercom",
	"contact_supervisor",
	"subagent",
	"subagent_list",
	"subagent_done",
	"todo",
	"tape_handoff",
	"tape_list",
	"tape_delete",
	"tape_info",
	"tape_search",
	"tape_read",
	"tape_reset",
	"ask_user",
	"tree_sitter_search_symbols",
	"tree_sitter_document_symbols",
	"tree_sitter_symbol_definition",
	"tree_sitter_pattern_search",
	"tree_sitter_codebase_overview",
	"tree_sitter_codebase_map",
	"ast_grep_search",
	"ast_grep_replace",
	"ast_grep_outline",
	"ast_grep_dump",
	"ast_dump",
	"lens_diagnostics",
	"symbol_search",
	"module_report",
	"read_symbol",
	"read_enclosing",
	"lsp_navigation",
	"lsp_diagnostics",
	"memory_search",
	"memory_write",
	"memory_list",
	"memory_check",
	"memory_sync",
	"tool_result_outline",
	"tool_result_get",
	"tool_result_search",
	"tool_result_list",
	"tool_result_diagnostics",
	"tool_result_retention_preview",
	"tool_result_export_details",
	"tool_result_export",
];

const callMatrix = [
	["web_search", { queries: ["alpha", "beta"] }, "2 queries"],
	["web_search", { query: "alpha query" }, "alpha query"],
	["web_search", {}, "…"],
	[
		"code_search",
		{ query: "TypeScript renderer examples" },
		"TypeScript renderer examples",
	],
	["code_search", {}, "…"],
	[
		"fetch_content",
		{ urls: ["https://example.test/a", "https://example.test/b"] },
		"2 urls",
	],
	[
		"fetch_content",
		{ url: "https://example.test/long/path", timestamp: "1:23", frames: 3 },
		"https://example.test/long/path",
	],
	["fetch_content", {}, "…"],
	["get_search_content", { responseId: "resp-1", query: "alpha" }, "alpha"],
	[
		"get_search_content",
		{ responseId: "resp-2", url: "https://example.test" },
		"https://example.test",
	],
	["get_search_content", { responseId: "resp-3", queryIndex: 0 }, "query #0"],
	["get_search_content", { responseId: "resp-4", urlIndex: 1 }, "url #1"],
	[
		"Agent",
		{ subagent_type: "reviewer", description: "check rendering" },
		"reviewer",
	],
	[
		"mcp",
		{ tool: "slack_search", server: "slack", action: "mock-only" },
		"slack_search",
	],
	["mcp", { connect: "context7" }, "connect context7"],
	["mcp", { describe: "tool_name" }, "describe tool_name"],
	["mcp", { search: "docs" }, "search docs"],
	["intercom", { action: "pending" }, "pending"],
	[
		"intercom",
		{ action: "ask", to: "worker", message: "Need review" },
		"worker",
	],
	["intercom", { action: "reply", message: "ack" }, "ack"],
	[
		"contact_supervisor",
		{
			reason: "need_decision",
			message: "Should I optimize for readability or speed?",
		},
		"Needs decision",
	],
	[
		"contact_supervisor",
		{ reason: "progress_update", message: "UPDATE: found the root cause" },
		"Progress update",
	],
	["contact_supervisor", {}, "…"],
	["subagent", { agent: "scout", task: "look", async: true }, "scout"],
	["subagent", { action: "status", id: "abc123" }, "status"],
	[
		"subagent",
		{ workflow: "builtin.generate-filter", task: "ideas" },
		"builtin.generate-filter",
	],
	[
		"subagent",
		{ chain: [{ agent: "scout" }, { agent: "reviewer" }] },
		"chain 2 steps",
	],
	[
		"subagent",
		{ tasks: [{ agent: "scout", count: 2 }, { agent: "reviewer" }] },
		"parallel 3 agents",
	],
	["subagent", undefined, "…"],
	[
		"subagent_list",
		{ agent: "scout", task: "list available", status: "ready" },
		"scout",
	],
	[
		"subagent_done",
		{ agent: "worker", task: "finish", status: "done" },
		"worker",
	],
	[
		"todo",
		{
			action: "create",
			id: "TODO-1",
			title: "Renderer coverage",
			status: "open",
		},
		"Renderer coverage",
	],
	["todo", {}, "…"],
	[
		"tape_handoff",
		{ name: "task/begin", summary: "start work", purpose: "handoff" },
		"task/begin",
	],
	["tape_list", { limit: 5, contextLines: 2 }, "limit 5"],
	["tape_delete", { id: "anchor-1" }, "anchor-1"],
	["tape_info", {}, "summary"],
	["tape_search", { kinds: ["entry"], query: "renderer" }, "renderer"],
	["tape_read", { lastAnchor: true, query: "renderer", limit: 5 }, "@last"],
	["tape_reset", { archive: true }, "archive"],
	["ask_user", { question: "Continue?", options: ["yes", "no"] }, "Continue?"],
	["ask_user", { question: "Continue?", options: ["yes", "no"] }, "2 options"],
	[
		"tree_sitter_search_symbols",
		{ query: "render", path: "extensions", language: "typescript" },
		"render",
	],
	["tree_sitter_document_symbols", { file_path: "core.ts" }, "core.ts"],
	[
		"tree_sitter_symbol_definition",
		{ symbol_name: "renderSubagentToolResult", file_path: "core.ts" },
		"renderSubagentToolResult",
	],
	[
		"tree_sitter_pattern_search",
		{ pattern: "console.log($ARG)", path: "src", language: "typescript" },
		"console.log",
	],
	["tree_sitter_codebase_overview", { path: "." }, "."],
	["tree_sitter_codebase_map", { path: ".", depth: 3 }, "3"],
	[
		"ast_grep_search",
		{ pattern: "console.log($ARG)", lang: "typescript", paths: ["src"] },
		"console.log",
	],
	[
		"ast_grep_replace",
		{
			pattern: "var $X",
			rewrite: "let $X",
			lang: "typescript",
			paths: ["src"],
			apply: false,
		},
		"var",
	],
	[
		"ast_grep_outline",
		{
			paths: ["extensions/claude-ui/core.ts"],
			items: "structure",
			view: "expanded",
		},
		"core.ts",
	],
	[
		"ast_grep_dump",
		{ source: "function foo() { return 1; }", lang: "typescript" },
		"typescript",
	],
	[
		"ast_dump",
		{ source: "function foo() { return 1; }", lang: "typescript" },
		"typescript",
	],
	[
		"lens_diagnostics",
		{ mode: "all", paths: ["extensions/claude-ui/core.ts"], severity: "all" },
		"all",
	],
	["symbol_search", { query: "tool renderer", limit: 8 }, "tool renderer"],
	[
		"module_report",
		{ path: "extensions/claude-ui/core.ts", view: "summary" },
		"core.ts",
	],
	[
		"read_symbol",
		{ path: "extensions/claude-ui/core.ts", symbol: "parseSubagentDetails" },
		"parseSubagentDetails",
	],
	[
		"read_enclosing",
		{ path: "extensions/claude-ui/test/renderers.test.mjs", line: 230 },
		"renderers.test.mjs:230",
	],
	[
		"lsp_navigation",
		{ operation: "definition", filePath: "core.ts", line: 12, character: 3 },
		"definition",
	],
	[
		"lsp_diagnostics",
		{ filePath: "extensions/claude-ui", severity: "all" },
		"extensions/claude-ui",
	],
	["memory_search", { query: "claude-ui" }, "claude-ui"],
	[
		"memory_write",
		{ path: "tmp/test.md", description: "mock", content: "body" },
		"tmp/test.md",
	],
	["memory_list", { directory: "core/project" }, "core/project"],
	["memory_check", {}, "project"],
	["memory_sync", { action: "status" }, "status"],
	[
		"tool_result_outline",
		{ sourceId: "tr_abc123", reason: "triage failure" },
		"tr_abc123",
	],
	[
		"tool_result_get",
		{
			sourceId: "tr_abc123",
			lineStart: 20,
			lineLimit: 40,
			reason: "inspect failure lines",
		},
		"20-59",
	],
	[
		"tool_result_search",
		{
			sourceId: "tr_abc123",
			query: "ERROR_TARGET",
			limit: 3,
			reason: "find failure",
		},
		"ERROR_TARGET",
	],
	["tool_result_list", { limit: 10, reason: "recent receipts" }, "limit 10"],
	[
		"tool_result_diagnostics",
		{ limit: 5, reason: "store health" },
		"store health",
	],
	[
		"tool_result_retention_preview",
		{ maxSources: 20, limit: 5, reason: "growth check" },
		"maxSources 20",
	],
	[
		"tool_result_export_details",
		{
			sourceId: "tr_abc123",
			filePath: ".scratch/details.json",
			reason: "audit details",
		},
		"tr_abc123",
	],
	[
		"tool_result_export",
		{
			sourceId: "tr_abc123",
			lineStart: 20,
			lineLimit: 3,
			filePath: ".scratch/export.txt",
			reason: "offline inspect",
		},
		"20-22",
	],
];

test("call renderer matrix is coupled to the real claude-ui allowlist", () => {
	assert.deepEqual(
		[...ui.allowlistedToolNames].sort(),
		[...expectedAllowlist].sort(),
	);
	const toolsWithCases = new Set(callMatrix.map(([toolName]) => toolName));
	assert.deepEqual([...toolsWithCases].sort(), [...expectedAllowlist].sort());
});

test("webToolCallBody covers allowlisted tool call branches and edge arguments", () => {
	for (const [toolName, args, expected] of callMatrix) {
		const body =
			toolName === "Agent"
				? ui.agentToolCallBody(args, theme)
				: ui.webToolCallBody(toolName, args, theme);
		assert.match(body, /\S/, `${toolName} should render non-empty body`);
		assert.match(
			body,
			new RegExp(escaped(expected)),
			`${toolName} should include ${expected}; got ${body}`,
		);
	}
});

test("subagent call renderer makes execution modes explicit", () => {
	assert.match(
		ui.webToolCallBody(
			"subagent",
			{ chain: [{ agent: "scout" }, { agent: "reviewer" }], async: true },
			theme,
		),
		/chain 2 steps · scout → reviewer · async/,
	);
	assert.match(
		ui.webToolCallBody(
			"subagent",
			{ tasks: [{ agent: "scout", count: 2 }, { agent: "reviewer" }] },
			theme,
		),
		/parallel 3 agents · scout \+ reviewer/,
	);
	assert.match(
		ui.webToolCallBody(
			"subagent",
			{
				chain: [
					{ parallel: [{ agent: "scout", count: 2 }, { agent: "reviewer" }] },
				],
			},
			theme,
		),
		/chain 1 step · \[scout×2 \+ reviewer\]/,
	);
	assert.match(
		ui.webToolCallBody(
			"subagent",
			{
				chain: [
					{
						parallel: Array.from({ length: 14 }, () => ({ agent: "reviewer" })),
					},
					{ agent: "validator" },
					{ agent: "reducer" },
				],
			},
			theme,
		),
		/chain 3 steps · \[reviewer×14\] → validator → reducer/,
	);
	assert.equal(
		ui.webToolCallBody("subagent", { action: "status", id: "abc123" }, theme),
		"status · abc123",
	);
	assert.equal(
		ui.webToolCallBody(
			"subagent",
			{ workflow: "builtin.generate-filter", task: "ideas" },
			theme,
		),
		"builtin.generate-filter · ideas",
	);
});

test("subagent call-renderer original fallback is explicit for partial args", () => {
	assert.equal(ui.shouldUseOriginalToolCallRenderer(undefined), true);
	assert.equal(ui.shouldUseOriginalToolCallRenderer("not-an-object"), true);
	assert.equal(ui.shouldUseOriginalToolCallRenderer({}), false);
	assert.equal(ui.shouldUseOriginalToolCallRenderer({ task: "ideas" }), false);
	assert.equal(
		ui.shouldUseOriginalToolCallRenderer({ action: "status" }),
		false,
	);
	assert.equal(ui.webToolCallBody("subagent", {}, theme), "run");
	assert.equal(
		ui.webToolCallBody("subagent", { task: "ideas" }, theme),
		"ideas",
	);
});

test("async subagent launch receipt hides model-only lifecycle instructions", () => {
	const renderLaunch = (args, details, text, extraContext = {}) => {
		const result = textResult(text, details);
		const resultContext = context(args, {
			toolCallId: "subagent-launch",
			...extraContext,
		});
		const component =
			ui.renderSubagentToolResult(
				result,
				options(),
				theme,
				resultContext,
				"Subagent",
			) ??
			ui.wrappedToolResult(
				"subagent",
				result,
				options(),
				theme,
				resultContext,
				"Subagent",
			);
		return { component, rendered: render(component) };
	};

	const parallelArgs = {
		tasks: [{ agent: "reviewer" }, { agent: "reviewer" }],
		async: true,
	};
	const call = ui.wrappedToolCall(
		"subagent",
		parallelArgs,
		theme,
		context(parallelArgs),
		"Subagent",
	);
	assert.match(
		render(call),
		/● Subagent\(parallel 2 agents · reviewer \+ reviewer\)/,
	);

	const lifecycleText = [
		"Async parallel: reviewer + reviewer [12345678-1234-5678-9abc-def012345678]",
		"",
		"The async run is detached. Do not run sleep timers or polling loops just to wait for it.",
		"Persistent interactive parents should continue useful work.",
		"Inspect relevant completed outputs before dependent decisions or final claims.",
		"When a known immediate dependency requires child output, retain the async run ID.",
	].join("\n");
	const parallel = renderLaunch(
		parallelArgs,
		{
			mode: "parallel",
			runId: "12345678-1234-5678-9abc-def012345678",
			asyncId: "12345678-1234-5678-9abc-def012345678",
			asyncDir: "/tmp/private-async-run",
			results: [],
		},
		lifecycleText,
	);
	assert.match(
		parallel.rendered,
		/^\s*└ Launched 2 reviewers in background · run 12345678…[ \t]*$/m,
	);
	assert.doesNotMatch(parallel.rendered, /└ Subagent Launched/);
	assert.doesNotMatch(parallel.rendered, /Do not run sleep timers/);
	assert.doesNotMatch(parallel.rendered, /Persistent interactive parents/);
	assert.doesNotMatch(parallel.rendered, /Inspect relevant completed outputs/);
	assert.doesNotMatch(parallel.rendered, /When a known immediate dependency/);
	assert.doesNotMatch(parallel.rendered, /private-async-run/);
	assertRenderedWithinWidth(parallel.component);

	const single = renderLaunch(
		{ agent: "scout", task: "inspect", async: true },
		{
			mode: "single",
			runId: "single-run-id",
			asyncId: "single-run-id",
			asyncDir: "/tmp/single-run",
			results: [],
		},
		"Async: scout [single-run-id]",
	);
	assert.match(single.rendered, /Launched scout in background · run single-r…/);

	const chain = renderLaunch(
		{
			chain: [{ agent: "scout" }, { agent: "reviewer" }],
			async: true,
		},
		{
			mode: "chain",
			runId: "chain-run-id",
			asyncId: "chain-run-id",
			asyncDir: "/tmp/chain-run",
			results: [],
		},
		"Async chain: scout -> reviewer [chain-run-id]",
	);
	assert.match(
		chain.rendered,
		/Launched chain with 2 steps in background · run chain-ru…/,
	);

	const startError = renderLaunch(
		parallelArgs,
		{ mode: "parallel", results: [] },
		"Failed to start async run",
		{ isError: true },
	);
	assert.match(startError.rendered, /Failed to start async run/);
	assert.doesNotMatch(startError.rendered, /Launched/);
});

function richSubagentResult() {
	return textResult("Chain complete", {
		mode: "chain",
		routeLabel: "builtin.generate-filter",
		context: "fresh",
		totalSteps: 2,
		chainAgents: ["scout", "reviewer"],
		artifacts: { dir: "/tmp/subagent-artifacts" },
		results: [
			{
				agent: "scout",
				task: "gather context",
				exitCode: 0,
				savedOutputPath: "/tmp/out-scout.md",
				progress: {
					index: 0,
					status: "completed",
					toolCount: 2,
					tokens: 1200,
					durationMs: 1500,
				},
				toolCalls: [{ text: "read core.ts", expandedText: "read: core.ts" }],
			},
			{
				agent: "reviewer",
				task: "review context",
				exitCode: 1,
				error: "expected test error",
				outputMode: "file-only",
				outputReference: { path: "/tmp/review.md" },
				messages: [{ content: [{ text: "review failed details" }] }],
				progress: {
					index: 1,
					status: "failed",
					currentTool: "grep",
					currentToolArgs: "TODO",
					toolCount: 1,
				},
			},
		],
	});
}

test("subagent result renderer covers chain, failure, file-only, and artifacts", () => {
	const result = richSubagentResult();
	const collapsedComponent = ui.renderSubagentToolResult(
		result,
		options(),
		theme,
		context({}, { toolCallId: "subagent-chain" }),
		"Subagent",
	);
	const collapsed = render(collapsedComponent);
	assert.match(collapsed, /Subagent/);
	assert.match(collapsed, /builtin\.generate-filter/);
	assert.match(collapsed, /chain/);
	assert.match(collapsed, /2 steps/);
	assert.match(collapsed, /1 failed/);
	assert.match(collapsed, /Step 1\/2: scout/);
	assert.match(collapsed, /Step 2\/2: reviewer/);
	assert.match(collapsed, /mode: file-only/);
	assert.match(collapsed, /error: expected test error/);
	assert.match(collapsed, /artifacts: \/tmp\/subagent-artifacts/);
	assertRenderedWithinWidth(collapsedComponent);

	const expandedComponent = ui.renderSubagentToolResult(
		result,
		options({ expanded: true }),
		theme,
		context({}, { toolCallId: "subagent-chain-expanded" }),
		"Subagent",
	);
	const expanded = render(expandedComponent);
	assert.match(expanded, /recent activity|agents:/);
	assert.match(expanded, /Step 1\/2: scout/);
	assert.match(expanded, /Step 2\/2: reviewer/);
	assert.match(expanded, /mode: file-only/);
	assert.match(expanded, /error: expected test error/);
	assert.match(expanded, /debug: review failed details/);
	assertRenderedWithinWidth(expandedComponent);

	const roleComponent = ui.renderSubagentToolResult(
		textResult("Chain complete", {
			mode: "chain",
			routeLabel: "role-test",
			results: [{ agent: "delegate", task: "review renderer", exitCode: 0 }],
		}),
		options({ expanded: true }),
		theme,
		context({}, { toolCallId: "subagent-chain-role" }),
		"Subagent",
	);
	const roleRendered = render(roleComponent);
	assert.match(roleRendered, /Step 1: delegate/);
	assert.doesNotMatch(roleRendered, /delegate \(reviewer\)/);
	assert.doesNotMatch(roleRendered, /Step 1: reviewer/);
	assertRenderedWithinWidth(roleComponent);

	const largeRoleComponent = ui.renderSubagentToolResult(
		textResult("Chain complete", {
			mode: "chain",
			routeLabel: "large-role-test",
			results: Array.from({ length: 6 }, (_, index) => ({
				agent: "delegate",
				task: `review renderer ${index + 1}`,
				exitCode: 0,
			})),
		}),
		options(),
		theme,
		context({}, { toolCallId: "subagent-chain-large-role" }),
		"Subagent",
	);
	const largeRoleRendered = render(largeRoleComponent);
	assert.doesNotMatch(largeRoleRendered, /reviewer/);
	assert.doesNotMatch(largeRoleRendered, /stages:/);
	assertRenderedWithinWidth(largeRoleComponent);
});

test("subagent result renderer covers single, parallel, paused, detached, interrupted, save-error states", () => {
	const result = textResult("Parallel mixed", {
		mode: "parallel",
		totalSteps: 5,
		artifacts: { dir: "/tmp/mixed" },
		results: [
			{
				agent: "delegate",
				exitCode: 0,
				progress: { index: 0, status: "completed" },
			},
			{
				agent: "reviewer",
				progress: { index: 1, status: "paused" },
				messages: [{ text: "paused details" }],
			},
			{
				agent: "oracle",
				interrupted: true,
				progress: { index: 2 },
				messages: [{ text: "interrupted details" }],
			},
			{
				agent: "scout",
				detached: true,
				progress: { index: 3, status: "detached" },
			},
			{
				agent: "worker",
				exitCode: 1,
				outputSaveError: "disk full",
				savedOutputPath: "/tmp/mixed/out.md",
				messages: [{ text: "save failed details" }],
			},
		],
	});
	const component = ui.renderSubagentToolResult(
		result,
		options({ expanded: true }),
		theme,
		context({}, { toolCallId: "subagent-mixed" }),
		"Subagent",
	);
	const rendered = render(component);
	assert.match(rendered, /parallel/);
	assert.match(rendered, /Agent 1\/5: delegate/);
	assert.match(rendered, /Ⅱ Agent 2\/5: reviewer/);
	assert.match(rendered, /Ⅱ Agent 3\/5: oracle/);
	assert.match(rendered, /■ Agent 4\/5: scout/);
	assert.match(rendered, /✗ Agent 5\/5: worker/);
	assert.match(rendered, /save error: disk full/);
	assert.match(rendered, /output: \/tmp\/mixed\/out.md/);
	assertRenderedWithinWidth(component);
});

test("native code-intelligence tools use Claude summaries and preserve expansion", () => {
	const cases = [
		{
			toolName: "read_symbol",
			title: "Read Symbol",
			args: {
				path: "extensions/claude-ui/core.ts",
				symbol: "parseSubagentDetails",
			},
			result: textResult(
				"function parseSubagentDetails  core.ts:2848-2916\n\nfunction parseSubagentDetails(details) {\n  return details;\n}\nTAIL_MARKER",
				{
					found: true,
					name: "parseSubagentDetails",
					kind: "function",
					startLine: 2848,
					endLine: 2916,
				},
			),
			summary: /69 lines/,
			preview: /function parseSubagentDetails/,
		},
		{
			toolName: "read_enclosing",
			title: "Read Enclosing",
			args: { path: "extensions/claude-ui/test/renderers.test.mjs", line: 230 },
			result: textResult(
				"function rendererCase  renderers.test.mjs:225-255\n\nfunction rendererCase() {}",
				{
					found: true,
					name: "rendererCase",
					kind: "function",
					line: 230,
					startLine: 225,
					endLine: 255,
				},
			),
			summary: /31 lines/,
			preview: /function rendererCase/,
		},
		{
			toolName: "module_report",
			title: "Module Report",
			args: { path: "extensions/claude-ui/core.ts", view: "summary" },
			result: textResult('{"path":"core.ts","symbols":92}', {
				available: true,
				symbols: 92,
				exports: 2,
				callbacks: 4,
				view: "summary",
			}),
			summary: /92 symbols · 2 exports · 4 callbacks/,
			preview: /symbols/,
		},
		{
			toolName: "symbol_search",
			title: "Symbol Search",
			args: { query: "tool renderer", limit: 8 },
			result: textResult("Top 8 files for tool renderer\n1. core.ts", {
				available: true,
				query: "tool renderer",
				count: 8,
			}),
			summary: /8 files/,
			preview: /core.ts/,
		},
		{
			toolName: "lens_diagnostics",
			title: "Lens Diagnostics",
			args: {
				mode: "all",
				paths: ["extensions/claude-ui/core.ts"],
				severity: "all",
			},
			result: textResult("core.ts:10 warning\ncore.ts:20 error", {
				mode: "all",
				totalBlocking: 1,
				totalErrors: 2,
				totalWarnings: 3,
				filesWithIssues: 2,
			}),
			summary: /1 blocking · 2 errors · 3 warnings · 2 files/,
			preview: /core.ts:10 warning/,
		},
		{
			toolName: "ast_grep_outline",
			title: "AST Outline",
			args: { paths: ["extensions/claude-ui/core.ts"], items: "structure" },
			result: textResult('{"path":"core.ts","items":["one"]}', {
				files: 2,
				items: 12,
				truncatedFiles: false,
			}),
			summary: /12 symbols · 2 files/,
			preview: /items/,
		},
		{
			toolName: "ast_grep_dump",
			title: "AST Dump",
			args: { source: "function foo() { return 1; }", lang: "typescript" },
			result: textResult(
				"program\n  function_declaration\n    return_statement",
				{ lang: "typescript", includeAnonymous: false },
			),
			summary: /typescript · 3 AST nodes/,
			preview: /function_declaration/,
		},
		{
			toolName: "ast_dump",
			title: "AST Dump",
			args: { source: "function foo() { return 1; }", lang: "typescript" },
			result: textResult(
				"program\n  function_declaration\n    return_statement",
				{ lang: "typescript", includeAnonymous: false },
			),
			summary: /typescript · 3 AST nodes/,
			preview: /function_declaration/,
		},
	];

	for (const { toolName, title, args, result, summary, preview } of cases) {
		assert.equal(ui.webToolTitle(toolName), title);
		const component = ui.wrappedToolResult(
			toolName,
			result,
			options(),
			theme,
			context(args, { toolCallId: `${toolName}-native-final` }),
			title,
		);
		const rendered = render(component);
		assert.match(rendered, summary, `${toolName} summary: ${rendered}`);
		assert.match(rendered, preview, `${toolName} preview: ${rendered}`);
		assertRenderedWithinWidth(component);
	}

	const readSymbol = cases[0];
	const expanded = render(
		ui.wrappedToolResult(
			readSymbol.toolName,
			readSymbol.result,
			options({ expanded: true }),
			theme,
			context(readSymbol.args, { toolCallId: "read-symbol-expanded" }),
			readSymbol.title,
		),
	);
	assert.match(expanded, /TAIL_MARKER/);

	assert.equal(typeof ui.shouldUseOriginalToolRenderer, "function");
	assert.equal(
		ui.shouldUseOriginalToolRenderer(
			"lens_diagnostics",
			{},
			options({ isPartial: true }),
		),
		true,
	);
	assert.equal(
		ui.shouldUseOriginalToolRenderer("lens_diagnostics", {}, options()),
		false,
	);
	assert.equal(
		ui.shouldUseOriginalToolRenderer(
			"unknown_native_tool",
			{},
			options({ isPartial: true }),
		),
		false,
	);
});

test("generic wrapped results cover per-tool summaries, previews, partial, and error states", () => {
	const cases = [
		[
			"code_search",
			"Code Search",
			textResult("line 1\nline 2", { resultCount: 2 }),
			/2 lines/,
		],
		[
			"todo",
			"Todo",
			textResult(
				JSON.stringify({
					assigned: [],
					open: [{ id: "TODO-1", title: "Thing" }],
					closed: [],
				}),
				undefined,
			),
			/1 open todo/,
		],
		[
			"memory_list",
			"Memory List",
			textResult("Memory files (3):\n- a\n- b"),
			/3 files/,
		],
		[
			"memory_list",
			"Memory List",
			textResult("", { count: 2, files: ["a.md", "b.md"] }),
			/2 files/,
		],
		["subagent", "Subagent", textResult("- scout\n- reviewer"), /2 agents/],
		[
			"subagent_list",
			"Subagent List",
			textResult("- scout\n- reviewer"),
			/2 agents/,
		],
		[
			"subagent_done",
			"Subagent Done",
			textResult("Done", { status: "done" }),
			/done/,
		],
		[
			"lsp_navigation",
			"LSP",
			textResult("definition", { operation: "definition", resultCount: 2 }),
			/definition · 2 results/,
		],
		[
			"lsp_diagnostics",
			"Diagnostics",
			textResult("clean", {
				mode: "workspace",
				totalDiagnostics: 0,
				filesChecked: 3,
			}),
			/workspace · 0 diagnostics · 3 files/,
		],
		[
			"ast_grep_search",
			"AST Grep",
			textResult("matches", { matchCount: 4 }),
			/4 matches/,
		],
		[
			"ast_grep_replace",
			"AST Replace",
			textResult("dry", { matchCount: 2, applied: false }),
			/2 matches · dry run/,
		],
		[
			"ast_grep_replace",
			"AST Replace",
			textResult("applied", { matchCount: 1, applied: true }),
			/1 match · applied/,
		],
		[
			"intercom",
			"Intercom",
			textResult("No unresolved inbound asks."),
			/no pending asks/,
		],
		[
			"intercom",
			"Intercom",
			textResult(
				"**Pending asks:**\n- worker · msg-1 · 5s ago · Need review\n- reviewer · msg-2 · 7s ago · Need reply",
			),
			/2 pending asks/,
		],
		[
			"intercom",
			"Intercom",
			textResult(
				"**Intercom Status:**\nConnected: Yes\nSession ID: abc\nActive sessions: 9",
			),
			/connected · 9 sessions/,
		],
		[
			"intercom",
			"Intercom",
			textResult(
				"**Current session:**\n• self\n\n**Other sessions:**\n• one\n• two",
			),
			/2 other sessions/,
		],
		[
			"intercom",
			"Intercom",
			textResult("Message sent to worker"),
			/sent to worker/,
		],
		[
			"intercom",
			"Intercom",
			textResult("Reply sent to reviewer"),
			/reply sent to reviewer/,
		],
		[
			"intercom",
			"Intercom",
			textResult("**Reply from worker:**\nack"),
			/reply from worker/,
		],
		[
			"contact_supervisor",
			"Contact Supervisor",
			textResult("**Reply from supervisor:**\nUse readability.", {
				reason: "need_decision",
				replied: true,
			}),
			/decision received/,
		],
		[
			"contact_supervisor",
			"Contact Supervisor",
			textResult("Progress update sent.", {
				reason: "progress_update",
				sent: true,
			}),
			/progress sent/,
		],
		[
			"tape_info",
			"Tape Info",
			textResult(
				"📊 Tape Information:\n  Total entries: 312\n  Anchors: 1\n  Last anchor: task/begin\n  Entries since last anchor: 42",
				{
					totalEntries: 312,
					anchorCount: 1,
					lastAnchorName: "task/begin",
					entriesSinceLastAnchor: 42,
				},
			),
			/312 entries · 1 anchor · last task\/begin · 42 since anchor/,
		],
		[
			"tape_search",
			"Tape Search",
			textResult("Found 1 entries\n\n[10:00] User: renderer", {
				count: 1,
				entryCount: 1,
				anchorCount: 0,
			}),
			/1 entry/,
		],
		[
			"tape_read",
			"Tape Read",
			textResult(
				"Retrieved 2 entries:\n\n[10:00] User: hi\n[10:01] Assistant: ok",
				{ count: 2 },
			),
			/2 entries/,
		],
		[
			"tape_list",
			"Tape List",
			textResult("Found 1 anchor(s):\n\n  - task/begin [handoff] (today)", {
				count: 1,
			}),
			/1 anchor/,
		],
		[
			"tape_handoff",
			"Tape Handoff",
			textResult("{}", { name: "task/begin" }),
			/anchor task\/begin/,
		],
		[
			"tape_delete",
			"Tape Delete",
			textResult("{}", { id: "anchor-1", deleted: true, name: "task/begin" }),
			/deleted task\/begin/,
		],
		[
			"tape_reset",
			"Tape Reset",
			textResult("Anchor index cleared", { archived: false }),
			/reset/,
		],
		[
			"tool_result_outline",
			"Tool Result Outline",
			textResult("outline body", {
				sourceId: "tr_abc123",
				keywordHitCount: 2,
				omittedMiddleLineCount: 80,
			}),
			/tr_abc123 · 2 keyword hits · 80 omitted/,
		],
		[
			"tool_result_get",
			"Tool Result Get",
			textResult("raw line 1\nraw line 2", {
				sourceId: "tr_abc123",
				startLine: 20,
				endLine: 21,
				lineCount: 2,
			}),
			/tr_abc123:20-21 · 2 lines/,
		],
		[
			"tool_result_search",
			"Tool Result Search",
			textResult("No matches found.", { matchCount: 0 }),
			/0 matches/,
		],
		[
			"tool_result_list",
			"Tool Result List",
			textResult("list body", { count: 7 }),
			/7 sources/,
		],
		[
			"tool_result_diagnostics",
			"Tool Result Diagnostics",
			textResult("diag body", { sourceCount: 7, totalStoredBytes: 12345 }),
			/7 sources · 12345 bytes/,
		],
		[
			"tool_result_retention_preview",
			"Tool Result Retention",
			textResult("preview body", {
				candidateCount: 3,
				keptCount: 10,
				candidateStoredBytes: 4567,
			}),
			/3 candidates · 10 kept · 4567 bytes/,
		],
		[
			"tool_result_export_details",
			"Tool Result Details Export",
			textResult("export details", { sourceId: "tr_abc123", byteCount: 3500 }),
			/tr_abc123 · 3500 bytes/,
		],
		[
			"tool_result_export",
			"Tool Result Export",
			textResult("export source", {
				sourceId: "tr_abc123",
				startLine: 20,
				endLine: 22,
				lineCount: 3,
				byteCount: 120,
			}),
			/tr_abc123:20-22 · 3 lines · 120 bytes/,
		],
	];

	for (const toolName of ["tape_read", "tape_search"]) {
		const renderedTapeTranscript = render(
			ui.wrappedToolResult(
				toolName,
				textResult(
					"Retrieved 1 entry:\n\n[10:00] User:\n  - bullet\n    code",
					{ count: 1, entryCount: 1, anchorCount: 0 },
				),
				options({ expanded: true }),
				theme,
				context({}, { toolCallId: `${toolName}-preserve-preview` }),
				toolName === "tape_read" ? "Tape Read" : "Tape Search",
			),
		);
		assert.match(renderedTapeTranscript, /│   - bullet/);
		assert.match(renderedTapeTranscript, /│     code/);
	}
	for (const [toolName, title, result, expected] of cases) {
		const component = ui.wrappedToolResult(
			toolName,
			result,
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: `${toolName}-result` }),
			title,
		);
		assert.match(
			render(component),
			expected,
			`${toolName} result summary mismatch`,
		);
		assertRenderedWithinWidth(component);
	}

	const virtualizedWrappedComponent = ui.wrappedToolResult(
		"code_search",
		textResult(
			virtualizedReceipt("code_search"),
			virtualizerDetails({ toolName: "code_search" }),
		),
		options(),
		theme,
		context({}, { toolCallId: "code-search-virtualized" }),
		"Code Search",
	);
	const virtualizedWrappedRendered = render(virtualizedWrappedComponent, 120);
	assert.match(virtualizedWrappedRendered, /Code Search 1800 lines · stored/);
	assert.match(
		virtualizedWrappedRendered,
		/stored source: tr_mock · use tool_result_get\/export/,
	);
	assert.match(
		virtualizedWrappedRendered,
		/Sampled 30 of 1800 lines; omitted 1770 hidden lines\./,
	);
	assert.match(virtualizedWrappedRendered, /Middle lines 896-905/);
	assert.match(virtualizedWrappedRendered, /│ 905: middle 905/);
	assert.doesNotMatch(virtualizedWrappedRendered, /tool-result-virtualizer/);
	assert.doesNotMatch(virtualizedWrappedRendered, /Preview only/);
	assert.doesNotMatch(virtualizedWrappedRendered, /Choose before relying/);
	assertRenderedWithinWidth(virtualizedWrappedComponent);

	const failureWrappedComponent = ui.wrappedToolResult(
		"code_search",
		textResult(
			virtualizedFailureReceipt("code_search"),
			virtualizerFailureDetails({ toolName: "code_search" }),
		),
		options(),
		theme,
		context({}, { toolCallId: "code-search-virtualizer-failure" }),
		"Code Search",
	);
	const failureWrappedRendered = render(failureWrappedComponent, 120);
	assert.match(
		failureWrappedRendered,
		/Code Search storage failed · 1800 lines withheld/,
	);
	assert.match(
		failureWrappedRendered,
		/Original content withheld: 50\.0 KiB, 1800 lines/,
	);
	assert.match(failureWrappedRendered, /No source id was created/);
	assert.doesNotMatch(failureWrappedRendered, /stored source/);
	assertRenderedWithinWidth(failureWrappedComponent);

	const collapsedGet = render(
		ui.wrappedToolResult(
			"tool_result_get",
			textResult("raw retrieved line 1\nraw retrieved line 2", {
				sourceId: "tr_abc123",
				startLine: 1,
				endLine: 2,
				lineCount: 2,
			}),
			options({ expanded: false }),
			theme,
			context({}, { toolCallId: "tool-result-get-collapsed" }),
			"Tool Result Get",
		),
	);
	assert.match(collapsedGet, /Tool Result Get tr_abc123:1-2 · 2 lines/);
	assert.doesNotMatch(collapsedGet, /raw retrieved line/);

	const expandedGet = render(
		ui.wrappedToolResult(
			"tool_result_get",
			textResult("raw retrieved line 1\nraw retrieved line 2", {
				sourceId: "tr_abc123",
				startLine: 1,
				endLine: 2,
				lineCount: 2,
			}),
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: "tool-result-get-expanded" }),
			"Tool Result Get",
		),
	);
	assert.match(expandedGet, /raw retrieved line 1/);
	assertRenderedWithinWidth(
		ui.wrappedToolResult(
			"tool_result_get",
			textResult("raw retrieved line 1\nraw retrieved line 2", {
				sourceId: "tr_abc123",
				startLine: 1,
				endLine: 2,
				lineCount: 2,
			}),
			options({ expanded: false }),
			theme,
			context({}, { toolCallId: "tool-result-get-width" }),
			"Tool Result Get",
		),
	);

	const noPendingIntercom = render(
		ui.wrappedToolResult(
			"intercom",
			textResult("No unresolved inbound asks."),
			options(),
			theme,
			context({}, { toolCallId: "intercom-no-pending" }),
			"Intercom",
		),
	);
	assert.match(noPendingIntercom, /Intercom no pending asks/);
	assert.doesNotMatch(noPendingIntercom, /No unresolved inbound asks/);

	const pendingIntercom = render(
		ui.wrappedToolResult(
			"intercom",
			textResult("**Pending asks:**\n- worker · msg-1 · 5s ago · Need review"),
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: "intercom-pending" }),
			"Intercom",
		),
	);
	assert.match(pendingIntercom, /Intercom 1 pending ask/);
	assert.match(pendingIntercom, /Pending asks:/);
	assert.doesNotMatch(pendingIntercom, /\*\*Pending asks:\*\*/);

	const statusIntercom = render(
		ui.wrappedToolResult(
			"intercom",
			textResult(
				"**Intercom Status:**\nConnected: Yes\nSession ID: abc\nActive sessions: 9",
			),
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: "intercom-status" }),
			"Intercom",
		),
	);
	assert.match(statusIntercom, /Intercom Status:/);
	assert.doesNotMatch(statusIntercom, /\*\*Intercom Status:\*\*/);

	const partialMcpConnect = ui.wrappedToolResult(
		"mcp",
		textResult("waiting"),
		options({ isPartial: true }),
		theme,
		context({ connect: "context7" }, { toolCallId: "mcp-partial-connect" }),
		"MCP",
	);
	assert.match(render(partialMcpConnect), /MCP connect context7/);

	const partialMcpTool = ui.wrappedToolResult(
		"mcp",
		textResult("waiting"),
		options({ isPartial: true }),
		theme,
		context({ tool: "slack_search" }, { toolCallId: "mcp-partial-tool" }),
		"MCP",
	);
	assert.match(render(partialMcpTool), /MCP slack_search/);

	const partialIntercomAsk = ui.wrappedToolResult(
		"intercom",
		textResult("waiting"),
		options({ isPartial: true }),
		theme,
		context({ action: "ask" }, { toolCallId: "intercom-partial-ask" }),
		"Intercom",
	);
	assert.match(render(partialIntercomAsk), /Waiting for Reply/);

	const partialSupervisorDecision = ui.wrappedToolResult(
		"contact_supervisor",
		textResult("waiting"),
		options({ isPartial: true }),
		theme,
		context(
			{
				reason: "need_decision",
				message: "Need scope decision before continuing.",
			},
			{ toolCallId: "contact-supervisor-partial-decision" },
		),
		"Contact Supervisor",
	);
	assert.match(render(partialSupervisorDecision), /Waiting for Decision/);
	assert.equal(ui.webToolTitle("contact_supervisor"), "Contact Supervisor");
	assert.match(
		ui.webToolCallBody(
			"contact_supervisor",
			{
				reason: "need_decision",
				message: "Need scope decision before continuing.",
			},
			theme,
		),
		/Need scope decision before continuing/,
	);
	assert.match(
		ui.webToolCallBody(
			"contact_supervisor",
			{ reason: "progress_update", message: "UPDATE: found the root cause." },
			theme,
		),
		/UPDATE: found the root cause/,
	);

	const partialSupervisorUpdate = ui.wrappedToolResult(
		"contact_supervisor",
		textResult("sending"),
		options({ isPartial: true }),
		theme,
		context(
			{ reason: "progress_update", message: "UPDATE: found the root cause." },
			{ toolCallId: "contact-supervisor-partial-update" },
		),
		"Contact Supervisor",
	);
	assert.match(render(partialSupervisorUpdate), /Sending Update/);

	const supervisorReply = render(
		ui.wrappedToolResult(
			"contact_supervisor",
			textResult(
				"**Reply from supervisor:**\nUse the smaller change.\n\nThen rerun focused tests.",
				{ reason: "need_decision", replied: true },
			),
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: "contact-supervisor-reply" }),
			"Contact Supervisor",
		),
	);
	assert.match(supervisorReply, /decision received/);
	assert.match(supervisorReply, /Reply from supervisor:/);
	assert.match(supervisorReply, /Use the smaller change/);
	assert.doesNotMatch(supervisorReply, /\*\*Reply from supervisor:/);

	const supervisorUpdate = render(
		ui.wrappedToolResult(
			"contact_supervisor",
			textResult("**Progress update:**\n**UPDATE:** found the root cause.", {
				reason: "progress_update",
				sent: true,
			}),
			options({ expanded: true }),
			theme,
			context({}, { toolCallId: "contact-supervisor-update" }),
			"Contact Supervisor",
		),
	);
	assert.match(supervisorUpdate, /progress sent/);
	assert.match(supervisorUpdate, /Progress update:/);
	assert.match(supervisorUpdate, /UPDATE:/);
	assert.doesNotMatch(supervisorUpdate, /\*\*Progress update:/);
	assert.doesNotMatch(supervisorUpdate, /\*\*UPDATE:/);

	const partial = ui.wrappedToolResult(
		"code_search",
		textResult("still working"),
		options({ isPartial: true }),
		theme,
		context({}, { toolCallId: "partial" }),
		"Code Search",
	);
	assert.match(render(partial), /Searching/);
	assert.match(render(partial), /\.\.\./);

	const error = ui.wrappedToolResult(
		"code_search",
		textResult("boom"),
		options(),
		theme,
		context({}, { isError: true, toolCallId: "error" }),
		"Code Search",
	);
	assert.match(render(error), /boom/);
});

test("context-mode MCP calls render compact lifecycle rows with expandable raw detail", () => {
	const indexArgs = {
		tool: "context_mode_ctx_index",
		args: JSON.stringify({ source: "Audit caffeinate" }),
	};
	const indexOutput = [
		"Indexed 3 sections (0 with code) from: Audit caffeinate",
		'Use ctx_search(queries: ["..."]) to query this content. Use source: "Audit caffeinate" to scope results.',
	].join("\n");

	const runningIndex = ui.wrappedToolCall(
		"mcp",
		indexArgs,
		theme,
		context(indexArgs, { isPartial: true }),
		"MCP",
	);
	assert.equal(
		render(runningIndex).trimEnd(),
		"◦ Context · indexing Audit caffeinate",
	);
	const completedIndex = ui.wrappedToolCall(
		"mcp",
		indexArgs,
		theme,
		context(indexArgs, {
			isPartial: false,
			lastComponent: runningIndex,
		}),
		"MCP",
	);
	assert.strictEqual(completedIndex, runningIndex);
	assert.equal(render(completedIndex).trimEnd(), "");

	const partialIndexResult = ui.wrappedToolResult(
		"mcp",
		textResult("waiting"),
		options({ isPartial: true }),
		theme,
		context(indexArgs, { toolCallId: "context-index-partial" }),
		"MCP",
	);
	assert.equal(render(partialIndexResult).trimEnd(), "");

	const collapsedIndex = ui.wrappedToolResult(
		"mcp",
		textResult(indexOutput),
		options(),
		theme,
		context(indexArgs, {
			lastComponent: partialIndexResult,
			toolCallId: "context-index-collapsed",
		}),
		"MCP",
	);
	assert.strictEqual(collapsedIndex, partialIndexResult);
	assert.equal(
		render(collapsedIndex).trimEnd(),
		"✓ Context · indexed Audit caffeinate · 3 sections",
	);
	assertRenderedWithinWidth(collapsedIndex);

	const indexedCode = render(
		ui.wrappedToolResult(
			"mcp",
			textResult("Indexed 11 sections (1 with code) from: Audit imagegen"),
			options(),
			theme,
			context(
				{
					...indexArgs,
					args: JSON.stringify({ source: "Audit imagegen" }),
				},
				{ toolCallId: "context-index-code" },
			),
			"MCP",
		),
	);
	assert.match(
		indexedCode,
		/^✓ Context · indexed Audit imagegen · 11 sections · 1 code/,
	);

	const expandedIndex = render(
		ui.wrappedToolResult(
			"mcp",
			textResult(indexOutput),
			options({ expanded: true }),
			theme,
			context(indexArgs, { toolCallId: "context-index-expanded" }),
			"MCP",
		),
	);
	assert.match(
		expandedIndex,
		/^✓ Context · indexed Audit caffeinate · 3 sections/,
	);
	assert.match(expandedIndex, /Indexed 3 sections \(0 with code\)/);
	assert.match(expandedIndex, /Use ctx_search/);

	const searchArgs = {
		tool: "context_mode_ctx_search",
		args: JSON.stringify({
			queries: ["decision confidence GO CAUTION NO-GO", "must-fix findings"],
		}),
	};
	const runningSearch = ui.wrappedToolCall(
		"mcp",
		searchArgs,
		theme,
		context(searchArgs, { isPartial: true }),
		"MCP",
	);
	assert.equal(
		render(runningSearch).trimEnd(),
		"◦ Context · searching 2 queries",
	);

	const searchOutput = [
		"## decision confidence GO CAUTION NO-GO",
		"",
		"--- [current-session | 2026-07-10 00:55 | Audit | caffeinate] ---",
		"### Review — security/source audit (1)",
		...Array.from({ length: 224 }, (_, index) => `result line ${index + 1}`),
	].join("\n");
	const collapsedSearch = ui.wrappedToolResult(
		"mcp",
		textResult(searchOutput),
		options(),
		theme,
		context(searchArgs, { toolCallId: "context-search-collapsed" }),
		"MCP",
	);
	const collapsedSearchText = render(collapsedSearch);
	assert.match(
		collapsedSearchText,
		/^✓ Context · searched 2 queries · 228 lines/,
	);
	assert.match(collapsedSearchText, /decision confidence GO CAUTION NO-GO/);
	assert.match(
		collapsedSearchText,
		/Audit \| caffeinate · Review — security\/source audit \(1\)/,
	);
	assert.match(collapsedSearchText, /Press Ctrl\+O for full result/);
	assert.doesNotMatch(collapsedSearchText, /result line 1/);
	assertRenderedWithinWidth(collapsedSearch);

	const expandedSearch = render(
		ui.wrappedToolResult(
			"mcp",
			textResult(searchOutput),
			options({ expanded: true }),
			theme,
			context(searchArgs, { toolCallId: "context-search-expanded" }),
			"MCP",
		),
	);
	assert.match(
		expandedSearch,
		/--- \[current-session .* Audit \| caffeinate\] ---/,
	);
	assert.match(expandedSearch, /result line 1/);

	const noResultsSearch = render(
		ui.wrappedToolResult(
			"mcp",
			textResult("## absent query\nNo results found."),
			options(),
			theme,
			context(
				{
					...searchArgs,
					args: JSON.stringify({ queries: ["absent query"] }),
				},
				{ toolCallId: "context-search-no-results" },
			),
			"MCP",
		),
	);
	assert.match(noResultsSearch, /searched 1 query · 2 lines/);
	assert.match(noResultsSearch, /absent query/);
	assert.match(noResultsSearch, /No results found\./);

	const searchError = ui.wrappedToolResult(
		"mcp",
		textResult("Search error: store unavailable"),
		options(),
		theme,
		context(searchArgs, {
			isError: true,
			toolCallId: "context-search-error",
		}),
		"MCP",
	);
	assert.equal(
		render(searchError).trimEnd(),
		"✗ Context · search failed · Search error: store unavailable",
	);

	const genericMcp = render(
		ui.wrappedToolResult(
			"mcp",
			textResult("line 1\nline 2"),
			options(),
			theme,
			context(
				{ tool: "slack_search", args: JSON.stringify({ query: "status" }) },
				{ toolCallId: "generic-mcp" },
			),
			"MCP",
		),
	);
	assert.match(genericMcp, /└ MCP 2 lines/);
	assert.match(genericMcp, /line 1/);

	const registeredTodo = render(
		ui.genericToolResult(
			"todo",
			textResult(
				JSON.stringify({
					assigned: [],
					open: [{ id: "TODO-1", title: "Thing" }],
					closed: [],
				}),
			),
			options(),
			theme,
			context({}, { toolCallId: "registered-todo" }),
			"Todo",
		),
	);
	assert.match(registeredTodo, /└ Todo 1 line/);
	assert.doesNotMatch(registeredTodo, /open todo/);
});

test("local built-in tool call/result renderers cover temp-safe branches", () => {
	assert.match(
		ui.formatReadCall({ path: "/tmp/file.txt", offset: 2, limit: 3 }, theme),
		/Read/,
	);
	assert.match(
		ui.formatGrepCall({ pattern: "needle", path: "/tmp" }, theme),
		/needle/,
	);
	assert.match(
		ui.formatGrepCall(
			{
				pattern: "foo.bar",
				path: "/tmp",
				literal: true,
				ignoreCase: true,
				context: 2,
			},
			theme,
		),
		/literal \/foo\.bar\/ in \/tmp · ignore-case · context 2/,
	);
	assert.match(
		ui.formatFindCall({ pattern: "*.ts", path: "/tmp" }, theme),
		/Find/,
	);
	assert.match(ui.formatLsCall({ path: "/tmp" }, theme), /List/);
	assert.match(ui.formatBashCall({ command: "printf ok" }, theme), /printf ok/);
	assert.equal(
		ui.formatBashCall({ command: "printf one\nprintf two" }, theme),
		"● Bash(2-line script)\n    │ printf one\n    │ printf two",
	);
	const longBashScript = Array.from(
		{ length: 12 },
		(_, index) => `printf ${index + 1}`,
	).join("\n");
	const longBashCall = ui.formatBashCall({ command: longBashScript }, theme);
	assert.match(longBashCall, /● Bash\(12-line script\)/);
	assert.match(longBashCall, /│ printf 1/);
	assert.match(longBashCall, /│ printf 5/);
	assert.match(longBashCall, /… 2 hidden script lines/);
	assert.match(longBashCall, /│ printf 12/);
	assert.doesNotMatch(longBashCall, /│ printf 6/);
	assert.match(
		ui.formatBashCall({ command: longBashScript }, theme, true),
		/◦ Bash\(12-line script\)/,
	);
	assert.match(ui.formatEditCall({ path: "/tmp/file.txt" }, theme), /Update/);
	assert.match(
		ui.formatWriteCall({ path: "/tmp/file.txt", content: "a\nb" }, theme),
		/Write/,
	);

	const readComponent = ui.renderReadResult(
		textResult("alpha\nbeta", { path: "/tmp/file.txt", totalLines: 2 }),
		options(),
		theme,
		context({ path: "/tmp/file.txt" }, { toolCallId: "read" }),
	);
	const readRendered = render(readComponent);
	assert.match(readRendered, /Read 2 lines/);
	assert.match(readRendered, /alpha/);
	assertRenderedWithinWidth(readComponent);

	const expandedReadComponent = ui.renderReadResult(
		textResult("1\n2\n3\n4\n5\n6\n7\n8", {
			path: "/tmp/file.txt",
			totalLines: 8,
		}),
		options({ expanded: true }),
		theme,
		context({}, { toolCallId: "read-expanded" }),
	);
	const expandedReadRendered = render(expandedReadComponent, 120);
	assert.match(expandedReadRendered, /│ 8/);
	assert.doesNotMatch(expandedReadRendered, /… 2 more lines/);
	assertRenderedWithinWidth(expandedReadComponent);

	const skillReadComponent = ui.renderReadResult(
		textResult("# Skill\nbody", {
			path: "/home/orestes/.pi/agent/skills/foo/SKILL.md",
			truncation: { truncated: true },
		}),
		options(),
		theme,
		context({}, { toolCallId: "skill-read" }),
	);
	const skillReadRendered = render(skillReadComponent, 120);
	assert.match(skillReadRendered, /Skill read foo · 2 lines · truncated/);
	assert.doesNotMatch(skillReadRendered, /# Skill/);
	assertRenderedWithinWidth(skillReadComponent);

	const virtualizedSkillReadComponent = ui.renderReadResult(
		textResult(
			'[tool-result-virtualizer] Large read result stored locally\nSource: tr_mock\nCapture: read.input.path; size: 8.5 KiB, 144 lines; sha256: abc\nOutline: tool_result_outline sourceId:"tr_mock"',
		),
		options(),
		theme,
		context(
			{ path: "/home/orestes/.pi/agent/skills/review/SKILL.md" },
			{ toolCallId: "skill-read-virtualized" },
		),
	);
	const virtualizedSkillReadRendered = render(
		virtualizedSkillReadComponent,
		120,
	);
	assert.match(
		virtualizedSkillReadRendered,
		/Skill read review · 144 lines · stored/,
	);
	assert.doesNotMatch(virtualizedSkillReadRendered, /tool-result-virtualizer/);
	assertRenderedWithinWidth(virtualizedSkillReadComponent);

	const virtualizedReadComponent = ui.renderReadResult(
		textResult(
			virtualizedReceipt("read"),
			virtualizerDetails({ toolName: "read" }),
		),
		options(),
		theme,
		context({ path: "/tmp/large.txt" }, { toolCallId: "read-virtualized" }),
	);
	const virtualizedReadRendered = render(virtualizedReadComponent, 120);
	assert.match(virtualizedReadRendered, /Read 1800 lines · stored/);
	assert.match(
		virtualizedReadRendered,
		/stored source: tr_mock · use tool_result_get\/export/,
	);
	assert.match(virtualizedReadRendered, /Middle lines 896-905/);
	assert.match(virtualizedReadRendered, /│ 905: middle 905/);
	assert.doesNotMatch(virtualizedReadRendered, /tool-result-virtualizer/);
	assert.doesNotMatch(virtualizedReadRendered, /Preview only/);
	assert.doesNotMatch(virtualizedReadRendered, /Choose before relying/);
	assertRenderedWithinWidth(virtualizedReadComponent);

	const grepComponent = ui.renderGrepResult(
		textResult("file.ts-1-before\nfile.ts:2:match\nfile.ts-3-after", {
			matchCount: 1,
		}),
		options(),
		theme,
		context(
			{ pattern: "match", path: ".", context: 1 },
			{ toolCallId: "grep-context" },
		),
	);
	const grepRendered = render(grepComponent, 120);
	assert.match(grepRendered, /Grep 1 match · 3 output lines · context 1/);
	assertRenderedWithinWidth(grepComponent);

	const grepFallbackComponent = ui.renderGrepResult(
		textResult("file.ts:2:match", {}),
		options(),
		theme,
		context({ pattern: "match", path: "." }, { toolCallId: "grep-fallback" }),
	);
	assert.match(render(grepFallbackComponent, 120), /Grep 1 output line/);
	assertRenderedWithinWidth(grepFallbackComponent);

	const virtualizedGrepComponent = ui.renderGrepResult(
		textResult(
			virtualizedReceipt("grep"),
			virtualizerDetails({ toolName: "grep" }),
		),
		options(),
		theme,
		context(
			{ pattern: "needle", path: "." },
			{ toolCallId: "grep-virtualized" },
		),
	);
	const virtualizedGrepRendered = render(virtualizedGrepComponent, 120);
	assert.match(virtualizedGrepRendered, /Grep 1800 output lines · stored/);
	assert.match(
		virtualizedGrepRendered,
		/stored source: tr_mock · use tool_result_get\/export/,
	);
	assert.match(virtualizedGrepRendered, /Middle lines 896-905/);
	assert.doesNotMatch(virtualizedGrepRendered, /tool-result-virtualizer/);
	assertRenderedWithinWidth(virtualizedGrepComponent);

	const virtualizedFindComponent = ui.renderFindResult(
		textResult(
			virtualizedReceipt("find"),
			virtualizerDetails({ toolName: "find" }),
		),
		options(),
		theme,
		context({ pattern: "*" }, { toolCallId: "find-virtualized" }),
	);
	const virtualizedFindRendered = render(virtualizedFindComponent, 120);
	assert.match(virtualizedFindRendered, /Find 1800 results · stored/);
	assert.match(virtualizedFindRendered, /Sampled 30 of 1800 lines/);
	assert.match(virtualizedFindRendered, /Tail lines 1791-1800/);
	assert.doesNotMatch(virtualizedFindRendered, /tool-result-virtualizer/);
	assertRenderedWithinWidth(virtualizedFindComponent);

	const virtualizedLsComponent = ui.renderLsResult(
		textResult(
			virtualizedReceipt("ls"),
			virtualizerDetails({ toolName: "ls" }),
		),
		options(),
		theme,
		context({ path: "." }, { toolCallId: "ls-virtualized" }),
	);
	const virtualizedLsRendered = render(virtualizedLsComponent, 120);
	assert.match(virtualizedLsRendered, /List 1800 entries · stored/);
	assert.match(virtualizedLsRendered, /Head lines 1-10/);
	assert.match(virtualizedLsRendered, /Middle lines 896-905/);
	assert.doesNotMatch(virtualizedLsRendered, /tool-result-virtualizer/);
	assertRenderedWithinWidth(virtualizedLsComponent);

	const failureGrepComponent = ui.renderGrepResult(
		textResult(
			virtualizedFailureReceipt("grep"),
			virtualizerFailureDetails({ toolName: "grep" }),
		),
		options(),
		theme,
		context(
			{ pattern: "needle", path: "." },
			{ toolCallId: "grep-virtualizer-failure", isError: true },
		),
	);
	const failureGrepRendered = render(failureGrepComponent, 120);
	assert.match(
		failureGrepRendered,
		/Failed · Grep storage failed · 1800 lines withheld/,
	);
	assert.match(failureGrepRendered, /No source id was created/);
	assert.doesNotMatch(failureGrepRendered, /stored source/);
	assertRenderedWithinWidth(failureGrepComponent);

	const bashComponent = ui.renderBashResult(
		textResult("ok", { exitCode: 0 }),
		options(),
		theme,
		context({ command: "printf ok" }, { toolCallId: "bash" }),
	);
	assert.match(render(bashComponent), /Done/);
	assert.match(render(bashComponent), /1 line/);
	assertRenderedWithinWidth(bashComponent);

	const longBashOutput = Array.from(
		{ length: 12 },
		(_, index) => `output ${index + 1}`,
	).join("\n");
	const runningBashComponent = ui.renderBashResult(
		textResult(longBashOutput),
		options({ isPartial: true }),
		theme,
		context({ command: "printf many" }, { toolCallId: "bash-running" }),
	);
	const runningBashRendered = render(runningBashComponent, 120);
	assert.match(runningBashRendered, /Running · 12 lines/);
	assert.match(runningBashRendered, /│ output 1/);
	assert.match(runningBashRendered, /│ output 5/);
	assert.match(runningBashRendered, /… 2 hidden lines/);
	assert.match(runningBashRendered, /│ output 12/);
	assert.doesNotMatch(runningBashRendered, /│ output 6/);
	assertRenderedWithinWidth(runningBashComponent);

	const finishedLongBashComponent = ui.renderBashResult(
		textResult(longBashOutput, { exitCode: 0 }),
		options(),
		theme,
		context({ command: "printf many" }, { toolCallId: "bash-finished-long" }),
	);
	const finishedLongBashRendered = render(finishedLongBashComponent, 120);
	assert.match(finishedLongBashRendered, /Done · 12 lines/);
	assert.match(finishedLongBashRendered, /│ output 1/);
	assert.match(finishedLongBashRendered, /│ output 5/);
	assert.match(finishedLongBashRendered, /… 2 hidden lines/);
	assert.match(finishedLongBashRendered, /│ output 12/);
	assert.doesNotMatch(finishedLongBashRendered, /│ output 6/);
	assertRenderedWithinWidth(finishedLongBashComponent);

	const virtualizedBashReceipt = [
		"[tool-result-virtualizer] Large bash result stored locally",
		"Source: tr_bash_mock",
		"Capture: details.fullOutputPath; size: 50.0 KiB, 1800 lines; sha256: abc",
		"",
		"## Cropped preview",
		"Preview only — not complete evidence. Use the recommended summary path or exact retrieval/export before making claims about hidden content.",
		"Sampled 30 of 1800 lines; omitted 1770 hidden lines.",
		"### Head lines 1-10",
		...Array.from(
			{ length: 10 },
			(_, index) => `${index + 1}: head ${index + 1}`,
		),
		"[omitted 885 lines between samples]",
		"### Middle lines 896-905",
		...Array.from(
			{ length: 10 },
			(_, index) => `${896 + index}: middle ${896 + index}`,
		),
		"[omitted 885 lines between samples]",
		"### Tail lines 1791-1800",
		...Array.from(
			{ length: 10 },
			(_, index) => `${1791 + index}: tail ${1791 + index}`,
		),
		"",
		"## Choose before relying on hidden content",
	].join("\n");
	const virtualizedBashComponent = ui.renderBashResult(
		textResult(virtualizedBashReceipt, {
			toolResultVirtualizer: {
				sourceId: "tr_bash_mock",
				lineCount: 1800,
				contentReplaced: true,
			},
		}),
		options(),
		theme,
		context(
			{ command: "produce large output" },
			{ toolCallId: "bash-virtualized" },
		),
	);
	const virtualizedBashRendered = render(virtualizedBashComponent, 120);
	assert.match(virtualizedBashRendered, /Done · 1800 lines · stored/);
	assert.match(
		virtualizedBashRendered,
		/stored source: tr_bash_mock · use tool_result_get\/export/,
	);
	assert.match(
		virtualizedBashRendered,
		/Sampled 30 of 1800 lines; omitted 1770 hidden lines\./,
	);
	assert.match(virtualizedBashRendered, /Head lines 1-10/);
	assert.match(virtualizedBashRendered, /│ 1: head 1/);
	assert.match(virtualizedBashRendered, /│ 10: head 10/);
	assert.match(
		virtualizedBashRendered,
		/\[omitted 885 lines between samples\]/,
	);
	assert.match(virtualizedBashRendered, /Middle lines 896-905/);
	assert.match(virtualizedBashRendered, /│ 896: middle 896/);
	assert.match(virtualizedBashRendered, /│ 905: middle 905/);
	assert.match(virtualizedBashRendered, /Tail lines 1791-1800/);
	assert.match(virtualizedBashRendered, /│ 1791: tail 1791/);
	assert.match(virtualizedBashRendered, /│ 1800: tail 1800/);
	assert.doesNotMatch(virtualizedBashRendered, /tool-result-virtualizer/);
	assert.doesNotMatch(virtualizedBashRendered, /Preview only/);
	assert.doesNotMatch(virtualizedBashRendered, /Choose before relying/);
	assertRenderedWithinWidth(virtualizedBashComponent);

	const runningVirtualizedBashComponent = ui.renderBashResult(
		textResult(virtualizedBashReceipt, {
			toolResultVirtualizer: {
				sourceId: "tr_bash_mock",
				lineCount: 1800,
				contentReplaced: true,
			},
		}),
		options({ isPartial: true }),
		theme,
		context(
			{ command: "produce large output" },
			{ toolCallId: "bash-virtualized-running" },
		),
	);
	const runningVirtualizedBashRendered = render(
		runningVirtualizedBashComponent,
		120,
	);
	assert.match(runningVirtualizedBashRendered, /Running · 1800 lines · stored/);
	assert.match(runningVirtualizedBashRendered, /Middle lines 896-905/);
	assert.match(runningVirtualizedBashRendered, /│ 905: middle 905/);
	assert.match(runningVirtualizedBashRendered, /Tail lines 1791-1800/);
	assertRenderedWithinWidth(runningVirtualizedBashComponent);

	const failedVirtualizedBashComponent = ui.renderBashResult(
		textResult(virtualizedBashReceipt, {
			exitCode: 17,
			toolResultVirtualizer: {
				sourceId: "tr_bash_mock",
				lineCount: 1800,
				contentReplaced: true,
			},
		}),
		options(),
		theme,
		context(
			{ command: "produce large output" },
			{ toolCallId: "bash-virtualized-failed", isError: true },
		),
	);
	const failedVirtualizedBashRendered = render(
		failedVirtualizedBashComponent,
		120,
	);
	assert.match(
		failedVirtualizedBashRendered,
		/Failed · exit 17 · 1800 lines · stored/,
	);
	assert.match(failedVirtualizedBashRendered, /Head lines 1-10/);
	assert.match(failedVirtualizedBashRendered, /Middle lines 896-905/);
	assert.match(failedVirtualizedBashRendered, /Tail lines 1791-1800/);
	assertRenderedWithinWidth(failedVirtualizedBashComponent);

	const failedBashComponent = ui.renderBashResult(
		textResult("stderr line 1\nstderr line 2", { exitCode: 17 }),
		options(),
		theme,
		context({}, { toolCallId: "bash-failed", isError: true }),
	);
	const failedBashRendered = render(failedBashComponent, 120);
	assert.match(failedBashRendered, /Failed · exit 17 · 2 lines/);
	assert.match(failedBashRendered, /stderr line 2/);
	assertRenderedWithinWidth(failedBashComponent);

	const readErrorComponent = ui.renderReadResult(
		textResult("ENOENT first line\nsecond detail line"),
		options(),
		theme,
		context({}, { toolCallId: "read-error", isError: true }),
	);
	const readErrorRendered = render(readErrorComponent, 120);
	assert.match(readErrorRendered, /Failed · ENOENT first line/);
	assert.match(readErrorRendered, /second detail line/);
	assertRenderedWithinWidth(readErrorComponent);

	const editComponent = ui.renderEditResult(
		textResult("Updated", { diff: "--- a\n+++ b\n@@\n-old\n+new" }),
		options(),
		theme,
		context({ path: "/tmp/file.txt" }, { toolCallId: "edit" }),
	);
	assert.match(render(editComponent), /Added 1, removed 1/);
	assert.match(render(editComponent), /\+new/);
	assert.match(render(editComponent), /-old/);
	assertRenderedWithinWidth(editComponent);

	const detailsStoredEditComponent = ui.renderEditResult(
		textResult("Updated", {
			diff: "[stored original detail: 4096 bytes]",
			toolResultVirtualizer: {
				sourceId: "tr_edit_details",
				toolName: "edit",
				contentReplaced: false,
				hasOriginalDetails: true,
				originalDetailsByteCount: 4096,
			},
		}),
		options(),
		theme,
		context({ path: "/tmp/file.txt" }, { toolCallId: "edit-details-stored" }),
	);
	const detailsStoredEditRendered = render(detailsStoredEditComponent, 120);
	assert.match(detailsStoredEditRendered, /Updated · details stored/);
	assert.match(
		detailsStoredEditRendered,
		/details source: tr_edit_details · use tool_result_export_details/,
	);
	assert.match(
		detailsStoredEditRendered,
		/\[stored original detail: 4096 bytes\]/,
	);
	assertRenderedWithinWidth(detailsStoredEditComponent);
});

test("temp-dir local mutation simulation remains sandboxed and renderable", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-ui-renderers-"));
	assert.ok(tmp.startsWith(os.tmpdir()), `temp dir escaped system tmp: ${tmp}`);
	const target = path.join(tmp, "dummy.txt");
	assert.ok(
		target.startsWith(tmp + path.sep),
		`target escaped temp dir: ${target}`,
	);

	try {
		fs.writeFileSync(target, "old\n", "utf8");
		const before = fs.readFileSync(target, "utf8");
		fs.writeFileSync(target, before.replace("old", "new"), "utf8");
		const after = fs.readFileSync(target, "utf8");
		assert.equal(after, "new\n");

		const writeComponent = ui.renderWriteResult(
			textResult(`Updated ${target}`),
			options(),
			theme,
			context({ path: target, content: after }, { toolCallId: "temp-write" }),
		);
		const writeRendered = render(writeComponent, 120);
		assert.match(writeRendered, /Wrote 1 line/);
		assert.match(writeRendered, /preview/);
		assert.match(writeRendered, /new/);
		assert.doesNotMatch(
			writeRendered,
			/diff unavailable because previous content was not captured/,
		);
		assertRenderedWithinWidth(writeComponent);

		const writeWithVirtualizerDetailsComponent = ui.renderWriteResult(
			textResult(`Updated ${target}`, {
				toolResultVirtualizer: {
					sourceId: "tr_write_details",
					toolName: "write",
					contentReplaced: false,
					hasOriginalDetails: true,
					originalDetailsByteCount: 4096,
				},
			}),
			options(),
			theme,
			context(
				{ path: target, content: after },
				{ toolCallId: "temp-write-with-virtualizer-details" },
			),
		);
		const writeWithVirtualizerDetailsRendered = render(
			writeWithVirtualizerDetailsComponent,
			120,
		);
		assert.match(writeWithVirtualizerDetailsRendered, /Wrote 1 line/);
		assert.doesNotMatch(writeWithVirtualizerDetailsRendered, /details stored/);
		assert.doesNotMatch(writeWithVirtualizerDetailsRendered, /details source:/);
		assert.doesNotMatch(
			writeWithVirtualizerDetailsRendered,
			/tool_result_export_details/,
		);
		assertRenderedWithinWidth(writeWithVirtualizerDetailsComponent);

		const editComponent = ui.renderEditResult(
			textResult("Updated", {
				diff: `--- ${target}\n+++ ${target}\n@@\n-old\n+new`,
			}),
			options(),
			theme,
			context({ path: target }, { toolCallId: "temp-edit" }),
		);
		assert.match(render(editComponent), /Added 1, removed 1/);
		assert.match(render(editComponent), /\+new/);
		assert.match(render(editComponent), /-old/);
		assertRenderedWithinWidth(editComponent);
	} finally {
		assert.ok(
			tmp.startsWith(os.tmpdir()),
			`refusing cleanup outside tmp: ${tmp}`,
		);
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("intercom renderer covers normal senders, subagent result compaction, reply command, and width", () => {
	const normal = ui.renderIntercomMessage(
		{
			details: {
				from: { name: "worker", cwd: "/tmp/project" },
				bodyText: "normal intercom body",
			},
		},
		{ expanded: false },
		theme,
	);
	const normalRendered = render(normal, 80);
	assert.match(normalRendered, /From: worker/);
	assert.doesNotMatch(normalRendered, /\/tmp\/project/);
	assert.match(normalRendered, /normal intercom body/);
	assertRenderedWithinWidth(normal);

	const subagentResult = ui.renderIntercomMessage(
		{
			details: {
				from: { name: "subagent-result", cwd: "/tmp/project" },
				bodyText:
					"Run: abc123\nMode: chain\nRoute: builtin.quality-gate\nStatus: completed\nChildren: 2 completed\n\n1. scout — completed\nSummary:\nAll good\n\n2. reviewer — failed\nSummary:\nNeeds fixes\n",
				replyCommand: "/reply abc123",
			},
		},
		{ expanded: false },
		theme,
	);
	const rendered = render(subagentResult, 80);
	assert.match(rendered, /subagent result · completed · 2 completed/);
	assert.match(rendered, /run: abc123/);
	assert.match(rendered, /route: builtin\.quality-gate/);
	assert.match(rendered, /scout/);
	assert.match(rendered, /reviewer/);
	assert.match(rendered, /Needs fixes/);
	assert.doesNotMatch(rendered, /\/tmp\/project/);
	assert.match(rendered, /To reply: \/reply abc123/);
	assertRenderedWithinWidth(subagentResult);
});

test("subagent control notice renderer shows a factual user card without control internals", () => {
	const component = ui.renderSubagentControlNotice(
		{
			content:
				'Subagent needs attention: run-monitor\nRun: 1f81f67c-b17f-4360-8b67-42e754f7860a step 1\nSignal: run-monitor needs attention (no observed activity for 60s)\nHint: Inspect status first unless the run is clearly blocked.\nNudge: intercom({ action: "send", to: "subagent-run-monitor-1f81f67c-b17f-4360-8b67-42e754f7860a-1", message: "What are you blocked on?" })\nStatus: subagent({ action: "status", id: "1f81f67c-b17f-4360-8b67-42e754f7860a" })\nInterrupt: subagent({ action: "interrupt", id: "1f81f67c-b17f-4360-8b67-42e754f7860a" })',
			details: {
				event: {
					type: "needs_attention",
					to: "needs_attention",
					ts: 1790000000000,
					agent: "run-monitor",
					index: 0,
					runId: "1f81f67c-b17f-4360-8b67-42e754f7860a",
					message: "run-monitor needs attention (no observed activity for 60s)",
					reason: "idle",
					elapsedMs: 60000,
				},
				childIntercomTarget:
					"subagent-run-monitor-1f81f67c-b17f-4360-8b67-42e754f7860a-1",
			},
		},
		{ expanded: false },
		theme,
	);

	const rendered = render(component, 80);
	assert.match(rendered, /Subagent monitor/);
	assert.match(rendered, /Agent: run-monitor · step 1/);
	assert.match(rendered, /Activity: no observed activity for 60s/);
	assert.match(rendered, /Run: 1f81f67c…/);
	assert.doesNotMatch(rendered, /Nudge:/);
	assert.doesNotMatch(rendered, /Status:/);
	assert.doesNotMatch(rendered, /Interrupt:/);
	assert.doesNotMatch(rendered, /parent/i);
	assert.doesNotMatch(rendered, /orchestrator/i);
	assert.doesNotMatch(rendered, /No action needed/i);
	assert.doesNotMatch(rendered, /I'll/i);
	assertRenderedWithinWidth(component);
});

test("subagent control notice renderer includes useful failure context", () => {
	const component = ui.renderSubagentControlNotice(
		{
			details: {
				event: {
					type: "needs_attention",
					to: "needs_attention",
					ts: 1790000000000,
					agent: "worker",
					index: 1,
					runId: "7a92c01b-b17f-4360-8b67-42e754f7860a",
					message:
						"worker needs attention after repeated mutating tool failures",
					reason: "tool_failures",
					currentTool: "edit",
					currentPath: "src/app.ts",
					recentFailureSummary: "edit src/app.ts: old text did not match",
				},
			},
		},
		{ expanded: false },
		theme,
	);

	const rendered = render(component, 80);
	assert.match(rendered, /Subagent monitor/);
	assert.match(rendered, /Agent: worker · step 2/);
	assert.match(rendered, /Activity: repeated edit failures/);
	assert.match(rendered, /Last tool: edit · src\/app\.ts/);
	assert.match(
		rendered,
		/Recent failure: edit src\/app\.ts: old text did not match/,
	);
	assertRenderedWithinWidth(component);
});

test("subagent control notice renderer covers straggler notices and width", () => {
	const component = ui.renderSubagentControlNotice(
		{
			content:
				"Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.\nRunning: researcher 2/4, elapsed 9m10s, last activity 1m2s ago, 84 tools, 407320 tokens\nThreshold: slower than 9m8s (6m5s peer baseline).\nNo automatic action taken.\nActions: wait, inspect status/activity, nudge if available, interrupt, or detach/background when available.",
			details: {
				key: "parallel-straggler:run-1",
				runId: "run-1",
				source: "foreground",
				noticeText:
					"Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.",
			},
		},
		{ expanded: false },
		theme,
	);

	const rendered = render(component, 80);
	assert.match(rendered, /Subagent monitor/);
	assert.match(
		rendered,
		/Parallel barrier blocked by straggler: top-level parallel/,
	);
	assert.match(rendered, /3\/4 complete; 1 still running/);
	assert.doesNotMatch(rendered, /Actions:/);
	assert.doesNotMatch(rendered, /subagent_control_notice/);
	assertRenderedWithinWidth(component);
});

test("subagent-control intercom duplicates are hidden in the user UI", () => {
	const component = ui.renderIntercomMessage(
		{
			details: {
				from: { name: "subagent-control", cwd: "/tmp/project" },
				bodyText:
					'subagent needs attention\n\nrun-monitor needs attention in run 1f81f67c-b17f-4360-8b67-42e754f7860a.\n\nSubagent needs attention: run-monitor\nRun: 1f81f67c-b17f-4360-8b67-42e754f7860a step 1\nSignal: run-monitor needs attention (no observed activity for 60s)\nNudge: intercom({ action: "send", to: "subagent-run-monitor", message: "What are you blocked on?" })\nStatus: subagent({ action: "status", id: "1f81f67c-b17f-4360-8b67-42e754f7860a" })\nInterrupt: subagent({ action: "interrupt", id: "1f81f67c-b17f-4360-8b67-42e754f7860a" })',
			},
		},
		{ expanded: false },
		theme,
	);

	assert.equal(render(component, 80), "");
	assertRenderedWithinWidth(component);

	const extraComponent = ui.renderIntercomMessage(
		{
			details: {
				from: { name: "subagent-control" },
				bodyText:
					"subagent needs attention\n\nExtra user-visible note: check logs before retrying.\n\nSubagent needs attention: run-monitor\nRun: 1f81f67c-b17f-4360-8b67-42e754f7860a step 1\nSignal: run-monitor needs attention (no observed activity for 60s)\n\nSuffix note: keep me visible.",
			},
		},
		{ expanded: false },
		theme,
	);
	const extraRendered = render(extraComponent, 80);
	assert.match(extraRendered, /Extra user-visible note/);
	assert.match(extraRendered, /Suffix note: keep me visible/);
	assert.doesNotMatch(extraRendered, /Subagent needs attention: run-monitor/);
	assertRenderedWithinWidth(extraComponent);

	const labeledSuffixComponent = ui.renderIntercomMessage(
		{
			details: {
				from: { name: "subagent-control" },
				bodyText:
					"subagent needs attention\n\nSubagent needs attention: run-monitor\nRun: 1f81f67c-b17f-4360-8b67-42e754f7860a step 1\nSignal: run-monitor needs attention (no observed activity for 60s)\nHint: Inspect status first unless the run is clearly blocked.\n\nHint: keep this user-visible suffix.",
			},
		},
		{ expanded: false },
		theme,
	);
	const labeledSuffixRendered = render(labeledSuffixComponent, 80);
	assert.match(labeledSuffixRendered, /Hint: keep this user-visible suffix/);
	assert.doesNotMatch(
		labeledSuffixRendered,
		/Subagent needs attention: run-monitor/,
	);
	assertRenderedWithinWidth(labeledSuffixComponent);
});

test("subagent control notice renderer hides stale straggler notices after run completion", () => {
	const runId = "35981d53";
	const notice = {
		content:
			"Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.\nRunning: reviewer 1/4, elapsed 5m14s, last activity 50.8s ago, 60 tools, 104158 tokens\nThreshold: slower than 5m13s (3m29s peer baseline).\nNo automatic action taken.\nActions: wait, inspect status/activity, nudge if available, interrupt, or detach/background when available.",
		details: {
			key: "35981d53:parallel:top-level parallel:3",
			runId,
			source: "foreground",
			noticeText:
				"Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.",
		},
	};
	const assertHidden = (branch) => {
		const component = ui.renderSubagentControlNotice(
			notice,
			{ expanded: false, getBranch: () => branch },
			theme,
		);

		const rendered = render(component, 80);
		assert.match(
			rendered,
			/stale subagent notice hidden · run 35981d53 completed/,
		);
		assert.doesNotMatch(rendered, /3\/4 complete; 1 still running/);
		assert.doesNotMatch(rendered, /Parallel barrier blocked by straggler/);
		assert.doesNotMatch(rendered, /subagent_control_notice/);
		assertRenderedWithinWidth(component);
	};

	assertHidden([
		{
			type: "message",
			id: "tool-result",
			parentId: null,
			timestamp: "2026-07-03T09:37:01.713Z",
			message: {
				role: "toolResult",
				toolName: "subagent",
				content: [
					{
						type: "text",
						text: "Delivered parallel subagent results via intercom.\nRun: 35981d53\nChildren: 4 completed\nRun intercom targets (may be inactive after completion):",
					},
				],
			},
		},
	]);

	assertHidden([
		{
			type: "custom_message",
			customType: "intercom_message",
			id: "intercom-result",
			parentId: null,
			timestamp: "2026-07-03T09:37:01.713Z",
			display: true,
			content: "**📨 From subagent-result** (/home/orestes/.config/pi)",
			details: {
				from: { name: "subagent-result" },
				bodyText:
					"Run: 35981d53\nMode: parallel\nStatus: completed\nChildren: 4 completed",
			},
		},
	]);
});
