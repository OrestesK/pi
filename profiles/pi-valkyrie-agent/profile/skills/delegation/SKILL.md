---
name: delegation
description: Use for subagent role selection, topology, task packets, parallelism, write ownership, fan-in, and waiting procedure.
---

# Delegation

Use subagents only when independent evidence or implementation ownership materially improves the task.

## Routing

- Fast repository reconnaissance → `scout`
- Implementation context or handoff packet → `context-builder`
- Local or Context7-backed source research → `researcher`
- High-context consistency decision → `oracle`
- Plan after requirements are clear → `planner`
- Independent review → `reviewer`
- Approved nontrivial implementation → `clone`

Run independent read-only work in parallel. Use a chain only when a later step needs concrete output from an earlier step.

## Writing ownership

The parent owns task selection, decisions, integration, and final verification. Every writing clone receives one complete allocation map and an exact exclusive write set. Reads may overlap; writes may not. A clone stops before writing outside its set and returns the ownership conflict as a blocker.

Do not create overlapping writers or transfer ownership mid-wave. Finish and inspect one write wave before allocating the next.

## Task packets

Include:

- Concrete outcome and non-goals
- Exact evidence target or write set
- Current task decisions and source evidence
- Required proof and commands
- Mutation and external-effect boundaries
- Stop conditions
- Expected result shape

## Fan-in

Inspect every decision-relevant result before depending on it. Validate child claims against source, diffs, or fresh checks. Reviewer and diagnostic findings are evidence, not edit authority.

No human or external supervisor is available. A blocked child returns a concrete blocker through its normal result. The parent continues useful independent work, then resolves or reports the blocker from repository evidence. Do not busy-poll healthy asynchronous runs.
