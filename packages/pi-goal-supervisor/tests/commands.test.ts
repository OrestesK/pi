import assert from "node:assert/strict";
import { test } from "node:test";
import {
  getGoalArgumentCompletions,
  handleCommand,
  parseGoalCommand,
} from "../src/commands.ts";
import { createInitialState } from "../src/state.ts";

test("parses status, objective text, and reserved commands", () => {
  assert.deepEqual(parseGoalCommand(""), { action: "status" });
  assert.deepEqual(parseGoalCommand("status"), { action: "status" });
  assert.deepEqual(parseGoalCommand("start ship it"), {
    action: "start",
    objective: "start ship it",
  });
  assert.deepEqual(parseGoalCommand("ship it"), {
    action: "start",
    objective: "ship it",
  });
  assert.deepEqual(parseGoalCommand("stop now"), {
    action: "start",
    objective: "stop now",
  });
  assert.deepEqual(parseGoalCommand("pause waiting"), {
    action: "pause",
    reason: "waiting",
  });
  assert.deepEqual(parseGoalCommand("done tests passed"), {
    action: "start",
    objective: "done tests passed",
  });
  assert.deepEqual(parseGoalCommand("help"), {
    action: "start",
    objective: "help",
  });
});

test("status with no active goal does not create placeholder state", () => {
  const context = {
    cwd: "/tmp/project",
    sessionId: "s",
    now: "2026-06-03T00:00:00.000Z",
  };
  const result = handleCommand(undefined, "status", context);

  assert.equal(result.state, undefined);
  assert.equal(result.shouldQueueContinuation, false);
  assert.match(result.message, /no active goal/i);
  assert.deepEqual(
    getGoalArgumentCompletions(""),
    ["status", "pause", "resume", "clear"].map((value) => ({
      value,
      label: value,
    })),
  );
});

test("command handler starts pauses resumes and clears", () => {
  const now = "2026-06-03T00:00:00.000Z";
  const start = handleCommand(undefined, "build package", {
    cwd: "/tmp/project",
    sessionId: "s",
    now,
  });
  const paused = handleCommand(start.state, "pause manual", {
    cwd: "/tmp/project",
    sessionId: "s",
    now,
  });
  const resumed = handleCommand(paused.state, "resume", {
    cwd: "/tmp/project",
    sessionId: "s",
    now,
  });
  const cleared = handleCommand(resumed.state, "clear", {
    cwd: "/tmp/project",
    sessionId: "s",
    now,
  });

  assert.ok(start.state);
  assert.ok(paused.state);
  assert.ok(resumed.state);
  assert.ok(cleared.state);
  const status = handleCommand(start.state, "status", {
    cwd: "/tmp/project",
    sessionId: "s",
    now,
  });

  assert.equal(start.state.status, "running");
  assert.equal(paused.state.status, "paused");
  assert.equal(resumed.state.status, "running");
  assert.equal(cleared.state.status, "stopped");
  assert.equal(start.continuationReason, "start");
  assert.equal(resumed.continuationReason, "resume");
  assert.equal(paused.abortTurn, true);
  assert.equal(cleared.abortTurn, false);
  assert.match(start.message, /started/i);
  assert.match(status.message, /\(0 turns\)/);
  assert.doesNotMatch(status.message, /\d+\/\d+/);
});

test("done text replaces the active objective instead of recording completion evidence", () => {
  const state = createInitialState({
    objective: "finish",
    cwd: "/tmp/project",
    sessionId: "s",
    now: "2026-06-03T00:00:00.000Z",
  });

  const result = handleCommand(state, "done tests passed", {
    cwd: "/tmp/project",
    sessionId: "s",
    now: "2026-06-03T00:01:00.000Z",
  });

  assert.ok(result.state);
  assert.equal(result.state.status, "running");
  assert.equal(result.state.objective, "done tests passed");
  assert.equal(result.state.lastDoneClaim, undefined);
  assert.equal(result.shouldQueueContinuation, true);
});
