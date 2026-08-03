---
name: agent-evaluation
description: Evaluate comparative agent, workflow, prompt, or skill-activation behavior. Use for baseline/candidate task matrices, fresh-context activation probes, outcome judging, and promotion evidence. Do not use to author skill structure, prove product behavior, or change Pi configuration; use skill-authoring, behavioral-proof, or runtime-maintenance.
---

# Agent Evaluation

Evaluate observable outcomes under controlled conditions. An evaluation produces evidence and a recommendation; it does not promote a candidate or modify runtime configuration.

## Define the contract

Before running a case:

1. State the exact observable outcome and unchanged behavior
2. Identify the baseline and candidate
3. Reuse representative existing cases before inventing synthetic ones
4. Record model, harness, tools, prompt, data, environment, and relevant version conditions
5. Keep those conditions equivalent except for the candidate variable
6. State what the case can and cannot prove

Use deterministic checks only when the outcome contract is deterministic. Product behavior proof remains owned by `behavioral-proof`.

## Build the case matrix

Include only cases that can change the decision. For a skill activation evaluation, read [Skill activation profile](references/skill-activation-profile.md).

For broader comparisons, cover:

- Expected successful behavior
- Meaningful boundary or failure behavior
- A control that should remain unchanged
- Previously observed regressions when approved for reuse

Do not create a persistent regression case without explicit user approval.

## Judge outcomes

Define a task-specific rubric independently of candidate output. Prefer observable artifacts, commands, diagnostics, or user-visible results over trajectory preferences.

When model judgment is required:

- Keep candidate identity hidden when practical
- Swap baseline/candidate order in pairwise judgment
- Preserve disagreement and variance
- Do not retry selectively toward a preferred result
- Do not use a fixed universal winner threshold

## Report

Use [Evaluation record](references/evaluation-record.md) to report:

- Contract and conditions
- Cases and evidence
- Rubric and judge method
- Outcomes and regressions
- Disagreement or variance
- Limitations and unavailable boundaries
- Recommendation

A recommendation is not promotion authority. Skill-content changes return to `skill-authoring`; placement, precedence, wiring, and runtime mutation return to `runtime-maintenance`.

## Prohibited behavior

- No self-refinement loop
- No automatic configuration or prompt changes
- No automatic candidate promotion
- No hidden retries or discarded unfavorable runs
- No replacement for `behavioral-proof`, `review`, or `writing-tests`
- No claim that catalog discovery proves model activation
