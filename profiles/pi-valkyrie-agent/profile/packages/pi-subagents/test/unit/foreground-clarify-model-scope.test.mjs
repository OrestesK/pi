import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { createSubagentExecutor } = await loadTs("../../src/runs/foreground/subagent-executor.ts");

function makeState() {
	return {
		baseCwd: process.cwd(),
		currentSessionId: null,
		asyncJobs: new Map(),
		foregroundRuns: new Map(),
		foregroundControls: new Map(),
		lastForegroundControlId: null,
		pendingForegroundControlNotices: new Map(),
		cleanupTimers: new Map(),
		lastUiContext: null,
		poller: null,
		completionSeen: new Map(),
		watcher: null,
		watcherRestartTimer: null,
		watcherScanTimer: null,
		resultFileCoalescer: { schedule: () => false, clear() {} },
	};
}

function makeFakePi() {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-clarify-model-scope-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\nconsole.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }));\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

const worker = {
	name: "worker",
	description: "Worker",
	source: "test",
	filePath: "worker.md",
	systemPrompt: "Worker.",
	systemPromptMode: "replace",
	inheritProjectContext: false,
	inheritSkills: false,
	tools: ["read", "write"],
};

const availableModels = [
	{ provider: "openai", id: "gpt-4.1", fullId: "openai/gpt-4.1" },
	{ provider: "anthropic", id: "claude-sonnet-4", fullId: "anthropic/claude-sonnet-4" },
];

test("foreground single clarify model override enforces explicit model scope", async () => {
	const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-clarify-model-scope-cwd-"));
	const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-clarify-model-scope-session-"));
	const fakePiDir = makeFakePi();
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const executor = createSubagentExecutor({
		pi: { getSessionName: () => "clarify-model-scope-test", events: { emit() {}, on() { return () => {}; } } },
		state: makeState(),
		config: {},
		asyncByDefault: false,
		tempArtifactsDir: path.join(sessionBase, "artifacts"),
		getSubagentSessionRoot: () => sessionBase,
		expandTilde: (value) => value,
		discoverAgents: () => ({
			agents: [worker],
			modelScope: { enforce: true, allow: ["openai/*"] },
		}),
	});
	try {
		const result = await executor.execute("clarify-model-scope", {
			agent: "worker",
			task: "Do work",
			clarify: true,
			async: false,
			artifacts: false,
		}, new AbortController().signal, undefined, {
			cwd,
			hasUI: true,
			ui: {
				custom: async () => ({
					confirmed: true,
					templates: ["Do work"],
					behaviorOverrides: [{ model: "anthropic/claude-sonnet-4" }],
					runInBackground: false,
				}),
			},
			model: { provider: "openai", id: "gpt-4.1" },
			modelRegistry: { getAvailable: () => availableModels },
			sessionManager: { getSessionFile: () => null, getSessionId: () => "clarify-model-scope-session" },
		});

		assert.equal(result.isError, true);
		assert.match(result.content[0].text, /outside the configured subagent model scope/);
	} finally {
		process.env.PATH = oldPath;
	}
});
