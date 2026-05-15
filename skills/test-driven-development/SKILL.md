---
name: test-driven-development
description: Use when implementing new behavior, changing logic, or fixing bugs. Selects the right TDD scenario, requires red/green evidence for new behavior, and adapts testing discipline to this Pi workflow.
---

# Test-Driven Development

Testing is evidence, not decoration. Choose the right scenario before editing behavior.

## Scenario 1: New behavior or new file

Use full red-green-refactor.

1. Write the smallest meaningful failing test.
2. Run it and confirm it fails for the expected reason.
3. Write the minimal implementation.
4. Run the test and confirm it passes.
5. Run the relevant broader tests.
6. Refactor only while tests stay green.

If the test passes immediately, it did not prove the new behavior. Fix the test or pick the right existing test.

## Scenario 2: Changing existing tested behavior

Use when relevant coverage already exists.

1. Identify the tests that prove the current behavior.
2. Run them before editing and confirm they pass.
3. Make the minimal change.
4. Run the same tests again.
5. Add a new test if the existing tests do not prove the changed behavior.

If you cannot identify real coverage, fall back to Scenario 1.

## Scenario 3: Trivial or non-behavioral change

Use for typos, comments, pure prompt wording, formatting, narrow config display changes, or mechanical renames.

- Do not invent trivial tests.
- Run relevant validation if available.
- State why no behavior test was added.

If logic, data flow, permissions, parsing, error handling, or user-visible behavior changes, it is not trivial.

## Bug Fixes

For real bugs:

1. Use `systematic-debugging` first to find root cause.
2. Add or identify a test that reproduces the bug.
3. Verify the test fails before the fix when practical.
4. Fix the root cause.
5. Verify the regression test and relevant suite pass.

## If Code Was Written Before Tests

Do not rationalize it away.

- Pause and identify which scenario applies.
- If Scenario 1, either revert the premature implementation or ask the user for a pragmatic recovery path.
- Do not keep untested exploratory code as the basis for a completion claim.
- Report the recovery clearly.

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

## Verification Output

When reporting, include:

- scenario used,
- test file(s) added/changed,
- red command and observed failure for Scenario 1 when available,
- green command and result,
- any broader checks run,
- why tests were not added if Scenario 3.
