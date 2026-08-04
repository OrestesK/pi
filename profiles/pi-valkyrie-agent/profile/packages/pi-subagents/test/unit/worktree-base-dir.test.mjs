import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { resolveExpectedWorktreeAgentCwd } = await loadTs("../../src/runs/shared/worktree.ts");

function makeGitRepo() {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-worktree-base-"));
	execFileSync("git", ["init", "-q"], { cwd: root });
	return root;
}

test("expected worktree cwd honors explicit base dir and repo-relative cwd", () => {
	const repo = makeGitRepo();
	const subdir = path.join(repo, "nested", "pkg");
	fs.mkdirSync(subdir, { recursive: true });
	const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-worktree-root-"));

	assert.equal(
		resolveExpectedWorktreeAgentCwd(subdir, "run-123", 2, baseDir),
		path.join(baseDir, "pi-worktree-run-123-2", "nested", "pkg"),
	);
});

test("expected worktree cwd honors PI_SUBAGENTS_WORKTREE_DIR", () => {
	const repo = makeGitRepo();
	const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-worktree-env-"));
	const previous = process.env.PI_SUBAGENTS_WORKTREE_DIR;
	process.env.PI_SUBAGENTS_WORKTREE_DIR = baseDir;
	try {
		assert.equal(
			resolveExpectedWorktreeAgentCwd(repo, "run-env", 0),
			path.join(baseDir, "pi-worktree-run-env-0"),
		);
	} finally {
		if (previous === undefined) delete process.env.PI_SUBAGENTS_WORKTREE_DIR;
		else process.env.PI_SUBAGENTS_WORKTREE_DIR = previous;
	}
});
