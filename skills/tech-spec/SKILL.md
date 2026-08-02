---
name: tech-spec
description: Produces an implementation-ready, typed call-stack design proposal for architecture-heavy work or whenever the user asks for a full tech spec. Use within manager-workflow when a change crosses a material ownership or data-flow boundary, changes public APIs, schemas, protocols, persistence, migrations, or external integrations, requires transaction, concurrency, retry, cancellation, idempotency, authorization-flow, or shared-state-machine design, or has several credible architectures. Do not use automatically for small local fixes, wording or style changes, mechanical refactors, simple config edits, isolated test corrections, isolated bugs with a clear owner and proof path, ordinary implementation with no changed boundary, review, verification, or test-only work with no new architecture, or clearly single-owner changes.
license: MIT; see LICENSE
---

# Tech Spec

Produce a code-shaped architecture proposal with concrete contracts and end-to-end execution flows. This skill is design-only. It does not authorize implementation or tracked source/config mutation.

`manager-workflow` owns activation, approval, stage flow, and review. `brainstorming` owns unresolved product/design intent and user questions. When used during implementation planning, this spec is the proposal inside the existing design/plan stage, not another stage or approval gate.

## Invocation modes

### Manager-routed architecture work

Use the inspected task context to produce the architecture body of the decision-ready proposal. Return the complete draft to `manager-workflow`; do not ask for implementation approval before its asynchronous plan review.

### User-requested spec only

When the user asks only for a tech spec, return the spec and stop. Do not implement, offer implementation by default, or create a tracked file. Return the complete spec inline. A user-requested or workflow-useful `.scratch/` artifact may preserve detail but never replaces the complete inline spec.

## Establish sufficient context

Before specifying architecture:

1. Inspect current code, docs, types, call paths, tests, and local conventions that can answer factual questions.
2. When the design relies on an external framework, provider, protocol, library, or service, verify current version-matched public documentation and the local integration.
3. Identify the observable problem, callers/users, current behavior, desired behavior, constraints, invariants, affected systems, entrypoints, side effects, and operational concerns.
4. Classify every architectural statement as one of: **verified fact** with its source, **proposed design** with its rationale, or **open question** with the decision needed. Do not present plausible but unverified details as facts.
5. If a material product/design choice or user-owned decision is missing, return to or apply `brainstorming`. Do not create a second interview process inside this skill.
6. If inspection cannot resolve a fact, mark it as an open question. Do not invent requirements, APIs, files, contracts, or call stacks to make the spec look complete.

Do not produce an implementation-ready spec until the context supports one. Clarification through `brainstorming` remains part of the current design stage; it does not create a new workflow stage.

## Explore credible designs

Describe only materially different alternatives. They must differ in ownership, interface shape, boundary placement, call/data flow, runtime topology, state model, or another decision that changes implementation or risk. Do not force an arbitrary number of options.

For each credible option, cover the parts that affect the decision:

- domain and state model;
- public or module contracts;
- boundary and adapter placement;
- entrypoint-to-side-effect call stack;
- expected errors and failure ownership;
- transaction, concurrency, retry, cancellation, idempotency, authorization, and monitoring behavior when reachable;
- proof seams and operational fit;
- implementation cost and caller burden.

Choose the recommendation only after comparison. State why it is the simplest coherent design. Do not reopen a product/design choice already approved through `brainstorming` unless new evidence invalidates it.

## Specify concrete contracts

For every new, changed, or removed boundary, show the relevant code-shaped contract:

- domain values and state variants;
- inputs, outputs, request/response shapes, and expected errors;
- function signatures and public/module interfaces;
- adapter, protocol, persistence, and runtime-boundary shapes;
- ownership and what may or may not cross the boundary.

Use the project's primary language and local conventions for pseudocode. Use native type/interface constructs in statically typed projects. In dynamic-language projects, use language-appropriate records, protocols, schemas, and explicit invariants. For mixed-language systems, use each boundary's native language; use concise language-neutral record/schema notation only when the native language cannot express the boundary clearly. Do not force TypeScript syntax onto another project.

