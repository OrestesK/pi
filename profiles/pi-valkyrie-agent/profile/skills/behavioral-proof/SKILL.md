---
name: behavioral-proof
description: Selects proportionate evidence for material behavior changes and bug fixes. Use to choose test-first, characterization, reproduction, existing coverage, integration, live, or manual proof without imposing one sequence.
---

# Behavioral Proof

Testing is one proof method, not a universal sequence. Start from the observable claim, its real owner/path, and the boundary at which evidence must hold. Select the smallest evidence that could disprove an incorrect implementation.

## Evidence selection

### Test-first

Use a failing test first when it efficiently isolates genuinely new behavior. Confirm the failure is for the intended missing behavior, implement minimally, then verify the focused and relevant broader checks.

### Characterization or baseline-first

Use current tests, snapshots, traces, or outputs before changing existing or legacy behavior. Preserve the established contract except for the approved delta, then compare after the edit.

### Reproduction-first bug proof

Use `systematic-debugging` to establish root cause. Capture the narrow failing reproduction or regression test when practical, fix the canonical owner, then verify the reproduction and relevant suite.

### Existing coverage plus before/after evidence

Use existing tests when they already prove the changed claim. Add or change a test only when the existing contract would not catch the intended regression.

### Integration, live, or manual proof

Use the real integration or user flow when the claim crosses process, provider, browser, database, queue, deployment, rendering, performance, or other runtime boundaries that unit tests cannot establish. State any unavailable boundary explicitly.

### Non-behavioral work

Do not invent tests for wording, comments, formatting, mechanical renames, or guarantees already owned by the language/framework. Run relevant parsing, discovery, reference, formatting, or contract validation and explain why no behavior test was added.

## Proof contract

Before editing material behavior, identify:

- the exact changed claim and unchanged behavior;
- the normal reachable entrypoint and canonical owner;
- the selected evidence method and why it is sufficient;
- the narrow command or flow that proves it;
- broader checks justified by shared risk.

Do not use a weak unit test to support a live/integration claim, require test-first when characterization is more informative, or add malformed-internal-state tests for states the producer cannot create.

## Test Quality Rules

Good tests:

- exercise real behavior,
- fail for the right reason,
- have specific names,
- avoid mocking what should be integrated,
- cover edge/error cases when behavior requires them.

Bad tests:

- mirror implementation details,
- only assert that a mock was called,
- pass before the feature exists,
- require changing production code solely for tests,
- cover field existence or trivial mapping without behavior.

## Verification output

Report the changed claim, evidence method, files or flows exercised, exact commands/results, broader checks, unavailable boundaries, and why no test was added when none was appropriate.
