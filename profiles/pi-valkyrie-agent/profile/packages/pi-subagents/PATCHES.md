# Local git overlay

This directory is a git checkout of `https://github.com/nicobailon/pi-subagents.git`, loaded by Pi from `/home/orestes/.config/pi/settings.json` as `packages/pi-subagents`.

It is not an unpacked `npm:pi-subagents` copy. The current local overlay is tracked relative to upstream commit `4fb627d1fdae90e18e9f5c744a9853e3231bed19`.

Later upstream commits are incoming upstream work and are out of scope for this ledger until explicitly ported.

## Local stack

Use this command for current hashes:

```sh
(cd packages/pi-subagents && git log --oneline --reverse 4fb627d..HEAD)
```

As of 2026-07-08, the local stack contains these concerns:

- `change: update subagent workflow docs` — updates README and `skills/pi-subagents/SKILL.md` for the local orchestration workflow, review gates, artifacts, async usage, and fan-in patterns.
- `change: update bundled agent contracts` — updates bundled agent prompts/contracts for current tool boundaries, supervisor coordination, review expectations, and handoff style.
- `change: update prompt workflows` — adds prompt workflow templates for adversarial debate, generate/filter, quality gates, quick adversarial checks, and research-decision flows.
- `change: layer local runtime overlay` — carries runtime behavior not in upstream `4fb627d`, including acceptance gates, capability checks, dynamic fanout helpers, workflow expansion, child event logging, path/output collision guards, parallel writer/straggler safeguards, async cleanup, model fallback, and compact agent labels.
- `test: add local runtime coverage` — adds tests for the local overlay and adjusts support fixtures.

## Notable local runtime behavior

- `src/runs/shared/model-fallback.ts` treats WebSocket transport closures such as `WebSocket closed 1006 Connection ended` as retryable model failures when an agent has `fallbackModels` configured.
- `src/shared/agent-labels.ts` compacts repeated async parallel child labels, for example `Async parallel: 19× delegate [id]` instead of a long repeated-agent list.
- `steer` is the canonical parent-to-child guidance action. The old public `action: "message"` / `ack_supervisor_message` path is intentionally not preserved.
- `subagent({ action: "list" })` is a local routing surface: it shows effective, deduped, non-disabled agents with concise route guidance, keeps chain diagnostics, and uses `get` for provenance/details.
- Local `list` and parent tool-description guidance intentionally omit proactive skill subagent suggestions; local orchestration policy relies on explicit parent judgment and read-only advisory fanout rather than automatic skill suggestion blocks.
- Structured acceptance uses the unified `src/runs/shared/acceptance.ts` path. The stale local acceptance split/finalization modules and `maxFinalizationTurns` surface are intentionally removed unless a future feature explicitly revives same-session finalization.
- Dynamic chain fanout uses `src/runs/shared/dynamic-fanout.ts`; the older `src/shared/chain-dynamic.ts` helper and its stale `.mjs` test are intentionally removed.
- Explicit `reads` are a launch contract: single, parallel, chain, async, and worktree paths fail before child launch when user-specified read files are missing after path resolution. This local overlay needs that behavior because parent prompts rely on explicit `reads` as required child inputs, while upstream treats reads primarily as best-effort prompt hints. Agent `defaultReads` remain best-effort so missing local workflow defaults do not block unrelated runs.
- Background completion notifications include run id, role, cwd when present, launch time, and output path when configured, and suppress stale completions older than the notification dedupe TTL. Every native completion uses `{ triggerTurn: true, deliverAs: "followUp" }`; an acknowledged intercom delivery still queues a hidden native follow-up (`display: false`) so streaming parents receive a distinct continuation without duplicate visible UI.
- `run-monitor` normal exits fail closed unless final output declares a documented terminal state (`completed`, `failed`, `missing`, `stuck`, or `timed_out`). Canonical, bold Markdown, and `Final state` labels are accepted; `running`, `blocked`, unknown/missing states, and `continue_waiting` are rejected. Runtime interruption bypasses this semantic final-output guard.
- Model-facing async launch, subagent-tool, skill, and global-agent guidance treats persistent interactive completion as notification-driven without naming the optional `wait` tool; the enabled tool's own description owns its usage rules, and disabling `waitTool` omits it entirely. README documentation still covers both configurations.
- Top-level `workflow: "builtin.*"` remains accepted as a deprecated compatibility alias for now. When `forceTopLevelAsync` is enabled, these expanded aliases follow the same depth-0 async override as explicit single, parallel, and chain calls. First-party guidance should prefer prompt shortcuts or explicit `tasks`/`chain` shapes before eventual removal.
- Removed subagent turn limit
- Agent Markdown is the sole authority for model-callable tools, exact `mcp:` selections, and `subagentOnlyExtensions`. Normal project/user/package/builtin file precedence selects the agent; runtime code does not apply role-name profiles or capability ceilings. `subagents.agentOverrides` rejects `tools` and `subagentOnlyExtensions`; edit or shadow the agent file instead.

## Setup

For this checked-out package, install runtime dependencies without local dev-package shadows:

```sh
(cd packages/pi-subagents && npm install --omit=dev --ignore-scripts)
```

Use `--omit=dev` so local copies of `@earendil-works/pi-*` dev dependencies do not shadow the active Pi runtime packages.

## Verification

Configured package tests:

```sh
(cd packages/pi-subagents && npm run test:unit)
(cd packages/pi-subagents && npm run test:integration)
(cd packages/pi-subagents && npm run test:e2e)
```

`npm test` currently aliases `npm run test:unit`, and `test:unit` runs only `test/unit/*.test.ts`. Remaining `.mjs` preservation tests are not part of the configured package scripts; run targeted `.mjs` tests manually when changing behavior they cover until the scripts are updated.

Useful read-only sync checks:

```sh
(cd packages/pi-subagents && git fetch origin --dry-run)
(cd packages/pi-subagents && git status --short --branch --untracked-files=all)
(cd packages/pi-subagents && git diff --stat 4fb627d..HEAD)
```
