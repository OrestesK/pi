import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
  FULL_SUBAGENT_TOOL_DESCRIPTION,
  SUBAGENT_SAFETY_GUIDANCE,
  buildSubagentToolDescription,
  resolveToolDescriptionMode,
} = await loadTs("../../src/extension/tool-description.ts");

test("tool description defaults to full mode", () => {
  assert.equal(buildSubagentToolDescription({}), FULL_SUBAGENT_TOOL_DESCRIPTION);
});

test("tool description compact mode is shorter and keeps safety guidance", () => {
  const compact = buildSubagentToolDescription({ toolDescriptionMode: "compact" });

  assert.ok(compact.length < FULL_SUBAGENT_TOOL_DESCRIPTION.length);
  assert.match(compact, /Delegate to subagents/);
  assert.match(compact, /SAFETY-CRITICAL SUBAGENT GUIDANCE/);
});

test("tool description custom mode renders project template and appends safety guidance", () => {
  const cwd = mkdtempSync(join(tmpdir(), "pi-subagents-tool-description-"));
  mkdirSync(join(cwd, ".pi"));
  writeFileSync(
    join(cwd, ".pi", "subagent-tool-description.md"),
    "Custom {{compact}}\nProject={{projectConfigDir}}",
  );

  const description = buildSubagentToolDescription({ toolDescriptionMode: "custom" }, { cwd });

  assert.match(description, /^Custom Delegate to subagents/m);
  assert.match(description, new RegExp(`Project=${cwd.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/\\.pi`));
  assert.match(description, /SAFETY-CRITICAL SUBAGENT GUIDANCE/);
});

test("invalid tool description mode warns and falls back to full", () => {
  const warnings = [];
  assert.equal(resolveToolDescriptionMode({ toolDescriptionMode: "loud" }, { warn: (message) => warnings.push(message) }), "full");
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Ignoring invalid toolDescriptionMode/);
});
