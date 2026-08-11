---
name: skill-authoring
description: Create, review, or make substantial changes to local Pi skills. Use for skill-package structure, activation descriptions, progressive disclosure, references, helper scripts, and structural validation. Use agent-evaluation for comparative activation or outcome evidence. Use runtime-maintenance for Pi placement, precedence, settings, package wiring, and approved runtime changes.
---

# Skill Authoring

Design the smallest skill package for a behavior that a current task can reach, with one clear owner.

## 1. Confirm ownership and need

Before writing:

- identify the current consumer and normal task entrypoint
- inspect existing skills and runtime owners for overlap
- keep each policy with one owner instead of copying it
- keep placement, precedence, settings, and runtime mutation with `runtime-maintenance`

Do not add a skill, script, compatibility layer, or reference tree without a current consumer.

## 2. Define the activation contract

Read [the activation contract](references/activation-contract.md).

Before finalizing frontmatter, list direct triggers, synonyms, near misses, requests that must not activate the skill, and owner handoffs. The description is always visible in Pi's skill catalog, so keep it precise and narrow. Put full instructions in the body.

## 3. Use progressive disclosure

Keep the workflow that a current task needs in `SKILL.md`. Move optional explanations, detailed examples, and reference material into `references/` only when they improve a real task. Keep references one level deep and link them directly from the root.

Add a helper script only when a current consumer repeats deterministic work. State its inputs, outputs, failures, and side effects. Add focused tests for repository-owned script behavior.

## 4. Validate structure

Read [the structural validation guide](references/structural-validation.md). Find this skill's `scripts/validate_skill.py`, then run it on the candidate skill:

```bash
python3 /absolute/path/to/skill-authoring/scripts/validate_skill.py /absolute/path/to/candidate-skill
```

This validator is only a local preflight. Pi's merged resource loader determines the effective result for parsing, discovery, diagnostics, and collisions.

## 5. Hand off behavior and placement

Use `agent-evaluation` to compare activation or task outcomes. Do not promote a candidate automatically or save an evaluation case by default.

Use `runtime-maintenance` for project or global placement, precedence, settings, package wiring, and approved runtime changes. Treat reviewer, validator, and evaluation results as evidence, not permission to edit.
