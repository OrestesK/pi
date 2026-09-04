---
name: manager-workflow
description: Use for managing implementation work through proposal, approval, execution, and review
---

# Manager Workflow

## What to show the user

Before asking the user to approve implementation, prepare and review the detailed plan. Then explain the proposed work in short, plain language

Tell the user:
- what you recommend and why
- what will change
- what you are assuming or still do not know
- the main risks and how you will check the result
- what will not change
- exactly what their approval allows

Include only details that help the user decide. Keep commands, file-by-file steps, and other execution details in the saved plan unless the user asks for them or they affect the decision

Do not replace this explanation with a plan path, file summary, hash, review result, or progress report. End with one focused question

### Define the task contract

Before mutating anything, use the current request and latest correction to define:
- observable behavior and non-goals
- repository root, active worktree when applicable, and likely implementation owners
- proof strategy and focused checks
- the approval boundary and protected-action stops

Implementation approval covers the observable result, non-goals, relevant risks, behavioral boundaries, and stop conditions. Global `Authorization` rules separately govern protected actions. File lists, ranges, and line budgets are optional controls for implementation or concurrent writers. Put the smallest coherent change in its canonical owner. Treat reviewer and diagnostic findings as evidence, not authority

A later user correction replaces conflicting terms and makes affected child work stale. When the correction changes the approved result, boundaries, or proof, show and review the amended proposal before mutating again

### Keep the stage and findings visible

When you enter this workflow, whenever you enter a manager stage, and after a user correction, give the normal progress update. Name the current stage and approval or decision status. After a correction, also say what was dropped or superseded. Use one update
do not send an extra status or acknowledgement message. Do not wait unless a decision is needed

Before a child, reviewer, diagnostic, or tool finding changes the plan or active work, apply the global three-way finding classification
- Only a required fix may enter automatic work
- Keep a user choice inactive until it is presented with a recommendation, evidence, and material pros and cons, then approved
- Reject unsupported, speculative, generic, stylistic, conflicting, or unrelated suggestions

## Stage flow

When this workflow is active:
1. **Design/plan:** complete and review the proposal described above, then enter implementation when approved
2. **Implementation:** complete the approved behavior and focused checks
   report the stage, evidence, discoveries, and remaining boundaries
   continue automatically into review/fix
3. **Independent review/fix:** Enter review after the implementation batch
   reviewers whose exact targets were ready may already be running
   Follow `review` for method, fanout, review decisions, and proportionate post-fix follow-up
   Complete its current coverage and required-finding gate and report the result visibly
   Continue automatically only for required corrections inside the approved contract
   Present every validated user choice before final evidence and do not implement it without approval
4. **Final evidence:** After the last edit and completed review, follow the Main integration and completion rules. Then report the result and anything not verified
5. **Protected action:** follow the active global instructions already in context, specifically the authorization policy
   do not proceed until the exact action is authorized

An extra milestone is a wait only when the decision-ready proposal names it and the user approves it. A new choice that changes the approved result, boundaries, or proof interrupts the affected stage
individual tasks, children, edits, reviews, and safe checks are not approval checkpoints

A validated user choice is a wait before final completion, not an implementation defect or authorization to make the change

## Manager-local handoffs

The global `Workflow routing` rules choose which workflow to start

While a manager stage is active, completed handoffs from these skills return here:
- `brainstorming`
- `writing-plans`
- `behavioral-proof`
- `writing-tests`
- `systematic-debugging`
- `review`

These handoffs do not create another implementation-approval path

Do not start this workflow for mechanical work that needs no proposal or implementation approval

## Planning

Use `writing-plans` when the user asks for a specification or plan, architecture detail can change the decision, or a durable execution plan is useful

Architecture detail can matter for ownership or data-flow boundaries, public contracts, persistence, external integrations, shared state, concurrency, retries, authorization, or meaningfully different designs

Use `brainstorming` first when product or design intent is still open. Planning stays inside the current design stage and returns here when complete. It does not add another review, approval, or implementation owner

Skip `writing-plans` for simple, mechanical, or clearly single-owner work unless the user asks for a plan

## Orchestration

Use the `Subagents, Parallelization, and Asynchronous Work` section in `AGENTS.md` for parent/child authority and runtime mechanics. This workflow decides when implementation and review start

It does not choose roles, topology, async handling, MCP routing, supervisor coordination, or review method

## Implementation

Before editing, identify:
- the observable behavior
- the normal entrypoint and canonical owner
- approved non-goals and protected boundaries
- the smallest proof that could disprove a wrong implementation

Follow the global implementation invariants, parent/child authority, and changed-file inspection

For each coherent edit group:
1. Make the smallest approved change at the existing owner
2. Run the discovery checks needed for the current change
3. Inspect the effective diff
4. Stop when evidence is stale, scope conflicts with the approved result or boundaries, or a protected action is needed

Complete the approved implementation batch, collect applicable evidence, report the implementation result, then continue automatically into review/fix

## Review and completion

After the approved implementation batch, enter the independent review stage. Follow `review` for method, current coverage, review decisions, and completion of its required-finding gate. The manager owns only this stage transition and the decision to proceed after review

Do not enter final evidence until:
- every required review angle has current usable coverage
- every validated required finding is fixed or explicitly deferred by the user
- every validated user choice has been presented and decided

After the last edit and completed review, follow the Main integration and completion rules in `AGENTS.md`. These include authorization, child-claim verification, changed-file inspection, and artifact policies

Update a GitHub pull-request description only when the user explicitly requests that exact external mutation. Otherwise provide draft text

## Stop Conditions

Stop instead of improvising when:
- requirements conflict
- the approved plan is wrong
- a human review trigger activates
- implementation needs an unapproved product or architecture decision
- tests fail repeatedly and root cause is unclear
- a tool or plan asks for mutating git commands

Present the evidence and ask one focused question
