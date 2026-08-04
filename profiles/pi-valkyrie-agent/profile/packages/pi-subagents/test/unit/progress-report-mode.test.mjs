import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	buildChainInstructions,
	progressFileDirForRun,
	resolveProgressReportMode,
	resolveStepBehavior,
} = await loadTs("../../src/shared/settings.ts");
const { createSubagentExecutor } = await loadTs("../../src/runs/foreground/subagent-executor.ts");
const { executeAsyncChain } = await loadTs("../../src/runs/background/async-execution.ts");

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
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-mode-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\nconsole.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }));\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

function makeArgRecordingFakePi(recordPath) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-mode-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\nconst fs = require("node:fs");\nfs.writeFileSync(${JSON.stringify(recordPath)}, JSON.stringify(process.argv));\nconsole.log(JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "done" }], stopReason: "stop" } }));\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

const baseBehavior = {
	output: false,
	outputMode: "inline",
	reads: false,
	progress: true,
	skills: [],
};

test("progress report mode defaults to file and accepts supervisor", () => {
	assert.equal(resolveProgressReportMode(undefined), "file");
	assert.equal(resolveProgressReportMode({ reportMode: "file" }), "file");
	assert.equal(resolveProgressReportMode({ reportMode: "supervisor" }), "supervisor");
	assert.equal(resolveProgressReportMode({ reportMode: "bogus" }), "file");
});

test("supervisor progress mode injects contact_supervisor progress updates without progress.md", () => {
	const { suffix } = buildChainInstructions(
		baseBehavior,
		"/repo-root",
		true,
		undefined,
		"supervisor",
	);
	assert.match(suffix, /contact_supervisor/);
	assert.match(suffix, /progress_update/);
	assert.doesNotMatch(suffix, /progress\.md/);
	assert.doesNotMatch(suffix, /Create and maintain progress at/);
});

test("supervisor progress mode suppresses default progress.md reads but preserves explicit reads", () => {
	const agentConfig = {
		name: "reviewer",
		description: "Reviewer",
		source: "test",
		filePath: "reviewer.md",
		systemPrompt: "Reviewer.",
		systemPromptMode: "replace",
		inheritProjectContext: false,
		inheritSkills: false,
		defaultReads: ["plan.md", "progress.md"],
	};
	const defaultBehavior = resolveStepBehavior(agentConfig, {});
	const defaultInstructions = buildChainInstructions(
		defaultBehavior,
		"/repo-root",
		false,
		undefined,
		"supervisor",
	);
	assert.match(defaultInstructions.prefix, /plan\.md/);
	assert.doesNotMatch(defaultInstructions.prefix, /progress\.md/);

	const explicitBehavior = resolveStepBehavior(agentConfig, { reads: ["docs/progress.md"] });
	const explicitInstructions = buildChainInstructions(
		explicitBehavior,
		"/repo-root",
		false,
		undefined,
		"supervisor",
	);
	assert.match(explicitInstructions.prefix, /docs\/progress\.md/);
});

test("file progress mode uses run-owned progress directory", () => {
	const sessionRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-session-"));
	const progressDir = progressFileDirForRun(sessionRoot);
	assert.equal(progressDir, path.join(sessionRoot, "progress"));
	const { suffix } = buildChainInstructions(
		baseBehavior,
		progressDir,
		true,
		undefined,
		"file",
	);
	assert.match(suffix, new RegExp(`${progressDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/progress\\.md`));
});

