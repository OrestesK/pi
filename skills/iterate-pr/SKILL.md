---
name: iterate-pr
description: Automated PR iteration loop — fix CI failures, address review feedback, push, repeat. Use when asked to "iterate on PR", "fix CI", "PR is failing", "address review comments", or continuously push fixes until checks pass.
---

# Iterate PR

Automate the fix -> push -> wait -> check -> fix cycle for PRs.

## Workflow

1. **Check current state**: `gh pr checks <number>` or `gh pr view <number>`
2. **Identify failures**: Read CI logs, review comments
3. **Fix issues**: Use worker subagents for implementation
4. **Verify locally**: Run the same checks that CI runs
5. **Present changes**: Show diff to user for approval
6. **User pushes**: User runs git push (agent never pushes)
7. **Monitor**: `gh run watch` until CI completes
8. **Repeat** if new failures appear

## Rules
- Never push code — present changes and let the user push
- Fix one category of failure at a time (lint, then tests, then type errors)
- If a failure is unclear, investigate before fixing
- After 3 iterations without progress, stop and discuss with the user
