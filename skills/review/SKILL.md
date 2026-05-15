---
name: review
description: Code, plan, and implementation review against requirements and Orestes' standards. Use for review requests, after non-trivial implementation, or when dispatching reviewer subagents in spec-compliance or code-quality mode.
---

# Review

Review is evidence gathering, not rubber-stamping.

## Review Modes

Choose the mode explicitly.

### 1. Spec Compliance Review

Check whether the implementation matches the approved task/plan exactly.

Flag:

- missing requirements,
- extra behavior beyond scope,
- wrong files or public API shape,
- tests that do not prove the specified behavior,
- deviations from explicit constraints.

In this mode, extra cleverness is a defect.

### 2. Code Quality Review

Check whether the implementation is safe, simple, tested, and maintainable.

Review:

1. Correctness and edge cases.
2. Meaningful behavioral tests.
3. Security, auth, data exposure, secrets, injection.
4. Error handling and failure modes.
5. Simplicity/YAGNI and unnecessary abstraction.
6. Existing codebase patterns.
7. Artifacts: debug logs, commented experiments, hardcoded values, stray TODOs.
8. Scope control.

Do not relitigate approved product scope unless the implementation creates risk.

### 3. Plan Review

Check feasibility before implementation:

- tasks are ordered and small,
- assumptions are explicit,
- files and commands are specific enough,
- TDD scenarios are appropriate,
- human review triggers are identified,
- no mutating git instructions are included.

### 4. Review Feedback Evaluation

Treat review feedback as evidence to evaluate, not an order to obey blindly.

For each item:

1. Read the full feedback before reacting.
2. Verify it against code, tests, plan, and constraints.
3. Classify it:
   - `must-fix`: correctness, security, broken tests, requirement mismatch, unhandled critical edge case.
   - `should-fix`: maintainability, likely bug, insufficient test coverage, avoidable complexity.
   - `nit`: naming, wording, minor formatting, small cleanup.
   - `invalid/needs-discussion`: conflicts with requirements, violates YAGNI, unclear, or reviewer lacks context.
4. Implement valid fixes in severity order.
5. Push back with evidence when feedback is wrong or conflicts with approved scope.
6. Ask one focused question when feedback changes behavior, architecture, tests, security, or scope.
7. Verify after each logical fix group.

Do not use filler such as “great catch,” “good point,” or “you're absolutely right.” Report technical action and evidence instead.

## How to Review

- Read the plan/spec and relevant diff/files before judging.
- Use tree-sitter/LSP for precise code navigation.
- Run or inspect tests when needed and safe.
- Cite file paths and line numbers for findings.
- Categorize findings: `must-fix`, `should-fix`, `nit`, `note`.
- Write findings to `.scratch/reviews/` when requested by the workflow.

## Finding Standard

Report only issues supported by evidence.

A useful finding includes:

```text
Severity: must-fix | should-fix | nit | note
Location: path:line
Problem: what is wrong
Why it matters: concrete impact
Fix: specific direction
Evidence: code/test/plan reference
```

## What Not To Do

- Do not rubber-stamp.
- Do not rewrite the code during review.
- Do not flag intentional approved decisions as bugs.
- Do not expand scope beyond the change.
- Do not invent hypothetical issues without plausible impact.
