---
name: iterate-pr
description: Use for iterating on a pull request until CI failures and review feedback are resolved
---

# Iterate PR

Work through this cycle: fix a verified problem, show the user the change, wait for the user to push it, monitor the PR, then inspect the result.

## Workflow

1. **Check current state**: load and follow `github`. Select the PR and record its identity as that skill requires. Use the recorded PR number with `gh pr checks <number> --json name,bucket,state,workflow,link` so the checks belong to the PR you selected.
2. **Identify failures**: read CI logs, PR review comments, and issue discussion comments. Extract the first actionable error before fixing.
3. **Fix issues**: implement only fixes supported by the evidence. Follow the active global ownership rules and `delegation`; this skill does not choose or override the writer.
4. **Verify locally**: run the same safe focused check or nearest local equivalent that CI runs.
5. **Review**: for a nontrivial fix, enter the normal review stage in `manager-workflow`. Continue automatically only when local validation confirms the fix stays within approved behavior and the next round makes material progress.
6. **Present changes**: tell the user what behavior was fixed, what changed in the implementation, the review result, and what validation ran.
7. **Wait for the push**: wait for the user to run the version-control command.
8. **Monitor the new head**: after the pushed head appears on that PR, record a new identity snapshot. If checks are pending, run `gh pr checks <number> --watch --fail-fast`. Then rerun `gh pr checks <number> --json name,bucket,state,workflow,link` to inspect every check. Before reporting that the PR is ready, use `github` to confirm the PR identity has not changed.
9. **Repeat** when a new failure appears.

## Rules

- Never push code or mutate Git state. Present changes and let the user push.
- Use `gh pr checks` rather than GitHub Actions-only commands when judging overall PR readiness; PRs can have non-Actions checks.
- Fix one category of failure at a time (lint, then tests, then type errors).
- If a failure is unclear, investigate before fixing.
- If a failure might be flaky, ask the user to retry or rerun it once when that would change GitHub state. Then report the evidence instead of retrying in a loop.
- Keep iterating only when the next step will produce evidence and meaningfully advances the resolution. Stop and report when the PR is clean, work needs approval, or attempts are blocked or repeat. Do not use a fixed iteration limit.
