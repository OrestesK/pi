# pi-goal-supervisor

Local Pi extension that adds a session-scoped `/goal` command and continues work at safe idle boundaries until evidence-backed completion or an explicit pause/clear. It has no built-in turn, no-progress, or wall-clock budget limit.

## Commands

- `/goal` or `/goal status` — show current goal status.
- `/goal <objective>` — start or replace the active goal.
- `/goal pause [reason]` — pause auto-continuation and abort the active turn when Pi exposes `ctx.abort()`.
- `/goal resume` — resume and queue one continuation when idle.
- `/goal clear` — stop auto-continuation for the active goal without aborting the active turn.

## Safety contract

This package is deliberately autonomous while a goal is active:

- It disables direct user asking, approval, confirmation, and HITL tools while the goal is active, then restores the prior active tool set when the goal is cleared or completed.
- It does not disable delegation or coordination tools such as `subagent`, `mcp`, `intercom`, `contact_supervisor`, or `Agent`.
- It blocks stale calls to disabled tools through `tool_call` as a fail-safe.
- It keeps automatic command/tool blockers active; the supervisor does not bypass shell/path guardrails or other runtime-denied tool calls.
- It does not register new tools.
- It uses `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })` for supervisor continuations.
- It does not stop automatically after a fixed number of turns, repeated no-progress turns, or elapsed wall-clock time; use `/goal pause` to hold it or `/goal clear` to end supervision for the active goal. `GOAL_BLOCKED` marks the goal as active-but-waiting until the next qualifying agent prompt or explicit `/goal resume`.
- It instructs the agent not to ask for approval, confirmation, clarification, or product/workflow decisions, and not to block for internal plan approval, routine local work, minor/reversible local edits, tests, docs, formatting, routine implementation choices, user permission policy, or any safe local/read-only/reversible next step.
- It uses the main agent by default and does not instruct the agent to start a supervised team, reviewer swarm, reducer workflow, or child-agent workflow from the `/goal` prompt.
- For nontrivial implementation, refactor, migration, PR-sized, schema/API, docs-surface, or cross-file goals, it instructs the agent to use a Contract Gate: build a contract card and owner map before editing, then use final self-review to compare the result against the contract, owner map, tests/docs evidence, scope hygiene, and forbidden/generated artifacts.
- Before `GOAL_DONE`, it instructs the agent to map each done criterion to fresh evidence and account for generated or untracked artifacts, debug outputs, and changed files.

## Completion policy

The worker must emit one of these markers:

```text
GOAL_DONE: <specific evidence from transcript/artifacts/verifications>
GOAL_BLOCKED: <specific blocker and evidence that no safe non-asking next step exists>
```

`GOAL_BLOCKED` should be used only after the agent verifies it is 100% blocked by an actual automatic command/tool blocker or a missing required tool, credential, auth, access, or service. User-permission, approval, confirmation, clarification, and product/workflow decision blockers are not accepted blocker classes. If any safe non-asking local/read-only/reversible next step remains, the agent should take it instead of blocking.

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

A bounded local live-comparison harness is available at `.scratch/runs/goal-live-team-comparison/run-live-comparison.sh`. The harness is diagnostic evidence only; it does not prove hard enforcement of child-session team behavior.
