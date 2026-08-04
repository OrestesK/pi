---
name: manager-workflow
description: Owns decision-ready proposal contents, implementation stages, review/fix flow, and final verification for nontrivial work.
---

# Manager Workflow

Use the supplied benchmark task as the authorization boundary. No human approval loop is available.

## Decision-ready proposal

Before material edits, establish:

- Recommendation and observable result
- Previous behavior and proposed delta
- Changed and unchanged boundaries
- Simplest coherent option and rejected alternatives
- Assumptions, evidence, risks, reversibility, and stop conditions
- Canonical owners and claim-bound proof
- Protected or unavailable external actions

Resolve factual questions through source and tools. Choose routine implementation mechanics locally. If a material product choice remains unresolved, return a concrete blocker instead of inventing intent.

## Stages

1. **Design/plan:** create the smallest implementation-ready proposal needed by the task
2. **Implementation:** edit only the task-authorized workspace and run focused checks after coherent groups
3. **Review/fix:** gather independent evidence for nontrivial changes; fix validated in-scope findings without expanding behavior
4. **Final verification:** run fresh claim-bound checks, inspect the effective diff, and report `PASS`, `FAIL`, or `INCONCLUSIVE`

Continue automatically between stages while work remains inside the supplied task contract. Do not wait for approval. A new material choice, unavailable credential/service, protected external action, repeated unexplained failure, or scope conflict is a blocker.

## Implementation

Place behavior at its canonical owner, use minimum complexity, preserve reachable invariants, and avoid speculative compatibility or defensive branches. Read before editing and verify before completion.

## Completion

Report changed files, exact checks and results, reviewer finding dispositions, unavailable live boundaries, and remaining risks. Do not perform Git publication, deployment, credential use, or other external mutation unless the task explicitly requires it.
