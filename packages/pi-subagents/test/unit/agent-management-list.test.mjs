import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { handleList } = await loadTs("../../src/agents/agent-management.ts");

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function listText() {
	const result = handleList({ action: "list", agentScope: "both" }, { cwd: packageRoot, modelRegistry: {} });
	assert.equal(result.isError, false);
	assert.equal(result.content[0]?.type, "text");
	return result.content[0].text;
}

test("list output is concise and routing-oriented", () => {
	const text = listText();

	assert.match(text, /Agents \(effective; default context: fresh\):/);
	assert.match(text, /- scout — Use for fast read-only codebase recon/);
	assert.match(text, /- reviewer — Use for read-only review/);
	assert.match(text, /- worker \(fork\) — Use for straightforward, bounded, approved implementation/);
	assert.match(text, /- general-purpose — Use when this custom agent fits:/);
	assert.doesNotMatch(text, /^- .*\((?:builtin|user|project)(?:, context: [^)]+)?\):/m);
	assert.equal((text.match(/^- reviewer\b/gm) ?? []).length, 1);
	assert.equal((text.match(/^- scout\b/gm) ?? []).length, 1);
	assert.equal((text.match(/^- worker\b/gm) ?? []).length, 1);

	assert.match(text, /Context:/);
	assert.match(text, /fresh = independent child session/);
	assert.match(text, /not the parent conversation history/);
	assert.match(text, /fork = inherits the parent conversation context/);

	assert.match(text, /Tool access:/);
	assert.match(text, /Tools are agent-specific, not inherited from the parent/);
	assert.match(text, /Protected advisory roles strip MCP, mutation, and extension tools/);
	assert.match(text, /write-capable agent for writes/);
	assert.match(text, /configured non-advisory agent for MCP\/custom tools/);
	assert.doesNotMatch(text, /Retool/);

	assert.match(text, /Builtin workflows \(foreground\/fresh\):/);
	assert.match(text, /builtin\.quality-gate/);
	assert.match(text, /builtin\.research-decision/);
	assert.match(text, /builtin\.generate-filter/);
	assert.match(text, /builtin\.live-steering-team/);
	assert.match(text, /Approved complex implementation/);
	assert.match(text, /live reviewer steering during execution/);

	assert.match(text, /Route selection:/);
	assert.match(text, /Recon\/planning: scout or context-builder -> planner/);
	assert.match(text, /Straightforward approved implementation: worker, then reviewer\/quality-gate/);
	assert.match(text, /Approved complex\/risky implementation needing mid-course feedback: builtin\.live-steering-team/);

	assert.match(text, /Execution:/);
	assert.match(text, /SINGLE/);
	assert.match(text, /CHAIN/);
	assert.match(text, /PARALLEL/);
	assert.match(text, /WORKFLOW/);
	assert.match(text, /Details\/provenance\/tools/);
	assert.match(text, /Saved chains \(\.chain\.md\):/);
	assert.match(text, /none found in ~\/\.pi\/agent\/chains or \.pi\/chains; builtin workflows are listed above/);
	assert.doesNotMatch(text, /teamRun/);
	assert.doesNotMatch(text, /team-witness/);
});
