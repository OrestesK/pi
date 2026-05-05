---
name: semantic-git
description: Entity-level git analysis with sem CLI — structural diffs, impact analysis, blame. Use when asked for "blast radius", "impact analysis", "what functions changed", "semantic diff", or structural code change analysis beyond line-level diffs.
---

# Semantic Git (sem CLI)

Use the `sem` CLI for structural code change analysis:

- `sem diff` — entity-level diff (functions/classes changed, not line-level)
- `sem impact` — blast radius analysis (what depends on changed code)
- `sem context` — surrounding context for changes
- `sem blame` — entity-level blame (who last changed this function)
- `sem log` — entity-level git log
- `sem entities` — list all code entities in a file

Use instead of raw `git diff` when you need to understand structural changes rather than line-level diffs.
