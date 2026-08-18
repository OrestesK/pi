import test from "node:test";
import assert from "node:assert/strict";

import {
	initTheme,
	SkillInvocationMessageComponent,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import { Text, visibleWidth } from "@earendil-works/pi-tui";

import registerClaudeUi from "../core.ts";

initTheme(undefined, false);

const theme = {
	fg: (_name, text) => text,
	bg: (_name, text) => text,
	bold: (text) => text,
	italic: (text) => text,
	strikethrough: (text) => text,
};

const handlers = new Map();
const messageRenderers = new Map();
const registeredTools = new Map();
const pi = {
	events: { emit() {} },
	getThinkingLevel: () => "off",
	on(event, handler) {
		const entries = handlers.get(event) ?? [];
		entries.push(handler);
		handlers.set(event, entries);
	},
	registerCommand() {},
	registerMessageRenderer(type, renderer) {
		messageRenderers.set(type, renderer);
	},
	registerTool(definition) {
		registeredTools.set(definition.name, definition);
	},
};
registerClaudeUi(pi);

let nextToolCallId = 0;
const toolExecutionMetadata = new WeakMap();

function textResult(text, details = undefined) {
	return {
		content: [{ type: "text", text }],
		...(details === undefined ? {} : { details }),
	};
}

function rawToolDefinition(name, overrides = {}) {
	return {
		name,
		label: name,
		description: `${name} renderer contract fixture`,
		parameters: {},
		execute: async () => textResult("unused"),
		...overrides,
	};
}

function toolExecution(name, args = {}, definition = rawToolDefinition(name)) {
	nextToolCallId += 1;
	const toolCallId = `claude-ui-contract-${nextToolCallId}`;
	const component = new ToolExecutionComponent(
		name,
		toolCallId,
		args,
		{ showImages: false, imageWidthCells: 80 },
		definition,
		{ requestRender() {} },
		process.cwd(),
	);
	toolExecutionMetadata.set(component, { toolCallId, toolName: name });
	return component;
}

async function emitToolExecutionEnd(component, result, isError = false) {
	const { toolCallId, toolName } = toolExecutionMetadata.get(component);
	for (const handler of handlers.get("tool_execution_end") ?? []) {
		await handler(
			{
				type: "tool_execution_end",
				toolCallId,
				toolName,
				result,
				isError,
			},
			{ hasUI: false },
		);
	}
}

function finish(component, text, details, { isError = false, isPartial = false } = {}) {
	component.markExecutionStarted();
	component.setArgsComplete();
	component.updateResult(
		{
			content: [{ type: "text", text }],
			details,
			isError,
		},
		isPartial,
	);
	return component;
}

function render(component, width = 120) {
	return component.render(width).join("\n");
}

function plain(value) {
	return value
		.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

function assertFits(component, width = 40) {
	for (const line of component.render(width)) {
		assert.ok(
			visibleWidth(line) <= width,
			`rendered line exceeds ${width} columns: ${plain(line)}`,
		);
	}
}

function assistantUsageEntry({ input = 0, output = 0, cacheRead = 0, cacheWrite = 0 }) {
	return {
		type: "message",
		message: {
			role: "assistant",
			usage: {
				input,
				output,
				cacheRead,
				cacheWrite,
				totalTokens: input + output + cacheRead + cacheWrite,
				cost: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					total: 0,
				},
			},
		},
	};
}

test("registered tool rendering shows pending identity and a salient argument", () => {
	const component = toolExecution("project_report", {
		focus: "renderer contracts",
		view: "compact",
	});
	const pending = plain(render(component, 80));

	assert.match(pending, /Project Report/);
	assert.match(pending, /renderer contracts/);
	assert.match(pending, /● Project Report/);
	assertFits(component, 32);
});

test("structured success stays concise while expanded, partial, malformed, and error states remain visible", () => {
	const payload = "PROJECT_REPORT_RAW_PAYLOAD";
	const successDetails = {
		available: true,
		hubs: 3,
		entryPoints: 2,
		view: "compact",
	};
	const success = finish(
		toolExecution("project_report", { focus: "renderers" }),
		payload,
		successDetails,
	);

	assert.doesNotMatch(plain(render(success)), new RegExp(payload));
	success.setExpanded(true);
	assert.match(plain(render(success)), new RegExp(payload));
	assertFits(success, 40);

	const partial = finish(
		toolExecution("project_report", { focus: "renderers" }),
		"PARTIAL_PROJECT_REPORT",
		successDetails,
		{ isPartial: true },
	);
	assert.match(plain(render(partial)), /Inspecting Project|Project Report/);

	const malformed = finish(
		toolExecution("project_report", { focus: "renderers" }),
		"MALFORMED_PROJECT_REPORT",
		{ available: true, view: "compact" },
	);
	assert.match(plain(render(malformed)), /MALFORMED_PROJECT_REPORT/);

	const failed = finish(
		toolExecution("project_report", { focus: "renderers" }),
		"PROJECT_REPORT_FAILED",
		{ error: "unavailable" },
		{ isError: true },
	);
	assert.match(plain(render(failed)), /PROJECT_REPORT_FAILED/);
});

test("search results distinguish zero matches, successful matches, expansion, and failure", () => {
	const noMatches = finish(
		toolExecution("tool_result_search", { query: "absent" }),
		"NO_MATCH_RAW_PAYLOAD",
		{ matchCount: 0 },
	);
	const zeroText = plain(render(noMatches));
	assert.match(zeroText, /0 matches/);
	assert.doesNotMatch(zeroText, /NO_MATCH_RAW_PAYLOAD/);

	const matches = finish(
		toolExecution("tool_result_search", { query: "renderer" }),
		"SEARCH_MATCH_RAW_PAYLOAD",
		{ matchCount: 2 },
	);
	assert.doesNotMatch(plain(render(matches)), /SEARCH_MATCH_RAW_PAYLOAD/);
	matches.setExpanded(true);
	assert.match(plain(render(matches)), /SEARCH_MATCH_RAW_PAYLOAD/);

	const failed = finish(
		toolExecution("tool_result_search", { query: "renderer" }),
		"SEARCH_BACKEND_FAILED",
		{ error: "backend unavailable" },
		{ isError: true },
	);
	assert.match(plain(render(failed)), /SEARCH_BACKEND_FAILED/);
});

test("create-goal compacts only producer-confirmed success", async () => {
	const originalCall = "ORIGINAL_CREATE_GOAL_CALL";
	const originalResult = "ORIGINAL_CREATE_GOAL_RESULT";
	const objective = "Keep renderer verification moving";
	const definition = rawToolDefinition("create_goal", {
		renderCall(args) {
			return new Text(`${originalCall} ${args.objective}`, 0, 0);
		},
		renderResult(result) {
			return new Text(
				`${originalResult} ${result.content?.[0]?.text ?? ""}`,
				0,
				0,
			);
		},
	});
	const structured = {
		version: 3,
		goal: { objective, status: "active", autoContinue: true },
	};
	const component = toolExecution(
		"create_goal",
		{ objective, mode: "regular" },
		definition,
	);
	await emitToolExecutionEnd(component, {
		content: [{ type: "text", text: "CREATE_GOAL_RAW_PAYLOAD" }],
		details: structured,
		terminate: true,
	});
	finish(component, "CREATE_GOAL_RAW_PAYLOAD", structured);
	const concise = plain(render(component));

	assert.match(concise, /Goal.*running.*auto-continue on/);
	assert.doesNotMatch(concise, new RegExp(originalResult));

	component.setExpanded(true);
	const expanded = plain(render(component));
	assert.match(expanded, new RegExp(originalCall));
	assert.match(expanded, new RegExp(originalResult));
	assert.match(expanded, /CREATE_GOAL_RAW_PAYLOAD/);

	const rejected = toolExecution("create_goal", { objective }, definition);
	await emitToolExecutionEnd(rejected, {
		content: [{ type: "text", text: "CREATE_GOAL_VALIDATION_FAILED" }],
		details: structured,
	});
	finish(rejected, "CREATE_GOAL_VALIDATION_FAILED", structured);
	assert.match(plain(render(rejected)), new RegExp(originalResult));
	assert.match(plain(render(rejected)), /CREATE_GOAL_VALIDATION_FAILED/);
});

test("subagent lifecycle hides model instructions but keeps launch and failure outcomes", () => {
	const args = {
		tasks: [{ agent: "reviewer" }, { agent: "reviewer" }],
		async: true,
	};
	const lifecycleText = [
		"Async parallel: reviewer + reviewer [12345678-1234-5678-9abc-def012345678]",
		"Do not run sleep timers or polling loops just to wait for it.",
		"PRIVATE_MODEL_LIFECYCLE_INSTRUCTION",
	].join("\n");
	const launched = finish(toolExecution("subagent", args), lifecycleText, {
		mode: "parallel",
		runId: "12345678-1234-5678-9abc-def012345678",
		asyncId: "12345678-1234-5678-9abc-def012345678",
		asyncDir: "/tmp/private-run",
		results: [],
	});
	const launchedText = plain(render(launched));

	assert.match(launchedText, /Launched 2 reviewers in background/);
	assert.doesNotMatch(launchedText, /PRIVATE_MODEL_LIFECYCLE_INSTRUCTION/);
	assert.doesNotMatch(launchedText, /private-run/);
	assertFits(launched, 40);

	const failed = finish(
		toolExecution("subagent", args),
		"FAILED_TO_START_SUBAGENTS",
		{ mode: "parallel", results: [] },
		{ isError: true },
	);
	assert.match(plain(render(failed)), /FAILED_TO_START_SUBAGENTS/);
});

test("context-mode MCP reports lifecycle state and preserves raw detail only when expanded", () => {
	const args = {
		tool: "context_mode_ctx_index",
		args: JSON.stringify({ source: "Renderer audit" }),
	};
	const output = [
		"Indexed 3 sections (0 with code) from: Renderer audit",
		"Use ctx_search to query this content.",
	].join("\n");
	const indexed = finish(toolExecution("mcp", args), output);
	const concise = plain(render(indexed));

	assert.match(concise, /Context.*indexed Renderer audit.*3 sections/);
	assert.doesNotMatch(concise, /Use ctx_search/);
	indexed.setExpanded(true);
	assert.match(plain(render(indexed)), /Use ctx_search/);
	assertFits(indexed, 40);

	const failed = finish(
		toolExecution("mcp", args),
		"CONTEXT_INDEX_FAILED",
		undefined,
		{ isError: true },
	);
	assert.match(plain(render(failed)), /CONTEXT_INDEX_FAILED/);
});

test("virtualized receipts distinguish stored content from storage failure", () => {
	const receipt = [
		"[tool-result-virtualizer] Large read result stored locally",
		"Source: tr_contract",
		"Capture: event.content; size: 50.0 KiB, 1800 lines; sha256: abc",
		"Preview only — not complete evidence.",
	].join("\n");
	const stored = finish(
		toolExecution("tool_result_get", { sourceId: "tr_contract" }),
		receipt,
		{
			toolResultVirtualizer: {
				sourceId: "tr_contract",
				toolName: "read",
				lineCount: 1800,
				contentReplaced: true,
			},
		},
	);
	const storedText = plain(render(stored));
	assert.match(storedText, /stored/);
	assert.match(storedText, /tr_contract/);
	assertFits(stored, 40);

	const failureReceipt = [
		"[tool-result-virtualizer] Large read result failed before local storage completed",
		"Original content withheld: 50.0 KiB, 1800 lines",
		"No source id was created.",
	].join("\n");
	const failed = finish(
		toolExecution("tool_result_get", { sourceId: "missing" }),
		failureReceipt,
		{
			toolResultVirtualizerFailure: {
				toolName: "read",
				byteCount: 51200,
				lineCount: 1800,
				contentWithheld: true,
				receiptBytes: 160,
			},
		},
		{ isError: true },
	);
	const failedText = plain(render(failed));
	assert.match(failedText, /storage failed/);
	assert.match(failedText, /1800 lines withheld/);
});

test("web and fetch calls keep salient identity, semantic outcomes, and complete expanded payloads", () => {
	const searchPayload = Array.from(
		{ length: 25 },
		(_, index) => `WEB_SEARCH_LINE_${index + 1}`,
	).join("\n");
	const search = finish(
		toolExecution("web_search", {
			queries: ["renderer ownership", "tool result grammar"],
		}),
		searchPayload,
		{
			queryCount: 2,
			successfulQueries: 1,
			totalResults: 7,
			cancelled: false,
		},
	);
	const concise = plain(render(search));
	assert.match(concise, /renderer ownership/);
	assert.match(concise, /\+1 query/);
	assert.match(concise, /7 results/);
	assert.match(concise, /1\/2 queries/);
	assert.match(concise, /1 failed/);
	assert.doesNotMatch(concise, /tool result grammar/);
	assert.doesNotMatch(concise, /WEB_SEARCH_LINE_25/);
	search.setExpanded(true);
	const expanded = plain(render(search));
	assert.match(expanded, /tool result grammar/);
	assert.match(expanded, /WEB_SEARCH_LINE_25/);

	const fetch = finish(
		toolExecution("fetch_content", {
			urls: ["https://example.com/one", "https://example.com/two"],
		}),
		"FETCH_PARTIAL_PAYLOAD",
		{
			responseId: "fetch-response",
			urlCount: 2,
			successful: 1,
			totalChars: 120,
			truncated: true,
		},
	);
	const fetchConcise = plain(render(fetch));
	assert.match(fetchConcise, /https:\/\/example\.com\/one/);
	assert.match(fetchConcise, /\+1 URL/);
	assert.match(fetchConcise, /Fetched.*1\/2 URLs/);
	assert.match(fetchConcise, /120 characters/);
	assert.match(fetchConcise, /1 failed/);
	assert.match(fetchConcise, /truncated/);
});

test("bash rows show the first command and typed output count", () => {
	const definition = registeredTools.get("bash");
	assert.ok(definition, "Claude UI must register its public bash renderer");
	const component = finish(
		toolExecution(
			"bash",
			{ command: "printf first\\nprintf second\\nprintf third" },
			definition,
		),
		"first\nsecond\nthird",
		{ exitCode: 0 },
	);
	const concise = plain(render(component));
	assert.match(concise, /printf first/);
	assert.match(concise, /\+2 command lines/);
	assert.match(concise, /3 output lines/);
	assert.doesNotMatch(concise, /Done/);
	component.setExpanded(true);
	assert.match(plain(render(component)), /printf second/);
	assert.match(plain(render(component)), /second/);
});

test("settled collapsed slot adapters preserve original expanded evidence", () => {
	const originalDefinition = (name) =>
		rawToolDefinition(name, {
			renderShell: "default",
			renderCall() {
				return new Text(`ORIGINAL_${name}_CALL`, 0, 0);
			},
			renderResult() {
				return new Text(`ORIGINAL_${name}_RESULT`, 0, 0);
			},
		});

	const read = finish(
		toolExecution(
			"read",
			{ path: "notes.md", offset: 3, limit: 2 },
			originalDefinition("read"),
		),
		"line three\nline four",
		{ totalLines: 2, path: "notes.md" },
	);
	assert.match(plain(render(read)), /Read.*notes\.md.*lines 3-4/);
	assert.match(plain(render(read)), /Loaded.*2 lines/);
	read.setExpanded(true);
	assert.match(plain(render(read)), /ORIGINAL_read_CALL/);
	assert.match(plain(render(read)), /ORIGINAL_read_RESULT/);

	const replace = finish(
		toolExecution(
			"replace",
			{
				path: "notes.md",
				remove_from: "aB3",
				remove_to: "cD4",
				replacement_text: "new",
			},
			originalDefinition("replace"),
		),
		"replacement applied",
		{
			diff: "--- notes.md\n+++ notes.md\n@@\n-old\n+new",
			metrics: {
				classification: "applied",
				edits_attempted: 1,
				added_lines: 1,
				removed_lines: 1,
				warnings: 0,
			},
		},
	);
	const replaceConcise = plain(render(replace));
	assert.match(replaceConcise, /Replace.*notes\.md.*anchors aB3–cD4/);
	assert.match(replaceConcise, /Updated.*1 block.*\+1 −1 lines/);
	assert.match(replaceConcise, /-old/);
	replace.setExpanded(true);
	assert.match(plain(render(replace)), /ORIGINAL_replace_RESULT/);

	const execute = finish(
		toolExecution(
			"ctx_execute",
			{ language: "python", code: "print('summary')" },
			originalDefinition("ctx_execute"),
		),
		"summary\ncomplete",
		undefined,
	);
	const executeConcise = plain(render(execute));
	assert.match(executeConcise, /Execute.*python.*print\('summary'\)/);
	assert.match(executeConcise, /Output.*2 output lines/);
	execute.setExpanded(true);
	assert.match(plain(render(execute)), /ORIGINAL_ctx_execute_CALL/);
	assert.match(plain(render(execute)), /ORIGINAL_ctx_execute_RESULT/);
});

test("subagent management uses structured children and skill rows stay quiet", () => {
	const status = finish(
		toolExecution("subagent", {
			action: "status",
			id: "12345678-1234-5678-9abc-def012345678",
			index: 1,
		}),
		"State: running\nCommands:\n  Status: subagent({ action: \"status\", id: \"12345678\" })",
		{
			mode: "management",
			results: [],
			management: {
				view: "status",
				totalRuns: 1,
				runs: [
					{
						id: "12345678-1234-5678-9abc-def012345678",
						mode: "parallel",
						state: "running",
						children: [
							{
								index: 1,
								agent: "reviewer",
								state: "running",
								activity: "Bash",
							},
						],
					},
				],
			},
		},
	);
	const statusText = plain(render(status));
	assert.match(statusText, /child #2 \(index 1\)/);
	assert.match(statusText, /#2 reviewer · running · Bash/);
	assert.doesNotMatch(statusText, /70 agents/);
	status.setExpanded(true);
	const expandedStatus = plain(render(status));
	assert.match(expandedStatus, /State: running/);
	assert.match(expandedStatus, /Status: subagent\(\{ action: "status"/);

	const zeroChild = finish(
		toolExecution("subagent", { action: "status", id: "empty-run" }),
		"State: queued",
		{
			mode: "management",
			results: [],
			management: {
				view: "status",
				totalRuns: 1,
				runs: [
					{
						id: "empty-run",
						mode: "single",
						state: "queued",
						children: [],
					},
				],
			},
		},
	);
	assert.match(plain(render(zeroChild)), /1 run · 0 children/);

	const noRuns = finish(
		toolExecution("subagent", { action: "status", view: "fleet" }),
		"No active subagent fleet. Use status with a run id for completed runs.",
		{
			mode: "management",
			results: [],
			management: { view: "fleet", totalRuns: 0, runs: [] },
		},
	);
	const noRunsConcise = plain(render(noRuns));
	assert.match(noRunsConcise, /No active runs/);
	assert.doesNotMatch(noRunsConcise, /Use status with a run id/);
	noRuns.setExpanded(true);
	assert.match(plain(render(noRuns)), /Use status with a run id/);

	const skill = new SkillInvocationMessageComponent({
		name: "brainstorming",
		content: "FULL_SKILL_CONTENT",
	});
	const skillConcise = plain(render(skill));
	assert.match(skillConcise, /Skill · brainstorming/);
	assert.doesNotMatch(skillConcise, /\[skill\]|Ctrl\+O|to expand/i);
	skill.setExpanded(true);
	assert.match(plain(render(skill)), /FULL_SKILL_CONTENT/);
});

test("registered built-in renderer keeps pending identity, concise summary, expansion, and errors visible", () => {
	const definition = registeredTools.get("ls");
	assert.ok(definition, "Claude UI must register its public ls renderer");
	const component = toolExecution("ls", { path: "/tmp" }, definition);
	const pending = plain(render(component));
	assert.match(pending, /List.*\/tmp/);

	finish(component, "alpha\nbeta", { count: 2 });
	const concise = plain(render(component));
	assert.match(concise, /2 entries|alpha/);
	component.setExpanded(true);
	assert.match(plain(render(component)), /alpha/);
	assert.match(plain(render(component)), /beta/);
	assertFits(component, 32);

	const failed = finish(
		toolExecution("ls", { path: "/missing" }, definition),
		"LIST_FAILED",
		undefined,
		{ isError: true },
	);
	assert.match(plain(render(failed)), /LIST_FAILED/);
});

test("registered message renderers keep useful intercom and control-failure context", () => {
	const intercom = messageRenderers.get("intercom_message");
	assert.equal(typeof intercom, "function");
	const intercomText = plain(
		render(
			intercom(
				{
					content: "Deployment status is blocked",
					details: { sender: "reviewer" },
				},
				{ expanded: false },
				theme,
			),
		),
	);
	assert.match(intercomText, /Deployment status is blocked/);

	const controlEntry = [...messageRenderers.entries()].find(
		([type]) => type !== "intercom_message" && type.includes("subagent"),
	);
	assert.ok(controlEntry, "Claude UI must register a subagent control renderer");
	const [, control] = controlEntry;
	const controlComponent = control(
		{
			content: [
				{
					type: "text",
					text: "Subagent failed:\nRun: 12345678-1234-5678-9abc-def012345678\nFailure: renderer contract failed",
				},
			],
			details: {
				event: {
					type: "needs_attention",
					reason: "tool_failures",
					runId: "12345678-1234-5678-9abc-def012345678",
					agent: "reviewer",
					recentFailureSummary: "renderer contract failed",
				},
			},
		},
		{ expanded: false },
		theme,
	);
	const controlText = plain(render(controlComponent));
	assert.match(controlText, /repeated edit failures/i);
	assert.match(controlText, /renderer contract failed/);
	assertFits(controlComponent, 40);
});

test("registered footer separates primary status from metrics and sanitizes extension status", async () => {
	const entries = [
		assistantUsageEntry({ input: 1, output: 1, cacheRead: 2, cacheWrite: 0 }),
	];
	const statuses = new Map();
	let footerFactory;
	const widgetCalls = [];
	const ctx = {
		cwd: "/workspace/project",
		getContextUsage: () => ({ contextWindow: 200_000, percent: 42, tokens: 84_000 }),
		hasUI: true,
		isIdle: () => true,
		model: { contextWindow: 200_000, id: "claude-contract" },
		modelRegistry: { isUsingOAuth: () => true },
		sessionManager: {
			getBranch: () => [],
			getEntries: () => entries,
		},
		shutdown() {},
		ui: {
			addAutocompleteProvider() {},
			setEditorComponent() {},
			setFooter(factory) {
				footerFactory = factory;
			},
			setWidget(...args) {
				widgetCalls.push(args);
			},
			setWorkingVisible() {},
			theme,
		},
	};
	const sessionStart = handlers.get("session_start")?.[0];
	assert.equal(typeof sessionStart, "function");
	await sessionStart({}, ctx);
	assert.equal(typeof footerFactory, "function");

	const footer = footerFactory(
		{ requestRender() {} },
		theme,
		{
			getExtensionStatuses: () => statuses,
			getGitBranch: () => "detached",
			onBranchChange: () => () => {},
		},
	);
	try {
		const initial = footer.render(120).map((line) => plain(line).trimEnd());
		assert.equal(initial.length, 2);
		assert.match(initial[0], /\/workspace\/project \(detached\)/);
		assert.doesNotMatch(initial[0], /cache|tokens/);
		assert.match(initial[1], /cache 67%/);
		assert.match(initial[1], /tokens 4/);

		statuses.set(
			"slipstream",
			"\u001b[31mslipstream:\u001b[39m checking\n\u001b]8;;https://example.com\u0007summary\u001b]8;;\u0007",
		);
		footer.invalidate();
		const active = plain(footer.render(160)[0]);
		assert.match(active, /slipstream: checking summary/);
		assert.doesNotMatch(active, /example\.com|\n|\x1b/);

		for (const line of footer.render(40)) {
			assert.ok(visibleWidth(line) <= 40);
		}
		assert.ok(
			widgetCalls.some(([name, value]) => name === "slipstream" && value === undefined),
			"duplicate Slipstream widget should be suppressed",
		);
	} finally {
		for (const shutdown of handlers.get("session_shutdown") ?? []) {
			await shutdown({}, ctx);
		}
	}
});
