import test from "node:test";
import assert from "node:assert/strict";

import type { Message } from "@earendil-works/pi-ai";

import {
	evaluateCompletionMutationGuard,
	expectsImplementationMutation,
	hasMutationToolCall,
	runMonitorCompletionError,
} from "../../src/runs/shared/completion-guard.ts";

function assistantToolCall(name: string, args: Record<string, unknown> = {}): Message {
	return {
		role: "assistant",
		content: [{ type: "toolCall", name, arguments: args }],
	} as unknown as Message;
}

function assistantText(text: string): Message {
	return {
		role: "assistant",
		content: [{ type: "text", text }],
	} as unknown as Message;
}

test("implementation task with no mutation triggers the completion guard", () => {
	const result = evaluateCompletionMutationGuard({
		agent: "worker",
		task: "Implement the approved fix",
		messages: [assistantText("Plan: update the files...")],
	});

	assert.deepEqual(result, {
		expectedMutation: true,
		attemptedMutation: false,
		triggered: true,
	});
});

test("declared read-only builtin tools suppress implementation-word false positives", () => {
	const result = evaluateCompletionMutationGuard({
		agent: "architect",
		task: "Produce a proposal that implements the approved fix",
		messages: [assistantText("Proposal only")],
		tools: ["read", "grep", "find", "ls"],
	});

	assert.deepEqual(result, {
		expectedMutation: false,
		attemptedMutation: false,
		triggered: false,
	});
});

test("read-only issue drafting tasks do not trigger on suggested fix wording", () => {
	const task = "Draft GitHub issue for pi-subagents bug from current conversation. Include title, environment/context, reproduction steps, actual/expected, logs excerpt, suspected cause, suggested fix. Terse but complete. No tools needed.";
	const result = evaluateCompletionMutationGuard({
		agent: "delegate",
		task,
		messages: [assistantText("Title: completionGuard false positive\n\nSuggested fix: model read-only intent.")],
		tools: ["read", "grep", "find", "ls", "bash", "edit", "write", "contact_supervisor"],
	});

	assert.deepEqual(result, {
		expectedMutation: false,
		attemptedMutation: false,
		triggered: false,
	});
	assert.equal(expectsImplementationMutation("worker", task), false);
	assert.equal(
		expectsImplementationMutation("worker", "Draft GitHub issue for a bug. Include suspected cause and suggested fix."),
		false,
	);
});

test("omitted, empty, bash, unknown, write, and MCP tool capabilities stay conservative", () => {
	const base = {
		agent: "architect",
		task: "Implement the approved source fix",
		messages: [assistantText("Validation only")],
	};

	assert.equal(evaluateCompletionMutationGuard(base).triggered, true);
	assert.equal(evaluateCompletionMutationGuard({ ...base, tools: [] }).triggered, true);
	assert.equal(evaluateCompletionMutationGuard({ ...base, tools: ["read", "bash", "ls"] }).triggered, true);
	assert.equal(evaluateCompletionMutationGuard({ ...base, tools: ["read", "custom_lookup"] }).triggered, true);
	assert.equal(evaluateCompletionMutationGuard({ ...base, tools: ["read", "write"] }).triggered, true);
	assert.equal(evaluateCompletionMutationGuard({ ...base, tools: ["read", "grep"], mcpDirectTools: ["github/search"] }).triggered, true);
});

test("worker with mutating-capable tools still triggers when no mutation is observed", () => {
	const result = evaluateCompletionMutationGuard({
		agent: "worker",
		task: "Fix the test implementation",
		messages: [assistantText("I will edit it next")],
		tools: ["read", "edit"],
	});

	assert.deepEqual(result, {
		expectedMutation: true,
		attemptedMutation: false,
		triggered: true,
	});
});

test("review-only, research, and framework output instructions do not expect mutation", () => {
	assert.equal(expectsImplementationMutation("worker", "Review only: return findings, do not edit"), false);
	assert.equal(expectsImplementationMutation("worker", "Do not edit files. Tell me how to fix the bug."), false);
	assert.equal(expectsImplementationMutation("worker", "Review the diff and suggest fixes only. Do not edit files."), false);
	assert.equal(expectsImplementationMutation("worker", "Implement this. Do not edit files outside this repo. Do not edit files."), false);
	assert.equal(expectsImplementationMutation("worker", "Investigate why this failed"), false);
	assert.equal(expectsImplementationMutation("researcher", "Research the API behavior"), false);
	assert.equal(expectsImplementationMutation("researcher", "Research this and patch the bug"), false);
	assert.equal(expectsImplementationMutation("reviewer", "Review this and fix any real issues"), false);
	assert.equal(expectsImplementationMutation("reviewer", "Review this and fix any real issues; regardless of findings, apply changes directly"), true);
	assert.equal(expectsImplementationMutation("worker", "[Write to: /tmp/result.md]\n\nSummarize findings"), false);
	assert.equal(expectsImplementationMutation("worker", "Write report"), false);
	assert.equal(expectsImplementationMutation("worker", "Create a report"), false);
	assert.equal(expectsImplementationMutation("worker", "Create a summary"), false);
	assert.equal(expectsImplementationMutation("worker", "Add a report"), false);
	assert.equal(expectsImplementationMutation("worker", "Update a summary"), false);
	assert.equal(expectsImplementationMutation("worker", "Write to {chain_dir}"), false);
	assert.equal(
		expectsImplementationMutation("worker", "Do async work\nUpdate progress at: /tmp/progress.md\n**Output:**\nReturn your findings normally in your final response.\nThe runtime will save that response to exactly this path: /tmp/out.md\nThis path is authoritative for this run.\nIgnore any other output filename or output path mentioned elsewhere."),
		false,
	);
});

