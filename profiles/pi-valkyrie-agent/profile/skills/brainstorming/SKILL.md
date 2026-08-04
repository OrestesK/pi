---
name: brainstorming
description: Use before creative or non-trivial implementation work when feature shape, behavior, API, architecture, or requirements are ambiguous.
---

# Brainstorming

Refine ambiguous work into the smallest coherent design before editing.

## Process

1. Inspect the current code, tests, documentation, runtime path, and repository constraints
2. State the observable outcome, users/callers, current behavior, proposed delta, non-goals, and proof boundary
3. Identify only material choices that change behavior, ownership, compatibility, security, cost, or maintenance shape
4. Compare credible alternatives by ownership, data flow, failure behavior, implementation cost, and verification
5. Prefer the simplest option that satisfies the task without scaffolding, compatibility layers, or unused abstractions

No human interaction is available in this benchmark. Resolve factual questions with repository evidence and tools. For a remaining preference, choose the narrowest reversible option consistent with the task. If a material ambiguity cannot be resolved without inventing product intent, preserve useful work and return it as a concrete blocker rather than asking or waiting.

## Output

Return a decision-ready design containing:

- Recommendation and observable result
- Previous and proposed behavior
- Changed and unchanged boundaries
- Alternatives and rationale
- Assumptions, evidence, risks, and stop conditions
- Likely owners and claim-bound proof

A design does not authorize work outside the supplied task contract.
