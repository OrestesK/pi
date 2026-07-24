# pi-goal-supervisor

Runs a session-scoped goal until evidence-backed completion, an accepted blocker, or an explicit pause.

> **Before starting a goal:** supervision has no fixed turn, no-progress, or wall-clock limit. While active, it disables direct user-asking and approval tools. Use `/goal pause` to hold work and `/goal clear` to end supervision.

## Install

> Pi packages run with full local permissions. Review the source before installing.

From this package directory:

```sh
pi install "$PWD"
```

## Quick start

1. Run `/reload` in an existing Pi session, or start a new session.
2. Run `/goal <objective>`.
3. Use `/goal status` to inspect progress.
4. Use `/goal pause` to hold work or `/goal clear` to end supervision.

The supervisor continues at safe idle boundaries until the goal completes, blocks, pauses, or is cleared.

## Commands

| Command | Effect |
| --- | --- |
| `/goal` or `/goal status` | Show the current goal status |
| `/goal <objective>` | Start or replace the active goal |
| `/goal pause [reason]` | Pause continuation and abort the active turn when Pi exposes `ctx.abort()` |
| `/goal resume` | Resume and queue one continuation when idle |
| `/goal clear` | Stop continuation without aborting the active turn |

## Safety model

While a goal is active:

- Direct user asking, approval, confirmation, and HITL tools are disabled. The previous tool set is restored after the goal is cleared or completed.
- Stale calls to disabled tools are blocked through `tool_call`.
- Delegation and coordination tools such as `subagent`, `mcp`, `intercom`, `contact_supervisor`, and `Agent` remain available.
- Automatic command and tool blockers remain active. Goal supervision does not bypass shell/path guardrails or other runtime-denied calls.
- The package registers no new tools.

## Continuation behavior

- Continuations use `pi.sendMessage(..., { deliverAs: "followUp", triggerTurn: true })`.
- There is no automatic stop after a fixed number of turns, repeated no-progress turns, or elapsed time.
- Goal mode uses the normal session configuration, tools, skills, subagents, parent-write ownership, proof, review, reflection, progress, and safety boundaries.
- When a normal session would ask an in-scope material engineering, product, or workflow question, the agent instead runs substantial review with at least three distinct relevant advisors, gathers more evidence as needed, chooses the best supported answer, and records the decision. Decision ambiguity never blocks the goal, and advisors cannot authorize protected actions.
- Nontrivial implementation, refactor, migration, PR-sized, schema/API, docs-surface, and cross-file goals use the normal Contract Gate: a contract card and owner map before editing, followed by final review against the contract, evidence, scope, and generated artifacts.
- Before `GOAL_DONE`, each done criterion must map to fresh evidence, including changed, generated, untracked, and debug artifacts.

## Completion and blockers

The agent must emit one marker:

```text
GOAL_DONE: <specific evidence from transcript/artifacts/verifications>
GOAL_BLOCKED: <specific blocker and evidence that no safe non-asking next step exists>
```

`GOAL_DONE` is not accepted on self-claim alone. The extension runs deterministic prechecks and then a model-backed judge when available. Judge failures fail closed as inconclusive or blocked.

`GOAL_BLOCKED` is accepted only after no safe non-asking path remains and the blocker is an automatic command/tool/runtime guardrail; a missing required tool, resource, credential, authentication, access, or service; or a required protected action that is not authorized and has no safe alternative. The protected-action class must use `GOAL_BLOCKED: required protected action not authorized; no safe alternative: action=<specific action>; effect=<required effect>; evidence=<evidence>`. Decision ambiguity, ordinary approval, confirmation, clarification, and product or workflow questions are not blocker classes; forced decision review must choose the best supported in-scope answer.

A marker-sourced blocker is not terminal. The goal resumes on the next qualifying agent prompt or explicit `/goal resume`. Judge or model failures require `/goal resume`; `/goal status` only reports state. Only `/goal clear` and approved completion terminate the goal.

## State

State is stored in Pi session entries as `goal-supervisor-state`. It is branch-scoped and survives reloads and compaction without writing project `.pi/` runtime files.

## Development

```sh
npm ci
npm run check
node --experimental-strip-types -e "await import('./src/index.ts'); console.log('goal supervisor import ok')"
```

## License

MIT
