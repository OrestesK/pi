---
name: behavioral-proof
description: Use for selecting proportionate evidence for behavior changes and bug fixes
---

# Behavioral Proof

Testing is one way to prove a change, not a required sequence. Start with the observable claim, its actual owner and reachable path, and the point where the evidence must hold. Choose the smallest evidence that could show the implementation is wrong.

## Choose evidence

### Test-first

Use a failing test first when it efficiently isolates genuinely new behavior. Confirm the failure is for the intended missing behavior, implement minimally, then verify the focused and relevant broader checks.

### Characterization or baseline-first

Use current tests, snapshots, traces, or outputs before changing existing or legacy behavior. Preserve the established contract except for the approved delta, then compare after the edit.

### Reproduction-first bug proof

Use `systematic-debugging` to establish root cause. Capture the narrow failing reproduction or regression test when practical, fix the canonical owner, then verify the reproduction and relevant suite.

### Existing coverage plus before/after evidence

When existing tests already prove the changed claim, run them after the change. Add or change a test only when the existing contract would not catch the intended regression.

### Integration, live, or manual proof

When a material changed claim crosses a process, provider, browser, database, queue, deployment, rendering, performance, or other runtime boundary, identify that boundary. Prioritize the reachable live or end-to-end flow, then use the closest integration evidence. Focused unit tests support that runtime claim but do not replace it.

If live evidence is unavailable or protected, use the strongest authorized lower-fidelity evidence. State the exact runtime boundary that remains unverified. For a claim that does not cross a runtime boundary, use the smallest claim-bound proof instead of forcing a live probe.

### Non-behavioral work

Do not invent tests for wording, comments, formatting, mechanical renames, or guarantees already owned by the language or framework. Run relevant parsing, discovery, reference, formatting, or contract checks instead. Explain why no behavior test was added.

### Check live proof for pull requests

For each pull request, first decide whether a meaningful, representative live path exists. Do not invent one for documentation-only or other non-runtime changes.

Before running live, external, credentialed, or effectful validation, state:

- the exact tool and action
- the target and environment
- the expected effects
- the credential and data boundary
- the expected cost
- the expected duration

Wait for the user's explicit approval before running it.

Report live-proof status precisely:

- `passed`: approved live proof executed successfully; include the scenario or command, observed result, and environment
- `failed`: approved live proof executed and failed; include the scenario or command, observed result, environment, and unresolved blocker
- `not run`: no live proof executed. When no meaningful representative live path exists, report `not run — no meaningful runtime path exists; no live boundary applies` and use the smallest applicable non-live proof. When a meaningful live path exists but its probe is unavailable, inappropriate, declined, blocked, or not authorized, name the reason and exact unverified live boundary

Only approved, executed, passing live evidence supports a live-verified claim. If no meaningful live path exists, use the smallest applicable non-live proof without inventing a boundary. If a meaningful live path exists but the proof does not run, use the strongest named authorized non-live evidence and state why plus the exact unverified live boundary. A separately approved contract can still require live proof for readiness.

## Proof contract

Before editing material behavior, identify:

- the exact changed claim and unchanged behavior;
- the normal reachable entrypoint and canonical owner;
- the selected evidence method and why it is sufficient;
- the narrow command or flow that proves it;
- broader checks justified by shared risk.

Do not:

- use a weak unit test to support a live or integration claim
- require test-first when characterization is more informative
- add malformed-internal-state tests for states the producer cannot create

## Test quality

Good tests:

- exercise real behavior,
- fail for the right reason,
- have specific names,
- avoid mocking what should be integrated,
- cover edge/error cases when behavior requires them.

Bad tests:

- mirror implementation details,
- only assert that an incidental mock was called,
- pass before the feature exists,
- require changing production code solely for tests,
- cover field existence or trivial mapping without behavior.

## Report verification

Report:

- the changed claim
- the evidence method
- files or flows exercised
- exact commands and results
- broader checks
- runtime boundaries that remain unverified
- why no test was added when none was appropriate
