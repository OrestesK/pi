---
name: commit
description: Use for drafting commit messages and branch names
---

# Draft Commit Messages and Branch Names

Use this skill only to draft commit messages, group changes, and suggest branch names.

This skill never authorizes `git add`, `git commit`, `git push`, or any other Git mutation. Follow the active Git policy and get the user's explicit approval.

## Workflow

1. When current changes affect the recommendation, inspect status and diffs with read-only Git commands
2. Group files by one concern per commit
3. Draft and validate a Conventional Commit message
4. Present the suggestion and relevant file grouping

## Format

```text
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

## Types

Use exactly one supported type:

- `feat` — new functionality
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting only; no behavior change
- `refactor` — code restructuring without a feature or bug fix
- `perf` — performance improvement
- `test` — tests only
- `build` — build system or dependency changes
- `ci` — continuous-integration changes
- `chore` — maintenance not covered by another type
- `revert` — revert an earlier change

## Rules

- If a scope helps name the affected area, use a noun: `fix(parser): ...`
- Put `!` immediately before `:` for a breaking change: `feat(api)!: ...`
- Keep non-rename descriptions imperative, lowercase, and without a trailing period
- Prefer 3–7 words after the prefix
- Drop articles such as "the" and "a" when meaning stays clear
- Focus on the purpose or observable outcome, not a mechanical file summary
- Use one concern per commit
- Use arrow notation for renames: `refactor: old_name -> new_name`
- Put a blank line between the header, body, and footer when each is present
- Use `BREAKING CHANGE: <description>` for a breaking-change footer
- Use Git-style trailers for issue references or other footers

## Validation

Before you present a message, check:

- type is supported
- scope is optional and correctly parenthesized
- `!` is correctly placed when used
- description follows the style rules
- body and footers are separated correctly
- breaking changes are marked in the header or footer

## Examples

```text
feat(parser): parse nested arrays
fix(ui): prevent duplicate submissions
docs: clarify setup requirements
refactor: old_name -> new_name
feat(api)!: require signed requests

BREAKING CHANGE: unsigned API requests are no longer accepted
```

## Branch Names

Prefer `ok/<short-topic>`.

## What to Present

When asked for commit-message help, show:

- suggested commit message
- files that belong in the commit, when relevant
- files that should not be included, such as secrets, `.env` files, or unrelated changes
