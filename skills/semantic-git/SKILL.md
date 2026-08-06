---
name: semantic-git
description: Use for structural Git analysis such as changed functions, semantic diffs, impact analysis, and blame
---

# Semantic Git (sem CLI)

Use the `sem` CLI for structural code change analysis:

- `sem diff` — entity-level diff (functions/classes changed, not line-level)
- `sem impact` — blast radius analysis (what depends on changed code)
- `sem context` — surrounding context for changes
- `sem blame` — entity-level blame (who last changed this function)
- `sem log` — entity-level git log
- `sem entities` — list all code entities in a file

Use `sem` alongside raw `git diff` when entity-level structural analysis is needed; retain raw diffs for line-level and total-effective-diff review.
