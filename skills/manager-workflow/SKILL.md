---
name: manager-workflow
description: Use for managing implementation work through proposal, approval, execution, and review
---

# Manager Workflow

## Decision-ready proposal

Use the global work-classification rules already in context. Their `Approval` section defines the sequence: show a draft, review it asynchronously, show the complete revised proposal, then obtain approval to implement.

When that sequence sends work here, include:

- the recommendation, expected outcome, previous behavior, and proposed change
- all material phases and what changes or stays the same
- why this is the simplest coherent option, the meaningful alternatives, and why they were rejected
- every material assumption, uncertainty, risk, tradeoff, reversibility concern, and safer alternative
- evidence, failed or unexecuted checks, the verification and review plan, and review focus points
- the exact authorization boundary, exclusions, stop conditions, next separately authorized action, and one focused approval question

A saved plan can preserve implementation detail, but the complete proposal must remain in chat.

### Define the task contract

Before mutating anything, use the current request and latest correction to define:

- observable behavior and non-goals
- repository root, active worktree when applicable, and likely implementation owners
- proof strategy and focused checks
- the approval boundary and protected-action stops

Use the global `Approval` rules to decide what approval covers and when a material expansion or protected action must stop. File lists, ranges, and line budgets are optional controls for implementation or concurrent writers. Put the smallest coherent change in its canonical owner. Treat reviewer and diagnostic findings as evidence, not authority.

A later user correction replaces conflicting terms and makes affected child work stale. If the correction is nontrivial or material, show and review the amended proposal before mutating again.

### Keep the stage and findings visible

At the start of material work, whenever you enter a manager stage, and after a user correction, give the normal progress update. Name the current stage and approval or decision status. After a correction, also say what was dropped or superseded. Use one update; do not send an extra status or acknowledgement message. Do not wait unless a decision is needed.

Before a child, reviewer, diagnostic, or tool finding changes the plan or active work, state which goal assumption it relies on. State whether it is necessary for the approved outcome or adds scope. Reject unrelated suggestions. Ask before adopting an unclear assumption or added behavior, scope, tests, compatibility work, or cleanup. Do not make rejected or deferred suggestions active work.

## Stage flow

For nontrivial or material work:

1. **Design/plan:** complete the proposal and the approval sequence in the `Approval` section of the active global instructions already in context, then enter implementation when approved
2. **Implementation:** complete the approved behavior and focused checks; report the stage, evidence, discoveries, and remaining boundaries; continue automatically into review/fix
3. **Independent review/fix:** enter review after the implementation batch and follow `review` for method, fanout, finding disposition, and proportionate post-fix follow-up. Complete its required finding gate, report the result visibly, then continue without another approval wait unless a material decision or named milestone requires one
4. **Final verification:** after the last edit and completed review, follow `verification-before-completion`, report `PASS`, `FAIL`, or `INCONCLUSIVE`, then stop and await user direction
5. **Protected action:** follow the active global instructions already in context, specifically the authorization policy; do not proceed until the exact action is authorized

An extra milestone is a wait only when the decision-ready proposal names it and the user approves it. A new material choice interrupts the affected stage; individual tasks, children, edits, reviews, and safe checks are not approval checkpoints.

## Progress and continuity

Follow the global progress, continuity, and `.scratch/` rules. If complex work needs a `.scratch/sessions/` record, this workflow adds only evidence links, changed assumptions, blockers, and unverified boundaries. `Keep the stage and findings visible` owns current-stage and approval-status updates.

## Manager-local handoffs

The global `Workflow routing` rules choose which workflow to start. While a manager stage is active, applicable `brainstorming`, `tech-spec`, `writing-plans`, `behavioral-proof`, `writing-tests`, `systematic-debugging`, `review`, `delegation`, and verification handoffs return here when complete. They do not create another implementation-approval path. Do not stack blocking workflows on trivial mechanical work.

## Tech-spec routing

This skill decides when a tech spec is needed. If a material product or design choice is unresolved, use `brainstorming` first. Load `tech-spec` only when the intent is clear enough for architecture work.

Then load `tech-spec` automatically when architecture detail can materially change the decision, including:

- a change crossing a material ownership or data-flow boundary
- public APIs, schemas, protocols, persistence models, migrations, or external integrations
- transactions, concurrency, retries, cancellation, idempotency, authorization flow, or shared state machines
- several credible architectures with different contracts, seams, or runtime topology

Also load it when the user asks for a tech spec in ordinary language.

Do not activate it automatically only because work is nontrivial or touches several files. Skip it for small local fixes, wording or style changes, mechanical refactors, simple config edits, isolated test corrections, isolated bug fixes with a clear owner and proof path, ordinary implementation with no changed boundary, review/verification/test-only work that introduces no architecture, and clearly single-owner changes unless the user asks.

When active:

- inspect current code and docs before specifying contracts or call stacks
- use `tech-spec` for the architecture body of the existing decision-ready proposal
- keep the visible draft, asynchronous plan review, revised proposal, and single implementation approval required by this workflow
- use `behavioral-proof` for relevance-based evidence rather than imposing universal test-first work
- include enough implementation ownership and proof sequencing in the reviewed tech spec to proceed after the single approval

Do not route an approved tech spec through `writing-plans` as a second approval flow. A separate later user request for a durable implementation plan remains governed by the existing `writing-plans` workflow.

The tech spec does not create another stage, approval wait, or implementation authority.

## Delegation

Use the global delegation trigger and `Orchestration boundary` for parent/child authority. Then load `delegation` for execution mechanics. This workflow decides when implementation and review dispatch work. It does not choose roles, topology, async handling, MCP routing, supervisor coordination, or review method.

## Implementation

Before editing, identify:

- the observable behavior
- the normal entrypoint and canonical owner
- approved non-goals and protected boundaries
- the smallest proof that could disprove a wrong implementation

Follow the global implementation invariants, parent/child authority, changed-file inspection, and test-timing rules.

For each coherent edit group:

1. Make the smallest approved change at the existing owner
2. Run relevant static, discovery, or diagnostic checks
3. Inspect the effective diff
4. Stop when evidence is stale, scope conflicts materially, or a protected action is needed

Complete the approved implementation batch, collect applicable evidence, report the implementation result, then continue automatically into review/fix.

## Review and completion

After nontrivial implementation, enter the independent review stage and follow `review` for method, finding disposition, and completion of its required finding gate. The manager owns only this stage transition and the decision to proceed after review.

After the last edit and completed review, load and follow `verification-before-completion`. Follow the active global instructions already in context, specifically the authorization, child-claim verification, changed-file inspection, and artifact policies.

Update a GitHub pull-request description only when the user explicitly requests that exact external mutation. Otherwise provide draft text.

## Stop Conditions

Stop instead of improvising when:

- requirements conflict
- the approved plan is wrong
- a human review trigger activates
- implementation needs an unapproved product or architecture decision
- tests fail repeatedly and root cause is unclear
- a tool or plan asks for mutating git commands

Present the evidence and ask one focused question.