test("foreground parallel supervisor progress reports through contact_supervisor and creates no progress file", async () => {
	const targetCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-target-"));
	const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-root-"));
	const recordPath = path.join(sessionBase, "argv.json");
	const fakePiDir = makeArgRecordingFakePi(recordPath);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const state = makeState();
	const executor = createSubagentExecutor({
		pi: { getSessionName: () => "progress-test", events: { emit() {}, on() { return () => {}; } } },
		state,
		config: { progress: { reportMode: "supervisor" } },
		asyncByDefault: false,
		tempArtifactsDir: path.join(sessionBase, "artifacts"),
		getSubagentSessionRoot: () => sessionBase,
		expandTilde: (value) => value,
		discoverAgents: () => ({
			agents: [
				{
					name: "worker",
					description: "Worker",
					source: "test",
					filePath: "worker.md",
					systemPrompt: "Worker.",
					systemPromptMode: "replace",
					inheritProjectContext: false,
					inheritSkills: false,
					tools: ["read", "write", "contact_supervisor"],
				},
			],
		}),
	});
	try {
		const result = await executor.execute("progress-supervisor-parallel", {
			tasks: [{ agent: "worker", task: "Do work", progress: true }],
			cwd: targetCwd,
			async: false,
			artifacts: true,
		}, new AbortController().signal, undefined, {
			cwd: targetCwd,
			model: undefined,
			modelRegistry: { getAvailable: () => [] },
			sessionManager: { getSessionFile: () => null, getSessionId: () => "progress-session" },
		});
		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		const argvText = JSON.parse(fs.readFileSync(recordPath, "utf-8")).join("\n");
		assert.match(argvText, /contact_supervisor/);
		assert.match(argvText, /progress_update/);
		assert.doesNotMatch(argvText, /progress\.md/);
		assert.equal(fs.existsSync(path.join(targetCwd, "progress.md")), false);
		assert.equal(fs.existsSync(path.join(sessionBase, "progress", "progress.md")), false);
	} finally {
		process.env.PATH = oldPath;
	}
});

test("async worktree parallel file progress precreates the run-owned progress file", async () => {
	const fakePiDir = makeFakePi();
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const asyncRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-async-"));
	const sessionRoot = path.join(asyncRoot, "sessions");
	try {
		const result = executeAsyncChain("progress-async-worktree", {
			chain: [{ parallel: [{ agent: "worker", task: "Do work", progress: true }], worktree: true }],
			resultMode: "parallel",
			agents: [
				{
					name: "worker",
					description: "Worker",
					source: "test",
					filePath: "worker.md",
					systemPrompt: "Worker.",
					systemPromptMode: "replace",
					inheritProjectContext: false,
					inheritSkills: false,
					tools: ["read", "write", "contact_supervisor"],
				},
			],
			ctx: {
				pi: { events: { emit() {}, on() { return () => {}; } } },
				cwd: fakePiDir,
				currentSessionId: "async-progress-test",
			},
			cwd: fakePiDir,
			artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
			shareEnabled: false,
			sessionRoot,
			progressReportMode: "file",
			maxSubagentDepth: 1,
		});
		assert.equal(result.isError, undefined, result.content?.[0]?.text);
		assert.equal(typeof result.details.asyncDir, "string");
		assert.equal(fs.existsSync(path.join(result.details.asyncDir, "progress", "progress.md")), true);
	} finally {
		process.env.PATH = oldPath;
	}
});

test("foreground parallel file progress is created under session root, not target cwd", async () => {
	const fakePiDir = makeFakePi();
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const targetCwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-target-"));
	const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-progress-root-"));
	const state = makeState();
	const executor = createSubagentExecutor({
		pi: { getSessionName: () => "progress-test", events: { emit() {}, on() { return () => {}; } } },
		state,
		config: { progress: { reportMode: "file" } },
		asyncByDefault: false,
		tempArtifactsDir: path.join(sessionBase, "artifacts"),
		getSubagentSessionRoot: () => sessionBase,
		expandTilde: (value) => value,
		discoverAgents: () => ({
			agents: [
				{
					name: "worker",
					description: "Worker",
					source: "test",
					filePath: "worker.md",
					systemPrompt: "Worker.",
					systemPromptMode: "replace",
					inheritProjectContext: false,
					inheritSkills: false,
					tools: ["read", "write", "contact_supervisor"],
				},
			],
		}),
	});
	try {
		const result = await executor.execute("progress-parallel", {
			tasks: [{ agent: "worker", task: "Do work", progress: true }],
			cwd: targetCwd,
			async: false,
			artifacts: true,
		}, new AbortController().signal, undefined, {
			cwd: targetCwd,
			model: undefined,
			modelRegistry: { getAvailable: () => [] },
			sessionManager: { getSessionFile: () => null, getSessionId: () => "progress-session" },
		});
		assert.notEqual(result.isError, true, result.content?.[0]?.text);
		assert.equal(fs.existsSync(path.join(targetCwd, "progress.md")), false);
		const runDirs = fs.readdirSync(sessionBase).filter((entry) => fs.statSync(path.join(sessionBase, entry)).isDirectory() && entry !== "artifacts");
		assert.equal(runDirs.length, 1);
		assert.equal(fs.existsSync(path.join(sessionBase, runDirs[0], "progress", "progress.md")), true);
	} finally {
		process.env.PATH = oldPath;
	}
});
