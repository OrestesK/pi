import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { visibleWidth } from "@mariozechner/pi-tui";

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
const render = (component, width = 160) => renderLines(component, width).join("\n");
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
const options = (extra = {}) => ({ expanded: false, isPartial: false, ...extra });
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
  "lsp_navigation",
  "lsp_diagnostics",
  "memory_search",
  "memory_write",
  "memory_list",
  "memory_check",
  "memory_sync",
];

const callMatrix = [
  ["web_search", { queries: ["alpha", "beta"] }, "2 queries"],
  ["web_search", { query: "alpha query" }, "alpha query"],
  ["web_search", {}, "…"],
  ["code_search", { query: "TypeScript renderer examples" }, "TypeScript renderer examples"],
  ["code_search", {}, "…"],
  ["fetch_content", { urls: ["https://example.test/a", "https://example.test/b"] }, "2 urls"],
  ["fetch_content", { url: "https://example.test/long/path", timestamp: "1:23", frames: 3 }, "https://example.test/long/path"],
  ["fetch_content", {}, "…"],
  ["get_search_content", { responseId: "resp-1", query: "alpha" }, "alpha"],
  ["get_search_content", { responseId: "resp-2", url: "https://example.test" }, "https://example.test"],
  ["get_search_content", { responseId: "resp-3", queryIndex: 0 }, "query #0"],
  ["get_search_content", { responseId: "resp-4", urlIndex: 1 }, "url #1"],
  ["Agent", { subagent_type: "reviewer", description: "check rendering" }, "reviewer"],
  ["mcp", { tool: "slack_search", server: "slack", action: "mock-only" }, "slack_search"],
  ["mcp", { connect: "context7" }, "connect context7"],
  ["mcp", { describe: "tool_name" }, "describe tool_name"],
  ["mcp", { search: "docs" }, "search docs"],
  ["intercom", { action: "pending" }, "pending"],
  ["intercom", { action: "ask", to: "worker", message: "Need review" }, "worker"],
  ["intercom", { action: "reply", message: "ack" }, "ack"],
  ["contact_supervisor", { reason: "need_decision", message: "Should I optimize for readability or speed?" }, "Needs decision"],
  ["contact_supervisor", { reason: "progress_update", message: "UPDATE: found the root cause" }, "Progress update"],
  ["contact_supervisor", {}, "…"],
  ["subagent", { agent: "scout", task: "look", async: true }, "scout"],
  ["subagent", { action: "status", id: "abc123" }, "status"],
  ["subagent", { workflow: "builtin.generate-filter", task: "ideas" }, "builtin.generate-filter"],
  ["subagent", { chain: [{ agent: "scout" }, { agent: "reviewer" }] }, "chain 2 steps"],
  ["subagent", { tasks: [{ agent: "scout", count: 2 }, { agent: "reviewer" }] }, "parallel 3 agents"],
  ["subagent", undefined, "…"],
  ["subagent_list", { agent: "scout", task: "list available", status: "ready" }, "scout"],
  ["subagent_done", { agent: "worker", task: "finish", status: "done" }, "worker"],
  ["todo", { action: "create", id: "TODO-1", title: "Renderer coverage", status: "open" }, "Renderer coverage"],
  ["todo", {}, "…"],
  ["tape_handoff", { name: "task/begin", summary: "start work", purpose: "handoff" }, "task/begin"],
  ["tape_list", { limit: 5, contextLines: 2 }, "limit 5"],
  ["tape_delete", { id: "anchor-1" }, "anchor-1"],
  ["tape_info", {}, "summary"],
  ["tape_search", { kinds: ["entry"], query: "renderer" }, "renderer"],
  ["tape_read", { lastAnchor: true, query: "renderer", limit: 5 }, "@last"],
  ["tape_reset", { archive: true }, "archive"],
  ["ask_user", { question: "Continue?", options: ["yes", "no"] }, "Continue?"],
  ["ask_user", { question: "Continue?", options: ["yes", "no"] }, "2 options"],
  ["tree_sitter_search_symbols", { query: "render", path: "extensions", language: "typescript" }, "render"],
  ["tree_sitter_document_symbols", { file_path: "core.ts" }, "core.ts"],
  ["tree_sitter_symbol_definition", { symbol_name: "renderSubagentToolResult", file_path: "core.ts" }, "renderSubagentToolResult"],
  ["tree_sitter_pattern_search", { pattern: "console.log($ARG)", path: "src", language: "typescript" }, "console.log"],
  ["tree_sitter_codebase_overview", { path: "." }, "."],
  ["tree_sitter_codebase_map", { path: ".", depth: 3 }, "3"],
  ["ast_grep_search", { pattern: "console.log($ARG)", lang: "typescript", paths: ["src"] }, "console.log"],
  ["ast_grep_replace", { pattern: "var $X", rewrite: "let $X", lang: "typescript", paths: ["src"], apply: false }, "var"],
  ["lsp_navigation", { operation: "definition", filePath: "core.ts", line: 12, character: 3 }, "definition"],
  ["lsp_diagnostics", { filePath: "extensions/claude-ui", severity: "all" }, "extensions/claude-ui"],
  ["memory_search", { query: "claude-ui" }, "claude-ui"],
  ["memory_write", { path: "tmp/test.md", description: "mock", content: "body" }, "tmp/test.md"],
  ["memory_list", { directory: "core/project" }, "core/project"],
  ["memory_check", {}, "project"],
  ["memory_sync", { action: "status" }, "status"],
];

