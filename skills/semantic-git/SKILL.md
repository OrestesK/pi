---
name: semantic-git
description: Use for structural Git analysis such as changed functions, semantic diffs, impact analysis, and blame
---

# Semantic Git (sem CLI)

Use `sem` to inspect code-level changes and dependencies. These commands read Git state without mutating it:

- `sem diff` — show which functions or classes changed
- `sem impact` — show dependencies, dependent code, transitive impact, and tests for an entity
- `sem context [ENTITY]` — get surrounding code for an entity
- `sem blame <FILE>` — see who last changed each entity in a file
- `sem log` — trace an entity through Git history
- `sem entities [PATH]` — list entities in a file or directory

Use raw `git diff` too when you need the complete line-by-line patch. Do not use `sem setup` or `sem unsetup`; they change global Git diff behavior.
