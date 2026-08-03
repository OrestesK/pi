---
name: skill-authoring
description: Create, review, or materially revise local Pi skill content. Use for SKILL.md structure, precise activation descriptions, progressive disclosure, references, helper scripts, and structural validation. Comparative behavior and activation evidence belong to agent-evaluation; Pi placement, precedence, wiring, and mutation belong to runtime-maintenance.
---

# Skill Authoring

Design the smallest skill package that gives one reached behavior a clear owner.

## 1. Confirm ownership and need

Before writing:

- identify the current consumer and normal task entrypoint
- inspect existing skills and runtime owners for overlap
- choose one canonical owner instead of duplicating policy
- keep placement, precedence, settings, and runtime mutation with `runtime-maintenance`

Do not add a skill, script, compatibility layer, or reference tree without a current consumer.

## 2. Define the activation contract

Read [the activation contract](references/activation-contract.md).

Define direct triggers, synonyms, near misses, negative controls, and owner handoffs before finalizing frontmatter. The description is always visible in Pi's skill catalog, so keep it precise and operationally narrow. Full instructions belong in the body.

## 3. Use progressive disclosure

Keep the reached workflow in `SKILL.md`. Move optional explanations, detailed examples, and reference material into `references/` only when they improve a real task. Keep references one level deep and link them directly from the root.

Add a helper script only for deterministic repeated work with a current consumer. Give it an explicit input, output, failure, and side-effect contract. Add focused tests for repository-owned script behavior.

## 4. Validate structure

Read [the structural validation guide](references/structural-validation.md), resolve this skill's `scripts/validate_skill.py`, and validate the candidate skill:

```bash
python3 /absolute/path/to/skill-authoring/scripts/validate_skill.py /absolute/path/to/candidate-skill
```

Treat this validator as a local preflight. Pi's merged resource loader remains authoritative for effective parsing, discovery, diagnostics, and collisions.

## 5. Hand off behavior and placement

Use `agent-evaluation` for comparative activation or outcome evidence. Do not automatically promote a candidate or persist an evaluation case.

Use `runtime-maintenance` for project/global placement, precedence, settings, package wiring, and approved runtime mutation. Reviewer, validator, and evaluation results are evidence, not edit authority.