test("call renderer matrix is coupled to the real claude-ui allowlist", () => {
  assert.deepEqual([...ui.allowlistedToolNames].sort(), [...expectedAllowlist].sort());
  const toolsWithCases = new Set(callMatrix.map(([toolName]) => toolName));
  assert.deepEqual([...toolsWithCases].sort(), [...expectedAllowlist].sort());
});

test("webToolCallBody covers allowlisted tool call branches and edge arguments", () => {
  for (const [toolName, args, expected] of callMatrix) {
    const body = toolName === "Agent"
      ? ui.agentToolCallBody(args, theme)
      : ui.webToolCallBody(toolName, args, theme);
    assert.match(body, /\S/, `${toolName} should render non-empty body`);
    assert.match(body, new RegExp(escaped(expected)), `${toolName} should include ${expected}; got ${body}`);
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
      { chain: [{ parallel: [{ agent: "scout", count: 2 }, { agent: "reviewer" }] }] },
      theme,
    ),
    /chain 1 step · \[scout×2 \+ reviewer\]/,
  );
  assert.match(
    ui.webToolCallBody(
      "subagent",
      { chain: [{ parallel: Array.from({ length: 14 }, () => ({ agent: "reviewer" })) }, { agent: "validator" }, { agent: "reducer" }] },
      theme,
    ),
    /chain 3 steps · \[reviewer×14\] → validator → reducer/,
  );
  assert.equal(
    ui.webToolCallBody("subagent", { action: "status", id: "abc123" }, theme),
    "status · abc123",
  );
  assert.equal(
    ui.webToolCallBody("subagent", { workflow: "builtin.generate-filter", task: "ideas" }, theme),
    "builtin.generate-filter · run",
  );
});

test("subagent call-renderer original fallback is explicit for partial args", () => {
  assert.equal(ui.shouldUseOriginalToolCallRenderer(undefined), true);
  assert.equal(ui.shouldUseOriginalToolCallRenderer("not-an-object"), true);
  assert.equal(ui.shouldUseOriginalToolCallRenderer({}), false);
  assert.equal(ui.shouldUseOriginalToolCallRenderer({ task: "ideas" }), false);
  assert.equal(ui.shouldUseOriginalToolCallRenderer({ action: "status" }), false);
  assert.equal(ui.webToolCallBody("subagent", {}, theme), "run");
  assert.equal(ui.webToolCallBody("subagent", { task: "ideas" }, theme), "run");
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
        progress: { index: 0, status: "completed", toolCount: 2, tokens: 1200, durationMs: 1500 },
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
        progress: { index: 1, status: "failed", currentTool: "grep", currentToolArgs: "TODO", toolCount: 1 },
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
  assert.match(collapsed, /active \/ attention|attention/);
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
});

