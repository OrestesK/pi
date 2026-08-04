import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const {
  checkModelScope,
  matchesScopePattern,
  parseModelScopeConfig,
} = await loadTs("../../src/runs/shared/model-scope.ts");

test("model scope patterns match provider/id case-insensitively and ignore thinking suffix", () => {
  assert.equal(matchesScopePattern("OpenAI/gpt-4.1:high", "openai/*"), true);
  assert.equal(matchesScopePattern("anthropic/claude-sonnet-4", "openai/*"), false);
});

test("model scope reports explicit out-of-scope models as errors", () => {
  assert.deepEqual(
    checkModelScope("anthropic/claude-sonnet-4", { enforce: true, allow: ["openai/*"] }, "explicit"),
    {
      model: "anthropic/claude-sonnet-4",
      severity: "error",
      allowedPatterns: ["openai/*"],
      message: "Model 'anthropic/claude-sonnet-4' is outside the configured subagent model scope. Allowed patterns: openai/*.",
    },
  );
});

test("model scope reports inherited out-of-scope models as warnings", () => {
  assert.equal(
    checkModelScope("anthropic/claude-sonnet-4", { enforce: true, allow: ["openai/*"] }, "inherited")?.severity,
    "warn",
  );
});

test("model scope config rejects enforce without allow list", () => {
  assert.throws(
    () => parseModelScopeConfig({ enforce: true }, { filePath: "settings.json" }),
    /modelScope\.enforce without a non-empty 'allow' list/,
  );
});
