---
name: manager-workflow
description: Owns decision-ready proposal contents, stage flow, execution boundaries, and manager-local handoffs for nontrivial or material implementation work.
---

# Manager Workflow

## Decision-ready proposal

The active global instructions already in context own work classification through the global work-classification policy. The `Approval` section specifically owns the exact visible draft → asynchronous review → complete revised proposal → implementation approval sequence. When that sequence activates this skill, the proposal includes:

- recommendation, observable outcome, previous behavior, and proposed delta
- complete material phases plus changed and unchanged behavior
- why it is the simplest coherent option, meaningful alternatives, and why rejected
- every material assumption, uncertainty, risk, tradeoff, reversibility concern, and safer alternative
- evidence, failed or unexecuted checks, verification and review strategy, and focus points
- the exact behavioral authorization boundary, exclusions, stop conditions, next separately authorized action, and one focused approval question

A saved plan can preserve implementation detail, but the complete proposal must remain in chat.

### Task contract

Before mutation, bind the current request and latest correction to:

- observable behavior and non-goals
- repository root, active worktree when applicable, and likely implementation owners
- proof strategy and focused checks
- behavioral approval boundary and protected-action stops

The active global instructions already in context, specifically the `Approval` section, define approval scope and when material expansion or a protected action requires a stop. Exact files, ranges, and line budgets remain optional implementation or concurrent-writer controls. Implement the smallest coherent solution at the canonical owner. Reviewer and diagnostic findings are evidence, not authority.

A later user correction supersedes conflicting terms and stale child work. When the corrected direction is nontrivial/material, re-present and review the amended proposal before mutation resumes.

## Stage flow

For nontrivial or material work:

1. **Design/plan:** complete the proposal and the approval sequence in the `Approval` section of the active global instructions already in context, then enter implementation when approved
2. **Implementation:** complete the approved behavior and focused checks; report the stage, evidence, discoveries, and remaining boundaries; continue automatically into review/fix
3. **Independent review/fix:** enter review after the implementation batch and follow `review` for method, fanout, finding disposition, and proportionate post-fix follow-up. Complete its required finding gate, report the result visibly, then continue without another approval wait unless a material decision or named milestone requires one
4. **Final verification:** after the last edit and completed review, follow `verification-before-completion`, report `PASS`, `FAIL`, or `INCONCLUSIVE`, then stop and await user direction
5. **Protected action:** follow the active global instructions already in context, specifically the authorization policy; do not proceed until the exact action is authorized

An extra milestone is a wait only when the decision-ready proposal names it and the user approves it. A new material choice interrupts the affected stage; individual tasks, children, edits, reviews, and safe checks are not approval checkpoints.

## Progress and continuity

Follow the active global instructions already in context, specifically the progress, TODO, continuity, and `.scratch/` policies. This workflow adds only the current manager stage, approval status, evidence links, changed assumptions, blockers, unverified boundaries, and next action when a complex `.scratch/sessions/` record is needed.

## Manager-local handoffs

The active global instructions already in context, specifically the `Workflow routing` section, own the workflow-routing map. Inside an active manager stage, applicable `brainstorming`, `tech-spec`, `writing-plans`, `behavioral-proof`, `writing-tests`, `systematic-debugging`, `review`, `delegation`, and verification handoffs return to this workflow; they do not create another implementation-approval path. Do not stack blocking workflows on trivial mechanical work.

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

Follow the delegation-trigger policy in the active global instructions already in context and the parent/child authority boundary specifically defined in their `Orchestration boundary` section, then load and follow `delegation` for execution mechanics. This workflow decides when the implementation and review stages dispatch work; it does not redefine role selection, topology, async handling, MCP routing, supervisor coordination, or review method.

## Implementation

Before editing, identify the observable behavior, normal entrypoint and canonical owner, approved non-goals and protected boundaries, and the smallest proof that could disprove a wrong implementation.

Follow the active global instructions already in context, specifically the implementation invariants, parent/child authority, changed-file inspection, and test-timing policies.

For each coherent edit group:

1. implement the smallest approved change at the existing owner
2. run applicable static, discovery, or diagnostic evidence
3. inspect the effective diff
4. stop for stale evidence, a material scope conflict, or a protected action

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