test("worker implementation verbs win over investigative wording", () => {
	assert.equal(expectsImplementationMutation("worker", "Investigate why the worker did not edit files and fix it"), true);
	assert.equal(expectsImplementationMutation("worker", "Research the current code path and patch the bug"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix the bug where no edits were made"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix lint"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix the build"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix TypeScript errors"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix CI"), true);
	assert.equal(expectsImplementationMutation("worker", "Fix the failing test"), true);
	assert.equal(expectsImplementationMutation("worker", "Patch the cold start test"), true);
	assert.equal(expectsImplementationMutation("worker", "Implement the fix and return findings."), true);
});

test("non-worker implementation tasks still expect mutation", () => {
	assert.equal(expectsImplementationMutation("delegate", "Fix the bug where no edits were made"), true);
	assert.equal(expectsImplementationMutation("delegate", "Apply the suggested fix to src/runs/shared/completion-guard.ts"), true);
	assert.equal(expectsImplementationMutation("worker", "Draft a GitHub issue, then implement the fix"), true);
});

test("worker edit intent covers common docs, config, and source tasks", () => {
	assert.equal(expectsImplementationMutation("worker", "Update README to mention the native tool"), true);
	assert.equal(expectsImplementationMutation("worker", "Remove share functionality and all Vercel references"), true);
	assert.equal(expectsImplementationMutation("worker", "Replace the registered command with a render tool"), true);
	assert.equal(expectsImplementationMutation("worker", "Create completion-guard.ts"), true);
	assert.equal(expectsImplementationMutation("worker", "Add tests for the completion guard"), true);
	assert.equal(expectsImplementationMutation("worker", "Implement the approved fixes. Do not edit files outside this repo."), true);
	assert.equal(expectsImplementationMutation("worker", "Implement the fix. Do not edit unrelated files."), true);
});

test("edit and write tool calls count as mutation attempts", () => {
	assert.equal(hasMutationToolCall([assistantToolCall("edit", { path: "a.ts" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("write", { path: "a.ts" })]), true);
});

test("obvious mutating bash commands count as mutation attempts", () => {
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "mkdir -p src && cat > src/file.ts <<'EOF'\nhi\nEOF" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "cat <<'EOF' > src/file.ts\nhi\nEOF" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "python3 -c \"from pathlib import Path; Path('x').write_text('hi')\"" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "node script.js > generated.txt" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "echo 'a > b'" })]), false);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "node -e \"console.log(a > b)\"" })]), false);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "python3 <<'PY'\nprint('inspect only')\nPY" })]), false);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "echo 'rm file'" })]), false);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "printf \"mkdir x\"" })]), false);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "git apply patch.diff" })]), true);
	assert.equal(hasMutationToolCall([assistantToolCall("bash", { command: "patch -p0 < fix.patch" })]), true);
});

test("implementation task with mutation attempts does not trigger", () => {
	const result = evaluateCompletionMutationGuard({
		agent: "worker",
		task: "Fix the failing test",
		messages: [assistantToolCall("edit", { path: "test.ts" })],
	});

	assert.equal(result.triggered, false);
});

test("run-monitor completion rejects nonterminal final status", () => {
	const output = [
		"# Run Monitor Status",
		"- state: running",
		"- next_parent_action: continue_waiting",
	].join("\n");

	assert.match(runMonitorCompletionError("run-monitor", output) ?? "", /nonterminal state 'running'/i);
	assert.equal(runMonitorCompletionError("worker", output), undefined);
});

test("run-monitor completion recognizes bold status labels", () => {
	const output = [
		"# Run Monitor Status",
		"- **state:** running",
		"- **next_parent_action:** continue_waiting",
	].join("\n");

	assert.match(runMonitorCompletionError("run-monitor", output) ?? "", /nonterminal state 'running'/i);
});

test("run-monitor completion fails closed for blocked, unknown, or missing final state", () => {
	assert.match(runMonitorCompletionError("run-monitor", "- state: blocked\n- next_parent_action: inspect_status") ?? "", /nonterminal state 'blocked'/i);
	assert.match(runMonitorCompletionError("run-monitor", "- state: unknown\n- next_parent_action: inspect_status") ?? "", /nonterminal state 'unknown'/i);
	assert.match(runMonitorCompletionError("run-monitor", "Monitor remains active; continue waiting.") ?? "", /without the required final state/i);
});

test("run-monitor completion rejects continue-waiting after a terminal state", () => {
	const output = "- state: completed\n- next_parent_action: continue_waiting";
	assert.match(runMonitorCompletionError("run-monitor", output) ?? "", /nonterminal next_parent_action 'continue_waiting'/i);
});

test("run-monitor completion accepts every documented terminal final status", () => {
	for (const state of ["completed", "failed", "missing", "stuck", "timed_out"]) {
		const output = [
			"# Run Monitor Status",
			`- **Final state:** ${state}`,
			"- next_parent_action: no_action",
		].join("\n");

		assert.equal(runMonitorCompletionError("run-monitor", output), undefined, state);
	}
});
