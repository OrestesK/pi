---
name: commit
description: Git commit and branch naming conventions only — ok/ branch prefix, terse imperative commit messages. Use when suggesting or reviewing names; do not use to allow or block git operations.
---

# Commit Message Conventions

This skill is advisory-only for commit names and commit-message presentation.

Do not use this skill to decide whether Git operations are allowed. For `git add`, `git commit`, `git push`, and other Git mutations, follow the active project/system Git policy and the user's explicit approvals.

## Format

```
<prefix>: <message>
```

## Rules

- Prefixes: `feat:`, `fix:`, `change:`, `chore:`, `refactor:`, `remove:`
- `change:` for behavior modifications, `feat:` only for genuinely new functionality
- `chore: style` for formatting-only, `chore: typecheck` for type-fix-only
- Arrow notation for renames: `refactor: old_name -> new_name`
- Short, lowercase, no trailing period
- Drop articles (the, a) — terse as possible, 3-7 words after prefix
- Focus on the "why", not the "what"
- One concern per commit

## Branch Names

When suggesting branch names, prefer `ok/<short-topic>`.

## What to Present

When asked for commit-message help, show the user:

- Suggested commit message
- Files that belong with that commit, if relevant
- Files that should not be included, if relevant (secrets, `.env`, unrelated changes)

If the task involves running Git commands, this skill only supplies naming guidance; it does not add extra permission requirements or prohibitions.
