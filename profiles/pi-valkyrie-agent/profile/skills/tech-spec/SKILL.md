---
name: tech-spec
description: Produce an implementation-ready typed call-stack design when work crosses a material ownership, API, schema, protocol, persistence, integration, concurrency, or authorization boundary.
---

# Tech Spec

Produce a code-shaped architecture proposal grounded in inspected source. Use this only when architecture detail can materially change implementation or proof.

## Establish context

Inspect current code, callers, tests, types, runtime paths, documentation, constraints, side effects, and operational boundaries. Verify external behavior from repository-pinned source or anonymous Context7 when available. Mark every statement as verified fact, proposed design, or unresolved question.

No human interaction is available. Resolve factual and routine choices with evidence. Prefer the narrowest reversible design consistent with the task. Return an unresolved material product choice as a blocker.

## Required design

For every changed boundary specify:

- Domain values and states
- Inputs, outputs, errors, and invariants
- Module/API/configuration contracts
- Adapter and ownership placement
- Normal entrypoint-to-side-effect call flow
- Reachable failure, retry, cancellation, concurrency, authorization, and monitoring behavior
- Files/modules and proof seams

Use the project's language and types. Do not invent interfaces, wrappers, migrations, or compatibility layers without a demonstrated owner or consumer.

## Proof

For each material claim, identify the normal reachable path, smallest evidence that could disprove a wrong implementation, focused command or flow, broader checks justified by shared risk, and any unavailable live boundary.

## Output

Include summary, context, affected behaviors, goals/non-goals, constraints, alternatives, recommendation, contracts, call stacks, file ownership, behavioral proof, risks, and unresolved blockers. Return to the active manager workflow when implementation is part of the task.
