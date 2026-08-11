---
name: systematic-debugging
description: Use for investigating bugs, test failures, crashes, flaky behavior, build failures, or unexpected output
---

# Systematic Debugging

No fixes without root-cause evidence.

Random changes waste time and create new bugs. Follow the phases in order.

## Phase 1: Observe

Read the actual failure completely.

- Read the full error, stack trace, command output, or symptom report.
- Identify exact file, line, function, test, request, or data path involved.
- Reproduce with the narrowest safe command unless reproduction is impossible, unsafe, or already captured in reliable evidence.
- Check current diff and recent read-only history if relevant.
- Use `module_report`, `read_symbol`, `read_enclosing`, or LSP to inspect failing symbols before broad reads.

Do not propose a fix in this phase.

## Phase 2: Trace Root Cause

Find where the bad value, state, or behavior originates.

- Trace inputs and outputs across each boundary.
- Compare expected vs actual values.
- Inspect callers and callees when necessary.
- Check configuration, environment, mocks, fixtures, and test setup.
- Find similar working code in the same project.

Fix at the source, not at the symptom.

## Phase 3: Form One Hypothesis

State exactly:

```text
I believe the failure occurs because <specific cause>, based on <evidence>.
Confidence: <low|moderate|high>.
```

Mark uncertain claims as `**[ASSUMPTION: ...]**`.

Do not hold multiple vague hypotheses and edit for all of them.

## Phase 4: Test the Hypothesis

Before implementing the fix:

- Use the smallest read, probe, command, or temporary inspection that can validate the hypothesis.
- Change only one variable if a code change is needed to test.
- If wrong, return to observation with the new evidence.

Do not stack fixes on an unverified guess.

## Phase 5: Fix

Once root cause is supported:

1. Use `behavioral-proof` to select the narrowest evidence that would catch the regression.
2. Capture a reproduction or regression test when it materially improves the proof.
3. Make the minimal root-cause fix.
4. Run the narrow reproduction or selected check.
5. Run broader checks only when shared risk justifies them.

No “while here” refactors unless the fix requires them.

## Wait for observable conditions

For asynchronous or flaky behavior:

1. Name the observable condition that proves readiness or completion
2. Poll or subscribe to that exact condition under a bounded deadline
3. Capture the last observed state when the deadline expires
4. Treat timeout as evidence rather than increasing the delay blindly
5. Use a fixed sleep only when elapsed timing is itself the behavior under test

Keep the condition tied to the real lifecycle contract. Do not use a condition that hides a state the system cannot produce

External polling still obeys authorization, rate, data, and cost boundaries

Do not use this method to poll detached Pi subagents. Follow the active async lifecycle rules

Use `writing-tests` for any persistent test helper or fixture

## When Fix Progress Stalls

Continue only while each attempted fix tests a supported root-cause hypothesis and produces material new evidence or progress

Stop when:

- failures repeat
- progress stalls
- each change reveals only unrelated symptoms
- evidence invalidates the architecture or plan
- you reach a material or protected boundary

Summarize the attempts and evidence. Question the architecture or original plan, then route the next decision through the active workflow. Do not use an arbitrary attempt count

## Red Flags

Stop if you catch yourself thinking:

- “It is probably X; I'll just change it.”
- “Quick fix first, investigate later.”
- “Try several things and see.”
- “The stack trace is long; skip to the bottom.”
- “Tests are annoying; manually verify.”
- “One more fix attempt” after repeated failures.
- “This reference is long; skim and adapt.”

## Reporting

A debugging report should include:

- observed symptom and reproduction,
- root-cause evidence,
- hypothesis and confidence,
- fix made,
- regression test or reason none was added,
- verification commands/results,
- remaining risks.
