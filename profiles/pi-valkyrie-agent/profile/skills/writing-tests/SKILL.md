---
name: writing-tests
description: Generic conventions and rubrics for writing, editing, and reviewing tests. Use whenever adding or changing test files, test helpers, fixtures, mocks, or test-review feedback.
---

# Writing Tests

This skill owns test quality and placement. `behavioral-proof` selects whether tests, characterization, reproduction, existing coverage, integration, live, or manual evidence best proves the changed claim.

Use this skill when you are:

- adding or editing tests,
- creating or changing test helpers, fixtures, mocks, or test data,
- reviewing tests or test-related review feedback,
- deciding whether an existing test should be extended instead of adding a new one.

Follow local test patterns first. Before inventing a structure, inspect nearby tests, helpers, fixtures, and package scripts. Match the repository's existing runner, assertion style, file layout, naming style, and setup/teardown conventions unless there is a concrete reason to change them.

## Core Standard

A good test is evidence that behavior works and would catch a real regression.

Prefer tests that:

- exercise externally meaningful behavior or a stable internal contract,
- fail for the bug or missing behavior they are meant to guard,
- use realistic inputs and expected outcomes,
- cover important edge cases and failure paths when the behavior requires them,
- are deterministic and safe to run repeatedly,
- are easy to read without re-implementing the production logic in the assertion.

Avoid tests that:

- assert only that a field exists, a constant is assigned, or a trivial passthrough returns its input,
- duplicate framework or library behavior instead of testing code owned by the repo,
- mirror implementation details so closely that any refactor breaks the test without catching a user-visible defect,
- require production changes solely to make the test convenient,
- add coverage numbers without increasing bug-catching power.

Do not add tests whose only purpose is to re-prove guarantees already enforced by the language, type system, declarative schema, validation library, or framework. Add tests when repo-owned code composes, configures, narrows, or depends on those guarantees at a boundary.

Never test hardcoded implementation/config values. Do not copy literals from production code into assertions just to mirror the code. Instead, test behavior, canonical source-of-truth wiring, or meaningful invariants. Exact expected values are appropriate only when the value is itself the user-visible behavior, external contract, canonical fixture, or invariant result.

For UI or visualization tests, prefer user-visible behavior, accessible semantics, data transformation correctness, calculation correctness, rendered outcomes, and interaction outcomes over brittle markup shape, raw HTML structure, or snapshot-heavy assertions. Assert structure only when the structure or semantics is part of the contract.

## When Not to Add a New Test

Do not create a new test when:

1. Existing coverage already proves the behavior and can be extended cleanly.
2. The change is non-behavioral and no meaningful assertion would fail on a real bug.
3. The code is a trivial delegation, constant, type-only change, formatting change, or generated output.
4. The test would only verify a third-party library, runtime, or framework.

When no new test is appropriate, state which other evidence proves the claim and why a behavior test would add no useful regression signal.

## Choosing the Test Shape

Before writing a test, identify the owned behavior boundary:

- pure logic or data transformation,
- internal module/service contract,
- external API or provider boundary,
- UI/user journey,
- repo-owned auth, permission, validation, or security boundary,
- repo-owned behavior that composes, narrows, or enforces a type/schema guarantee at a boundary.

Choose the smallest test shape that proves the real behavior. Do not use a heavier layer just because it is available, and do not use a tiny unit test when the claim depends on real wiring across a boundary.

Use advanced techniques only when the behavior demands them; they are triggered options, not default gates:

- property-based tests for broad input spaces with stable invariants,
- characterization tests before refactoring legacy or poorly understood behavior,
- differential or metamorphic tests for reimplementations, parsers, serializers, scoring, ranking, or transformations with a reference relation,
- exhaustive tests for small finite state spaces,
- golden or snapshot tests only when the serialized or rendered output is itself the contract and diffs are small enough for human review,
- contract or recorded-fixture tests when hand-written mocks would hide real interface drift; reviewed fixtures do not replace required live validation,
- doc-sync tests only when published docs, schemas, examples, generated manifests, or registries are treated as contract artifacts.

## Placement and Structure

Before adding a test file or helper:

1. Find the closest existing tests for the same behavior, module, or user flow.
2. Extend an existing test when that keeps related cases together and readable.
3. Add a new test only when the existing file would become confusing, cross ownership boundaries, or mix unrelated behavior.
4. Keep setup close to the test unless it is reused enough to justify a fixture/helper.

When a task includes an approved spec, reproduction, acceptance scenario, bug report, documented behavior, or user-provided example, derive test cases from that artifact. Make the mapping visible in test names, case labels, or a short report note; do not create a separate traceability artifact unless the project already uses one.

When multiple implementations must satisfy the same stable contract, prefer one reusable contract suite or helper if it reduces duplication without obscuring ownership. Keep local tests focused on local behavior, unique edge cases, and owner-specific guarantees.

Test names should state the behavior and expected outcome. Avoid vague names like `works`, `handles case`, or `test command`.

