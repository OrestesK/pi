import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { executeAsyncChain } = await loadTs("../../src/runs/background/async-execution.ts");
const { getAsyncConfigPath } = await loadTs("../../src/shared/types.ts");

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function makeGitRepo() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-async-worktree-base-repo-"));
	execFileSync("git", ["init", "-q"], { cwd: root });
	fs.writeFileSync(path.join(root, "input.txt"), "input");
	return root;
}

function makeFakePi() {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-async-worktree-base-fake-pi-"));
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

test("async worktree chain instructions honor configured worktree base dir", () => {
	const repo = makeGitRepo();
	const fakePiDir = makeFakePi();
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const worktreeBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-async-worktree-base-"));
	const id = `async-worktree-base-${process.pid}-${Date.now()}`;
	try {
		const result = executeAsyncChain(id, {
			chain: [{ parallel: [{ agent: "worker", task: "Inspect input", reads: ["input.txt"] }], worktree: true }],
			resultMode: "parallel",
			agents: [worker],
			ctx: {
				pi: { events: { emit() {}, on() { return () => {}; } } },
				cwd: repo,
				currentSessionId: "async-worktree-base-test",
			},
			cwd: repo,
			artifactConfig: { enabled: false, includeInput: false, includeOutput: false, includeJsonl: false, includeMetadata: false, cleanupDays: 1 },
			shareEnabled: false,
			sessionRoot: path.join(repo, ".sessions"),
			progressReportMode: "file",
			maxSubagentDepth: 1,
			worktreeBaseDir,
		});
		assert.equal(result.isError, undefined, result.content?.[0]?.text);

		const cfg = JSON.parse(fs.readFileSync(getAsyncConfigPath(id), "utf-8"));
		const task = cfg.steps[0].parallel[0].task;
		const expectedReadPath = path.join(worktreeBaseDir, `pi-worktree-${id}-s0-0`, "input.txt");
		const defaultReadPath = path.join(os.tmpdir(), `pi-worktree-${id}-s0-0`, "input.txt");
		assert.match(task, new RegExp(escapeRegExp(expectedReadPath)));
		assert.doesNotMatch(task, new RegExp(escapeRegExp(defaultReadPath)));
	} finally {
		process.env.PATH = oldPath;
	}
});
