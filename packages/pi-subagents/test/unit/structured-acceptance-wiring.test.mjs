import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Compile } from "typebox/compile";

import { loadTs } from "../support/load-ts.mjs";

const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");

function readSrc(relativePath) {
  return readFileSync(new URL(`../../src/${relativePath}`, import.meta.url), "utf8");
}

test("foreground single and parallel propagate outputSchema and acceptance into runSync", () => {
  const source = readSrc("runs/foreground/subagent-executor.ts");

  assert.match(source, /\.\.\.\(params\.outputSchema \? \{ outputSchema: params\.outputSchema \} : \{\}\),/);
  assert.match(source, /\.\.\.\(params\.acceptance \? \{ acceptance: params\.acceptance \} : \{\}\),/);
  assert.match(source, /acceptanceContext: \{ mode: "single" \}/);
  assert.match(source, /\.\.\.\(behavior\?\.outputSchema \? \{ outputSchema: behavior\.outputSchema \} : \{\}\),/);
  assert.match(source, /\.\.\.\(behavior\?\.acceptance \? \{ acceptance: behavior\.acceptance \} : \{\}\),/);
  assert.match(source, /acceptanceContext: \{ mode: "parallel" \}/);
});

test("foreground parallel wires live steering team metadata into runSync", () => {
  const source = readSrc("runs/foreground/subagent-executor.ts");

  assert.match(source, /liveSteeringTeamRunDir/);
  assert.match(source, /liveSteeringRole/);
  assert.match(source, /team: input\.liveSteeringTeamRunDir && task\.liveSteeringRole/);
});

test("foreground parallel enforces live steering protocol through shared helpers", () => {
  const source = readSrc("runs/foreground/subagent-executor.ts");

  assert.match(source, /listTeamDecisions\(liveSteeringTeamRunDir\)/);
  assert.match(source, /findLiveSteeringReviewerPulseFailures\(\{/);
  assert.match(source, /listTeamMessages\(liveSteeringTeamRunDir, "worker-0"\)/);
  assert.match(source, /findLiveSteeringCompletionFailure\(messages, workerCompletedAtMs\)/);
  assert.match(source, /liveSteeringStartedAtByResult\.set\(result, liveSteeringStartedAtMs\)/);
  assert.match(source, /liveSteeringCompletedAtByResult\.set\(result, Date\.now\(\)\)/);
});

test("foreground chain propagates per-step outputSchema and acceptance", () => {
  const source = readSrc("runs/foreground/chain-execution.ts");

  assert.match(source, /outputSchema: seqStep\.outputSchema/);
  assert.match(source, /acceptance: seqStep\.acceptance/);
  assert.match(source, /\.\.\.\(behavior\.outputSchema \? \{ outputSchema: behavior\.outputSchema \} : \{\}\),/);
  assert.match(source, /\.\.\.\(behavior\.acceptance \? \{ acceptance: behavior\.acceptance \} : \{\}\),/);
  assert.match(source, /acceptanceContext: \{ mode: "chain" \}/);
});

test("async config and runner carry structured output and acceptance wiring", () => {
  const asyncSource = readSrc("runs/background/async-execution.ts");
  const runnerSource = readSrc("runs/background/subagent-runner.ts");

  assert.match(asyncSource, /outputSchema: s\.outputSchema/);
  assert.match(asyncSource, /acceptance: s\.acceptance/);
  assert.match(asyncSource, /const acceptance = resolveEffectiveAcceptance/);
  assert.match(asyncSource, /\.\.\.\(acceptance\.level !== "none" \? \{ acceptance \} : \{\}\)/);
  assert.match(asyncSource, /createStructuredOutputRuntime\(behavior\.outputSchema, asyncDir\)/);
  assert.match(asyncSource, /createStructuredOutputRuntime\(params\.outputSchema, asyncDir\)/);
  assert.match(runnerSource, /structuredOutput: step\.structuredOutput/);
  assert.match(runnerSource, /readStructuredOutput\(step\.structuredOutput\)/);
  assert.match(runnerSource, /evaluateAcceptance\(\{/);
  assert.match(runnerSource, /acceptanceFailureMessage\(acceptance\)/);
  assert.match(runnerSource, /stripAcceptanceReport\(resolvedOutput\.fullOutput\)/);
});

test("public schema exposes outputSchema and acceptance for single, parallel, and chain modes", () => {
  const schemaSource = readSrc("extension/schemas.ts");

  assert.match(schemaSource, /const TaskItem = Type\.Object\([\s\S]*outputSchema: Type\.Optional\(JsonSchemaObject\)[\s\S]*acceptance: Type\.Optional\(AcceptanceOverride\)/);
  assert.match(schemaSource, /const ParallelTaskSchema = Type\.Object\([\s\S]*outputSchema: Type\.Optional\(JsonSchemaObject\)[\s\S]*acceptance: Type\.Optional\(AcceptanceOverride\)/);
  assert.match(schemaSource, /const ChainItem = Type\.Object\([\s\S]*outputSchema: Type\.Optional\(JsonSchemaObject\)[\s\S]*acceptance: Type\.Optional\(AcceptanceOverride\)/);
  assert.match(schemaSource, /outputSchema: Type\.Optional\(JsonSchemaObject\)[\s\S]*acceptance: Type\.Optional\(AcceptanceOverride\)/);
});

test("public schema rejects currently unsupported required review gates", () => {
  const validator = Compile(SubagentParams);

  assert.equal(validator.Check({ agent: "reviewer", task: "review", acceptance: { review: { required: false } } }), true);
  assert.equal(validator.Check({ agent: "reviewer", task: "review", acceptance: { review: { required: true } } }), false);
  assert.equal(validator.Check({ agent: "reviewer", task: "review", acceptance: { review: {} } }), false);
});

test("public schema no longer advertises teamRun mode and executor rejects it", () => {
  assert.equal(Object.hasOwn(SubagentParams.properties, "teamRun"), false);

  const executorSource = readSrc("runs/foreground/subagent-executor.ts");
  assert.match(executorSource, /teamRun mode has been removed/);
  assert.doesNotMatch(executorSource, /runTeamPath/);
});
