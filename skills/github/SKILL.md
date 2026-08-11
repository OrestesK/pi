---
name: github
description: Use for GitHub pull requests, issues, CI workflows, and API queries
---

# GitHub (gh CLI)

Use the `gh` CLI for all GitHub operations. Never use the GitHub MCP server.

## Read-only inspection

Use these commands to inspect PRs, issues, and CI:

- `gh pr list`, `gh pr view <number>`
- `gh pr view <number> --json number,url,state,headRefName,headRefOid,baseRefName,baseRefOid`
- `gh pr checks <number> --json name,bucket,state,workflow,link`
- `gh pr checks <number> --watch --fail-fast` when checks are pending
- `gh run list`, `gh run view <id>`, `gh run view <id> --log-failed`, `gh run watch <id>`
- `gh api repos/{owner}/{repo}/pulls/{number}/comments` for PR review comments
- `gh api repos/{owner}/{repo}/issues/{number}/comments` for PR discussion comments
- `gh issue list`, `gh issue view <number>`
- `gh api repos/{owner}/{repo}/...` for other read-only API queries

## Keep PR evidence current

For a readiness claim or review that depends on current PR content:

1. Select the PR. Use the `gh pr view <number> --json` command above to record its number, URL, state, head name/OID, and base name/OID.
2. Use that PR number for every later metadata, diff, check, and review query. Collect evidence for the recorded PR state.
3. Immediately before the final claim or an authorized claim-bearing post, fetch the same identity fields again with that PR number.
4. If the state, head name/OID, or base name/OID changed, do not claim or post. Reassess the PR, discard evidence that depended on its old content, collect the needed evidence again, and repeat this check.
5. Report the final identity as `PR <number> <url>; head <name>@<OID>; base <name>@<OID>`.

This check confirms freshness; it does not lock the PR. Use it only when the conclusion depends on PR content, not for metadata-only inspection or non-PR reviews.

## Choose proof through `behavioral-proof`

Before choosing evidence for a PR review, readiness assessment, evidence report, comment, or iteration, load and follow `behavioral-proof`. It decides whether a representative live path exists, the approval gate, the strongest non-live fallback, and the live-proof status. This skill handles GitHub identity and transport; do not repeat proof-selection rules here.

## GitHub mutations and command rules

For every GitHub mutation, the user must request and explicitly approve the exact tool (`gh`), command, action, target, and expected effect. State every relevant credential, data, cost, time, environment, and destructive boundary, then wait. Approval for one mutation does not allow another. The active authorization, external-action, and project rules still control what is allowed.

Mutation categories include:

- creating a PR with `gh pr create --title "..." --body-file /tmp/pr_body.md`
- editing a PR description/body
- posting a PR comment
- submitting a PR review
- creating an inline PR review comment
- creating an issue
- posting an issue comment
- pushing, merging, closing, or reopening
- labeling, assigning, or requesting reviewers
- changing a PR base

Always use `--body-file` for multi-line PR bodies to avoid shell-escaping errors. Check `gh auth status` if an operation fails.

## PR Description Format

Use this format when drafting PR text or when the user explicitly asks to update a PR description/body:

```
## What changed
Concise summary. Key files/areas affected.

## Why
Motivation, context, problem being solved.

## How tested
Tests added/updated, manual checks, commands run.
```

For a PR with a large or mixed diff, add guidance that tells reviewers where to start and separates core behavior from generated, mechanical, or formatting-only changes:

- separate core behavior files from generated, mechanical, or formatting-only files;
- say which files or areas reviewers should read first;
- call out risky behavior changes, migration/order dependencies, rollout notes, and test coverage;
- recommend splitting the PR instead of polishing the description when the diff is too large or mixed to review safely.
