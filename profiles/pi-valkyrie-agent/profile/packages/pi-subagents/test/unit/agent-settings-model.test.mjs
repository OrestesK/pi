import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { discoverAgents } = await loadTs("../../src/agents/agents.ts");

function makeProject(settings) {
  const root = mkdtempSync(join(tmpdir(), "pi-subagents-agent-settings-"));
  mkdirSync(join(root, ".pi"));
  writeFileSync(join(root, ".pi", "settings.json"), JSON.stringify(settings));
  return root;
}

test("project subagent settings apply defaultModel to discovered agents", () => {
  const cwd = makeProject({ subagents: { defaultModel: "openai/gpt-4.1" } });

  const result = discoverAgents(cwd, "project");
  const reviewer = result.agents.find((agent) => agent.name === "reviewer");

  assert.equal(reviewer?.model, "openai/gpt-4.1");
});

test("project subagent settings expose modelScope for execution wiring", () => {
  const cwd = makeProject({ subagents: { modelScope: { enforce: true, allow: ["openai/*"] } } });

  assert.deepEqual(discoverAgents(cwd, "both").modelScope, { enforce: true, allow: ["openai/*"] });
});
