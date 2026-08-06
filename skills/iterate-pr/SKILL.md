---
name: iterate-pr
description: Use for iterating on a pull request until CI failures and review feedback are resolved
---

# Iterate PR

Automate the fix -> present -> user pushes -> monitor -> check -> fix cycle for PRs. The agent never pushes.

## Workflow

1. **Check current state**: load and follow `github`; select the target PR and start its PR evidence identity snapshot. Use `gh pr checks <number> --json name,bucket,state,workflow,link` with the retained PR number as the source of truth for PR-attached checks.
2. **Identify failures**: read CI logs, PR review comments, and issue discussion comments. Extract the first actionable error before fixing.
3. **Fix issues**: implement validated fixes under the active global and `delegation` ownership rules; this workflow does not choose or override the writer.
4. **Verify locally**: run the same safe focused check or nearest local equivalent that CI runs.
5. **Review**: enter the normal `manager-workflow` review stage for nontrivial fixes; continue automatically only with validated local fixes inside the approved behavior while material progress continues.
6. **Present changes**: show the behavior fixed, effective change, review disposition, and validation evidence to the user.
7. **User pushes**: user runs the appropriate version-control command; the agent never pushes or mutates git state.
8. **Monitor after user push**: after the pushed head is visible on the retained PR number, start a new PR evidence identity snapshot before monitoring. Use `gh pr checks <number> --watch --fail-fast` when checks are pending, then re-run `gh pr checks <number> --json name,bucket,state,workflow,link` for the retained PR to inspect the full check set. Apply the `github` identity recheck before reporting PR readiness.
9. **Repeat** if new failures appear and the next round has a concrete evidence-producing action.

## Rules

- Never push code — present changes and let the user push.
- Use `gh pr checks` rather than GitHub Actions-only commands when judging overall PR readiness; PRs can have non-Actions checks.
- Fix one category of failure at a time (lint, then tests, then type errors).
- If a failure is unclear, investigate before fixing.
- If a failure looks flaky, ask the user to retry or re-run it once when that requires a mutating GitHub action, then report the flake evidence instead of looping indefinitely.
- Continue only while each iteration has a concrete evidence-producing action and makes material progress. Stop and report when clean, blocked, approval-gated, or stalled/repeating; do not rely on a fixed iteration count.