test("subagent result renderer covers single, parallel, paused, detached, interrupted, save-error states", () => {
  const result = textResult("Parallel mixed", {
    mode: "parallel",
    totalSteps: 5,
    artifacts: { dir: "/tmp/mixed" },
    results: [
      { agent: "delegate", exitCode: 0, progress: { index: 0, status: "completed" } },
      { agent: "reviewer", progress: { index: 1, status: "paused" }, messages: [{ text: "paused details" }] },
      { agent: "oracle", interrupted: true, progress: { index: 2 }, messages: [{ text: "interrupted details" }] },
      { agent: "scout", detached: true, progress: { index: 3, status: "detached" } },
      { agent: "worker", exitCode: 1, outputSaveError: "disk full", savedOutputPath: "/tmp/mixed/out.md", messages: [{ text: "save failed details" }] },
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

test("generic wrapped results cover per-tool summaries, previews, partial, and error states", () => {
  const cases = [
    ["code_search", "Code Search", textResult("line 1\nline 2", { resultCount: 2 }), /2 lines/],
    ["todo", "Todo", textResult(JSON.stringify({ assigned: [], open: [{ id: "TODO-1", title: "Thing" }], closed: [] }), undefined), /1 open todo/],
    ["memory_list", "Memory List", textResult("Memory files (3):\n- a\n- b"), /3 files/],
    ["subagent", "Subagent", textResult("- scout\n- reviewer"), /2 agents/],
    ["lsp_navigation", "LSP", textResult("definition", { operation: "definition", resultCount: 2 }), /definition · 2 results/],
    ["lsp_diagnostics", "Diagnostics", textResult("clean", { mode: "workspace", totalDiagnostics: 0, filesChecked: 3 }), /workspace · 0 diagnostics · 3 files/],
    ["ast_grep_search", "AST Grep", textResult("matches", { matchCount: 4 }), /4 matchs/],
    ["ast_grep_replace", "AST Replace", textResult("dry", { matchCount: 2, applied: false }), /2 matchs · dry run/],
    ["ast_grep_replace", "AST Replace", textResult("applied", { matchCount: 1, applied: true }), /1 match · applied/],
    ["intercom", "Intercom", textResult("No unresolved inbound asks."), /no pending asks/],
    ["intercom", "Intercom", textResult("**Pending asks:**\n- worker · msg-1 · 5s ago · Need review\n- reviewer · msg-2 · 7s ago · Need reply"), /2 pending asks/],
    ["intercom", "Intercom", textResult("**Intercom Status:**\nConnected: Yes\nSession ID: abc\nActive sessions: 9"), /connected · 9 sessions/],
    ["intercom", "Intercom", textResult("**Current session:**\n• self\n\n**Other sessions:**\n• one\n• two"), /2 other sessions/],
    ["intercom", "Intercom", textResult("Message sent to worker"), /sent to worker/],
    ["intercom", "Intercom", textResult("Reply sent to reviewer"), /reply sent to reviewer/],
    ["intercom", "Intercom", textResult("**Reply from worker:**\nack"), /reply from worker/],
    ["contact_supervisor", "Contact Supervisor", textResult("**Reply from supervisor:**\nUse readability.", { reason: "need_decision", replied: true }), /decision received/],
    ["contact_supervisor", "Contact Supervisor", textResult("Progress update sent.", { reason: "progress_update", sent: true }), /progress sent/],
    ["tape_info", "Tape Info", textResult("📊 Tape Information:\n  Total entries: 312\n  Anchors: 1\n  Last anchor: task/begin\n  Entries since last anchor: 42", { totalEntries: 312, anchorCount: 1, lastAnchorName: "task/begin", entriesSinceLastAnchor: 42 }), /312 entries · 1 anchor · last task\/begin · 42 since anchor/],
    ["tape_search", "Tape Search", textResult("Found 1 entries\n\n[10:00] User: renderer", { count: 1, entryCount: 1, anchorCount: 0 }), /1 entry/],
    ["tape_read", "Tape Read", textResult("Retrieved 2 entries:\n\n[10:00] User: hi\n[10:01] Assistant: ok", { count: 2 }), /2 entries/],
    ["tape_list", "Tape List", textResult("Found 1 anchor(s):\n\n  - task/begin [handoff] (today)", { count: 1 }), /1 anchor/],
    ["tape_handoff", "Tape Handoff", textResult("{}", { name: "task/begin" }), /anchor task\/begin/],
    ["tape_delete", "Tape Delete", textResult("{}", { id: "anchor-1", deleted: true, name: "task/begin" }), /deleted task\/begin/],
    ["tape_reset", "Tape Reset", textResult("Anchor index cleared", { archived: false }), /reset/],
  ];

  for (const toolName of ["tape_read", "tape_search"]) {
    const renderedTapeTranscript = render(
      ui.wrappedToolResult(
        toolName,
        textResult("Retrieved 1 entry:\n\n[10:00] User:\n  - bullet\n    code", { count: 1, entryCount: 1, anchorCount: 0 }),
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
    assert.match(render(component), expected, `${toolName} result summary mismatch`);
    assertRenderedWithinWidth(component);
  }

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
      textResult("**Intercom Status:**\nConnected: Yes\nSession ID: abc\nActive sessions: 9"),
      options({ expanded: true }),
      theme,
      context({}, { toolCallId: "intercom-status" }),
      "Intercom",
    ),
  );
  assert.match(statusIntercom, /Intercom Status:/);
  assert.doesNotMatch(statusIntercom, /\*\*Intercom Status:\*\*/);

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
      { reason: "need_decision", message: "Need scope decision before continuing." },
      { toolCallId: "contact-supervisor-partial-decision" },
    ),
    "Contact Supervisor",
  );
  assert.match(render(partialSupervisorDecision), /Waiting for Decision/);
  assert.equal(ui.webToolTitle("contact_supervisor"), "Contact Supervisor");
  assert.match(
    ui.webToolCallBody(
      "contact_supervisor",
      { reason: "need_decision", message: "Need scope decision before continuing." },
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
      textResult("**Reply from supervisor:**\nUse the smaller change.\n\nThen rerun focused tests.", { reason: "need_decision", replied: true }),
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
      textResult("**Progress update:**\n**UPDATE:** found the root cause.", { reason: "progress_update", sent: true }),
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

test("local built-in tool call/result renderers cover temp-safe branches", () => {
  assert.match(ui.formatReadCall({ path: "/tmp/file.txt", offset: 2, limit: 3 }, theme), /Read/);
  assert.match(ui.formatGrepCall({ pattern: "needle", path: "/tmp" }, theme), /needle/);
  assert.match(ui.formatFindCall({ pattern: "*.ts", path: "/tmp" }, theme), /Find/);
  assert.match(ui.formatLsCall({ path: "/tmp" }, theme), /List/);
  assert.match(ui.formatBashCall({ command: "printf ok" }, theme), /printf ok/);
  assert.match(ui.formatEditCall({ path: "/tmp/file.txt" }, theme), /Update/);
  assert.match(ui.formatWriteCall({ path: "/tmp/file.txt", content: "a\nb" }, theme), /Write/);

  const readComponent = ui.renderReadResult(
    textResult("alpha\nbeta", { path: "/tmp/file.txt", totalLines: 2 }),
    options(),
    theme,
    context({ path: "/tmp/file.txt" }, { toolCallId: "read" }),
  );
  assert.match(render(readComponent), /Read 2 lines/);
  assertRenderedWithinWidth(readComponent);

  const bashComponent = ui.renderBashResult(
    textResult("ok", { exitCode: 0 }),
    options(),
    theme,
    context({ command: "printf ok" }, { toolCallId: "bash" }),
  );
  assert.match(render(bashComponent), /Done/);
  assert.match(render(bashComponent), /1 line/);
  assertRenderedWithinWidth(bashComponent);

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
});

test("temp-dir local mutation simulation remains sandboxed and renderable", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-ui-renderers-"));
  assert.ok(tmp.startsWith(os.tmpdir()), `temp dir escaped system tmp: ${tmp}`);
  const target = path.join(tmp, "dummy.txt");
  assert.ok(target.startsWith(tmp + path.sep), `target escaped temp dir: ${target}`);

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
    assert.match(render(writeComponent), /Wrote 1 line/);
    assert.match(render(writeComponent), /diff unavailable/);
    assertRenderedWithinWidth(writeComponent);

    const editComponent = ui.renderEditResult(
      textResult("Updated", { diff: `--- ${target}\n+++ ${target}\n@@\n-old\n+new` }),
      options(),
      theme,
      context({ path: target }, { toolCallId: "temp-edit" }),
    );
    assert.match(render(editComponent), /Added 1, removed 1/);
    assert.match(render(editComponent), /\+new/);
    assert.match(render(editComponent), /-old/);
    assertRenderedWithinWidth(editComponent);
  } finally {
    assert.ok(tmp.startsWith(os.tmpdir()), `refusing cleanup outside tmp: ${tmp}`);
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
  assert.match(normalRendered, /\/tmp\/project/);
  assert.match(normalRendered, /normal intercom body/);
  assertRenderedWithinWidth(normal);

  const subagentResult = ui.renderIntercomMessage(
    {
      details: {
        from: { name: "subagent-result", cwd: "/tmp/project" },
        bodyText: "Run: abc123\nMode: chain\nRoute: builtin.quality-gate\nStatus: completed\nChildren: 2 completed\n\n1. scout — completed\nSummary:\nAll good\n",
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
  assert.match(rendered, /To reply: \/reply abc123/);
  assertRenderedWithinWidth(subagentResult);
});

test("subagent control notice renderer covers orchestrator straggler notices and width", () => {
  const component = ui.renderSubagentControlNotice(
    {
      content: "Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.\nRunning: researcher 2/4, elapsed 9m10s, last activity 1m2s ago, 84 tools, 407320 tokens\nThreshold: slower than 9m8s (6m5s peer baseline).\nNo automatic action taken.\nActions: wait, inspect status/activity, nudge if available, interrupt, or detach/background when available.",
      details: {
        key: "parallel-straggler:run-1",
        runId: "run-1",
        source: "foreground",
        noticeText: "Parallel barrier blocked by straggler: top-level parallel\n3/4 complete; 1 still running.",
      },
    },
    { expanded: false },
    theme,
  );

  const rendered = render(component, 80);
  assert.match(rendered, /Subagent notice/);
  assert.match(rendered, /Parallel barrier blocked by straggler: top-level parallel/);
  assert.match(rendered, /3\/4 complete; 1 still running/);
  assert.doesNotMatch(rendered, /subagent_control_notice/);
  assertRenderedWithinWidth(component);
});