Prefer precise values over loose strings, booleans, nullable bags, or untyped maps when the real domain requires that precision. Do not invent branded types, adapters, interfaces, or abstractions without a demonstrated invariant, external boundary, ownership seam, reuse point, or testing need.

## Specify call stacks and data flow

Start with an affected-behavior inventory. Treat “full” as end-to-end coverage of those affected behaviors and real boundaries, not repository-wide architecture coverage. Every contract, call flow, file, and proof entry must map to that inventory.

For every affected behavior, trace the normal path from entrypoint to side effects and response. Include the values or types crossing each step.

Use current and proposed flows when behavior changes:

```text
raw input
  -> boundary request / unknown
  -> parser or decoder
  -> canonical application input
  -> owning service or module
  -> real adapter or side effect
  -> typed result or expected error
  -> response projection
  -> serialized output
```

Include failure, retry, cancellation, transaction, concurrency, idempotency, authorization, monitoring, and runtime-hop flows only when they are reachable. State where each responsibility is owned. Do not add generic defensive branches for states the real producer cannot create.

## Map implementation ownership

List files or modules likely to be added, changed, or removed. For each, name the contract, call-stack step, boundary, domain concept, adapter, migration, runtime configuration, or proof responsibility it owns.

These locations guide implementation and concurrent writer safety. They do not narrow or expand the user's behavioral approval boundary.

## Plan claim-bound behavioral proof

Load and apply `behavioral-proof`. This section plans future evidence; it must not claim that any check passed. Implementation and final verification own executed results.

For each material changed claim, identify:

- the exact changed claim and unchanged behavior;
- the normal reachable entrypoint and canonical owner;
- the smallest evidence that could disprove a wrong implementation;
- whether the evidence is test-first, characterization, reproduction, existing coverage, integration, live, manual, or non-behavioral validation;
- why the selected evidence is sufficient;
- the focused command or user flow and expected observation;
- broader checks justified by shared risk;
- important failure/boundary coverage;
- any unavailable boundary and the resulting limitation.

Do not require red-green-refactor universally. Use a failing test first only when it is the best evidence for genuinely new behavior. Do not invent tests for wording, mechanical work, implementation details, or impossible internal states.

## Required output

Use this outline when the sections are material. Omit sections that truly do not apply, but do not omit changed contracts or call/data flows merely because they are difficult to specify.

```markdown
# <Title>

## Spec Status and Evidence Boundary
## Summary and Decision
## Context and Current State
## Affected Behaviors
## Goals
## Non-Goals
## Invariants and Constraints
## Alternatives Considered
## Recommendation
## Proposed Design
### Domain Model and Contracts
### Interfaces, APIs, and Expected Errors
### Boundaries, Adapters, and Ownership
## Call Stacks and Data Flow
### Current Flow
### Proposed Flow
### Failure and Operational Flows
## Files and Modules
## Claim-Bound Behavioral Proof Plan
## Risks and Open Questions
```

When used by `manager-workflow`, also satisfy that workflow's proposal requirements, including previous/proposed behavior, observable consequences, material assumptions and risks, unchanged behavior, verification/review strategy, behavioral authorization boundary, exclusions, stop conditions, and the next separately authorized action. `manager-workflow` presents the reviewed final proposal and asks the single approval question.

## Writing rules

- Use code-shaped contracts to define what changes; use prose to explain why.
- Use local vocabulary, architecture, errors, adapters, monitoring, runtime patterns, and test style after inspection.
- Keep one source of truth; point to a definition instead of restating it.
- Keep seams real and place each invariant at its canonical owner.
- State deletions and unchanged boundaries as clearly as additions.
- Keep unknowns open instead of filling gaps with plausible design.
- Compress presentation without removing information needed for the decision.
- If a normally expected section is inapplicable, omit it and state the reason in one line rather than emitting boilerplate.
- Return the complete proposal inline. A user-requested or workflow-useful `.scratch/` artifact may preserve detail but never replaces the complete chat presentation.

## Completion

A tech spec is complete when another engineer can identify the chosen architecture, every changed contract and owner, each affected end-to-end call/data flow, the likely implementation locations, the selected proof for each material claim, and every unresolved decision without having to invent design.