Prefer small, readable test bodies. A single test may cover multiple tightly related cases in one flow when that is clearer than splitting into repetitive one-assertion tests. Use separate tests for independent behaviors, materially different failure modes, or cases that need different setup.

When deleting a feature, do not replace the test or assert that checked for it with one that checks that it is not there.

## Fixtures, Helpers, and Test Data

Use fixtures and helpers to remove noise, not to hide the behavior being tested.

Good fixtures/helpers:

- create realistic default objects with explicit overrides,
- keep each test's important inputs visible,
- avoid shared mutable state across tests,
- make teardown or cleanup automatic when local resources are created,
- have names that describe the role they play in the test.

Avoid helpers that:

- encode the same logic as the production code,
- hide the assertion-relevant input or expected output,
- introduce a large abstraction layer around simple setup,
- make tests depend on execution order or shared mutation.

Prefer immutable or freshly-created test data unless sharing is safe and clearly read-only.

## Mocks and Boundaries

Mock only at a boundary that the test does not own.

Use mocks to:

- isolate the behavior under test from slow, flaky, nondeterministic, or expensive collaborators,
- force error paths that are hard to trigger otherwise,
- verify a meaningful interaction when the interaction is the behavior.

Do not mock the code path whose behavior the test is supposed to prove. Do not over-specify incidental calls, ordering, or object shapes unless those details are part of the contract.

Test downstream failure paths when they are part of the behavior: timeouts, partial responses, I/O errors, retry exhaustion, provider/API shape drift, rollback, fallback, wrapping, or propagation. Do not invent failure semantics the contract never promised; characterize current behavior and flag unspecified policy instead.

When patching or replacing behavior, patch the symbol where the code under test observes it. Keep mocks typed or shaped narrowly enough that the test still catches invalid calls.

## Determinism and Flake Resistance

Tests must produce the same result every run.

Control or inject:

- time and clocks,
- randomness and generated IDs,
- environment variables and process state,
- filesystem paths and temporary directories,
- concurrency, timers, retries, and backoff,
- network or service responses when they are outside the behavior under test.

Do not use arbitrary sleeps to make a test pass. Prefer direct synchronization, a bounded condition wait, fake timers, dependency injection, or patching the delay mechanism.

For locking, background work, retry, or concurrency behavior, create deterministic interleaving or contention where possible. Use built-in or standard race/concurrency tooling when the repo, language, or runtime already supports it.

Clean up local resources created by a test. Avoid global state leaks that can affect later tests.

## Assertions

Assertions should describe the expected behavior clearly.

Prefer:

- exact expected values when they are stable,
- partial or structural assertions only when irrelevant fields are intentionally ignored,
- explicit error assertions for failure behavior,
- one clear assertion group per behavior step.

Avoid:

- broad truthiness checks when a precise value matters,
- snapshots or large object comparisons that obscure the important contract,
- assertions derived by running the same logic as the implementation,
- excessive assertions on incidental implementation details.

If a failure would be hard to understand, add a small amount of structure or naming so the failing assertion points to the broken behavior.

## Readability

Tests are documentation for behavior.

Keep comments short and useful. Explain non-obvious setup, boundary choices, or why a case matters; do not narrate every line.

Use blank lines to separate setup, action, and assertions when that improves scanability. Keep important values named and visible. Prefer descriptive names over abbreviations.

## Review Checklist

When reviewing tests, check:

- Does this test prove the changed behavior or bug fix?
- Would it fail if the implementation regressed in the intended way?
- Is the test deterministic and isolated from unrelated state?
- Does it match nearby test conventions?
- Is the setup minimal but realistic?
- Are mocks placed at appropriate boundaries?
- Are assertions precise enough to catch the bug and readable enough to diagnose failures?
- Is an existing test better to extend than adding a new one?
- Are skipped tests, relaxed assertions, or broad snapshots justified?
- Are focused/skipped tests temporary, conditional, and tracked rather than silently disabling coverage?
- Does the test contain real assertions instead of logs, prints, zero-assertion smoke, tautologies, or broad truthiness checks?
- Is a test labeled as a boundary/system test mocking every boundary it claims to exercise?
- Were snapshot, golden, or recorded-fixture updates reviewed as behavior changes rather than accepted blindly?
- Does every global state, environment, registry, clock, filesystem, or process mutation get cleaned up?

Classify review feedback according to the `review` skill. Do not rewrite tests during a review-only task.

## Verification Evidence

When reporting test work, include:

- test files added or changed,
- what behavior the tests prove,
- why tests were not added if none were appropriate,
- the relevant test command and result when run,
- any broader lint, typecheck, or format command that was applicable and run,
- any verification that could not run and why.

If a completion claim depends on a real browser, provider, runtime, benchmark, performance, or external-service environment, unit tests alone are insufficient evidence. Run live validation when allowed, or explicitly report that live validation was not performed and what remains unverified.
