# pi-goal-supervisor

Local Pi extension that adds a session-scoped `/goal` command and continues work at safe idle boundaries until evidence-backed completion or an explicit pause/clear. It has no built-in turn, no-progress, or wall-clock budget limit.

## Commands

- `/goal` or `/goal status` — show current goal status.
- `/goal <objective>` — start or replace the active goal.
- `/goal start <objective>` — explicit start.
- `/goal pause [reason]` — pause auto-continuation and abort the active turn when Pi exposes `ctx.abort()`.
- `/goal resume` — resume and queue one continuation when idle.
- `/goal clear` — stop auto-continuation for the active goal without aborting the active turn.
- `/goal done <evidence>` — record completion evidence for judging.
- `/goal help` — show command usage.

## Safety contract

This package is deliberately non-invasive:

- It does not call `getActiveTools`, `setActiveTools`, `getAllTools`, or `registerTool`.
- It does not change tools, permissions, guardrails, MCP servers, memory, subagents, or Slipstream settings.
- It does not auto-approve shell commands, sudo, destructive actions, mutating git operations, cloud/database mutations, or Google Docs/Drive changes.
- It uses `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })` for supervisor continuations.
- It does not stop automatically after a fixed number of turns, repeated no-progress turns, or elapsed wall-clock time; use `/goal pause` to hold it or `/goal clear` to end supervision for the active goal. `GOAL_BLOCKED` marks the goal as active-but-waiting until the next qualifying agent prompt or explicit `/goal resume`.
- It instructs the agent not to block for internal plan approval, routine local work, minor/reversible local edits, tests, docs, formatting, routine implementation choices, or any safe local/read-only/reversible next step.

## Completion policy

The worker must emit one of these markers:

```text
GOAL_DONE: <specific evidence from transcript/artifacts/verifications>
GOAL_BLOCKED: <specific 100% blocker and smallest safe requested human decision>
```

`GOAL_BLOCKED` should be used only after the agent verifies it is 100% blocked. Allowed blocker classes are an unapproved production/remote/external-account mutation; an unapproved privileged/destructive local action such as sudo, mutating git, or destructive filesystem/data changes; unapproved private/external-account reads or cross-source discovery; a material product/API/scope decision not implied by the goal; or impossibility because of a missing required permission, tool, or credential. If any safe local/read-only/reversible next step remains, the agent should take it instead of blocking.

A marker-sourced `GOAL_BLOCKED` is not terminal: the goal remains active and resumes on the next qualifying agent prompt so the new user context can unblock the work. Judge/model failures may also put the goal in `blocked`, but those fail-closed blocks require explicit `/goal resume`; `/goal status` only reports state. Only `/goal clear` and approved completion are terminal for the active goal.

`GOAL_DONE` is not accepted by self-claim alone. The extension runs deterministic prechecks and then a model-backed judge when available. Judge failures are fail-closed as inconclusive/blocked rather than complete.

## State

Primary state is persisted as Pi session custom entries with custom type `goal-supervisor-state`. This makes state branch-scoped and reload/compaction friendly without writing project `.pi/` runtime files.

## Verification

```bash
(cd packages/pi-goal-supervisor && npm run check)
(cd packages/pi-goal-supervisor && node --experimental-strip-types -e "await import('./src/index.ts'); console.log('goal supervisor import ok')")
node -e "JSON.parse(require('fs').readFileSync('settings.json','utf8')); console.log('settings json ok')"
pi list | grep -A3 -B3 'pi-goal-supervisor'
```

A bounded live smoke was run with an isolated session dir under `.scratch/live-goal-supervisor/`.
