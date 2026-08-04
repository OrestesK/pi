---
name: writing-plans
description: Produce a precise implementation plan after requirements or design are clear when the task requests a plan or continuity materially benefits from one.
---

# Writing Plans

Write plans that another agent can execute without inventing behavior.

## Plan contract

Include:

- Goal and observable outcome
- Previous and changed behavior
- Unchanged behavior and non-goals
- Constraints and protected boundaries
- Simplest coherent implementation and rejected alternatives
- Assumptions, evidence, risks, and stop conditions
- Canonical owners and likely files
- Claim-bound behavioral proof
- Exact focused verification commands
- Review focus points

Annotate unresolved assumptions. Do not turn an exact internal file list into permission to broaden the task.

## Tasks

Order tasks by real dependencies. Each task names its purpose, relevant owners, minimal implementation direction, verification, and stop condition. Keep related changes atomic and avoid artificial microtasks.

No human interaction is available. A plan requested as the final deliverable is returned and stops. When implementation is already authorized by the benchmark task, return the plan to the active manager workflow without adding an approval gate. An unresolved material product choice becomes a concrete blocker.

## Git and external actions

Do not include automatic publication, deployment, credential use, or destructive Git operations unless the task explicitly requires them. Treat them as unavailable boundaries otherwise.
