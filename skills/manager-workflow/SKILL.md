---
name: manager-workflow
description: Owns approval, stage flow, execution boundaries, and progress for nontrivial or material implementation work. Use for features, refactors, migrations, services, or architecture changes.
---

# Manager Workflow

## Approval model

Classify the work by behavior and decision risk, not file count.

### Trivial and unambiguous

Proceed from the direct request when the behavior, owner, scope, and verification are clear and no material choice remains. State a concise objective, non-goals, and verification target. Do not add ceremony merely because several mechanical files participate.

### Nontrivial or material

Before tracked/source/config mutation:

1. Present the complete decision-ready draft in chat.
2. Launch asynchronous plan review while the draft remains inspectable.
3. Inspect and synthesize the reviewer evidence.
4. Present the complete revised plan and every material delta.
5. Ask for implementation approval only on that reviewed plan.

The proposal includes:

- recommendation, observable outcome, previous behavior, and proposed delta;
- complete material phases plus changed and unchanged behavior;
- why it is the simplest coherent option, meaningful alternatives, and why rejected;
- every material assumption, uncertainty, risk, tradeoff, reversibility concern, and safer alternative;
- evidence, failed/unexecuted checks, verification and review strategy, and focus points;
- the exact behavioral authorization boundary, exclusions, stop conditions, next separately authorized action, and one focused approval question.

A saved plan can preserve implementation detail, but the complete proposal must remain in chat.

### Task contract

Before mutation, bind the current request and latest correction to:

- observable behavior and non-goals;
- repository root/worktree and likely implementation owners;
- proof strategy and focused checks;
- behavioral approval boundary and protected-action stops.

Approval binds behavior, outcome, non-goals, material risks, and stop conditions—not exact files, ranges, or line budgets. Those remain optional implementation or concurrent-writer controls. Implement the smallest coherent solution at the canonical owner. Ask before any material expansion, new behavior/API/dependency/config/security/data decision, compatibility path, unexpected persistent artifact, or protected action. Reviewer and diagnostic findings are evidence, not authority.

A later user correction supersedes conflicting terms and stale child work. When the corrected direction is nontrivial/material, re-present and review the amended proposal before mutation resumes.

## Stage flow

For nontrivial or material work:

1. **Design/plan:** visible draft → asynchronous review → complete revised plan → implementation approval.
2. **Implementation:** complete the approved behavior and focused checks; report the stage, evidence, discoveries, and remaining boundaries; continue automatically into review/fix.
3. **Independent review/fix:** enter independent review after the implementation batch and follow `review` for initial fanout and proportionate post-fix follow-up. Apply only validated mechanically local, non-material fixes inside the approved behavior. A final `PASS` requires every accepted primary in-scope `must-fix` and `should-fix` to be fixed or explicitly user-deferred; optional/background quality exploration remains nonblocking. Report the review/fix result visibly, then continue without another approval wait unless a material decision or named milestone requires one.
4. **Final verification:** run all relevant read-only evidence after the last edit. Put temporary files under `.scratch/`. Report `PASS`, `FAIL`, or `INCONCLUSIVE`, then stop and await user direction.
5. **Mutating validation, commit, deploy, rollout, external mutation, or destructive action:** require separate authorization unless the exact action was already approved. Name the target, action, expected effects, credential/data boundary, and cost/time boundary.
An extra milestone is a wait only when the decision-ready proposal names it and the user approves it. A new material choice interrupts the affected stage; individual tasks, children, edits, reviews, and safe checks are not approval checkpoints.

## Progress and continuity

For nontrivial work, report at approval/final-result boundaries, material discoveries/blockers, requested updates, and the start of every distinct material work group or stage. Do not narrate tools or skipped groups. Keep the plan/status inspectable while asynchronous work runs.

Use the native TODO as the concise routing card: claim it when active, update it only when objective, blocker, or next action materially changes, and close it only when work is actually complete. When complex execution needs more mutable detail, use one ignored `.scratch/sessions/` record with the current stage, evidence links, changed assumptions, blockers, unverified boundaries, and next action. After continuation or compaction, recover that state, the approved plan, unresolved child state, and the latest user correction before resuming. Do not create tracked progress files unless the project already requires one or explain continuity using internal token/context-pressure rationale.

## Workflow Skill Routing

Load or apply these skills when their trigger fits:

- Vague idea, behavior shape, design, or placement → `brainstorming`.
- Architecture-heavy design, or an ordinary-language request for a full typed spec → `tech-spec` inside this workflow's existing design/plan stage.
- Approved work needing a durable task plan that the user explicitly requested or that is materially useful for continuity or execution → `writing-plans`.
- Material behavior evidence strategy → `behavioral-proof`.
- Tests, helpers, fixtures, mocks, or test-review feedback → `writing-tests`.
- Bug, failure, crash, flake, or unexpected output → `systematic-debugging`, then `behavioral-proof` for the fix.
- Code/spec/plan review or review-feedback evaluation → `review`; use `delegation` to dispatch the selected roles.
- Before done/fixed/passing/ready claims → `verification-before-completion`.

Do not stack blocking workflows on trivial mechanical work.

## Tech-spec routing

`manager-workflow` decides when a tech spec is needed. If a material product or design choice is unresolved, use `brainstorming` first. Load `tech-spec` only when the intent is clear enough for architecture work.

Then load `tech-spec` automatically when architecture detail can materially change the decision, including:

- a change crossing a material ownership or data-flow boundary;
- public APIs, schemas, protocols, persistence models, migrations, or external integrations;
- transactions, concurrency, retries, cancellation, idempotency, authorization flow, or shared state machines;
- several credible architectures with different contracts, seams, or runtime topology.

Also load it when the user asks for a tech spec in ordinary language.

Do not activate it automatically only because work is nontrivial or touches several files. Skip it for small local fixes, wording or style changes, mechanical refactors, simple config edits, isolated test corrections, isolated bug fixes with a clear owner and proof path, ordinary implementation with no changed boundary, review/verification/test-only work that introduces no architecture, and clearly single-owner changes unless the user asks.

When active:

- inspect current code and docs before specifying contracts or call stacks;
- use `tech-spec` for the architecture body of the existing decision-ready proposal;
- keep the visible draft, asynchronous plan review, revised proposal, and single implementation approval required by this workflow;
- use `behavioral-proof` for relevance-based evidence rather than imposing universal test-first work;
- include enough implementation ownership and proof sequencing in the reviewed tech spec to proceed after the single approval.

Do not route an approved tech spec through `writing-plans` as a second approval flow. A separate later user request for a durable implementation plan remains governed by the existing `writing-plans` workflow.

The tech spec does not create another stage, approval wait, or implementation authority.

## Delegation

Load `delegation` for nontrivial work unless delegation is unavailable or prohibited.

- This skill owns approval, stage timing, progress, and execution boundaries.
- `delegation` owns role selection, parent-child write boundaries, async handling, MCP routing, and supervisor coordination.
- `review` owns reviewer count, packets, finding partitions, synthesis rules, and post-fix follow-up.
- The Pi Subagents package owns dispatch, chains, async execution, and agent discovery.
- Enter review requests through `review`, vague design requests through `brainstorming`, and implementation work through this skill.

## Implementation

Before editing, identify:

- the observable behavior;
- its normal entrypoint and canonical owner;
- the approved non-goals and protected boundaries;
- the smallest proof that could disprove a wrong implementation.

The parent assigns bounded coherent implementation tasks to `clone` and directly reads every file or symbol it edits and every completed clone diff. The parent retains user communication, decisions, integration, and verification.

For each coherent edit group:

1. implement the smallest approved change at the existing owner;
2. run applicable static, discovery, or diagnostic evidence;
3. inspect the effective diff;
4. stop for stale evidence, a material scope conflict, or a protected action.

Run focused unit tests after the complete implementation batch unless one test-first reproduction is the clearest proof. Report the implementation evidence and continue automatically into review/fix.

## Review and completion

After nontrivial implementation, enter the independent review stage. `review` selects the initial fanout and the proportionate follow-up after fixes. The parent validates findings, directs eligible in-scope fixes to the current task owner, and asks before material expansion.

A final `PASS` requires every accepted primary `must-fix` and `should-fix` finding to be fixed or explicitly deferred by the user. Stop when review is clean, only incidental feedback remains, evidence blocks progress, or a new approval boundary appears.

After the last edit and review fix, run all relevant read-only verification. Verify child claims from actual output, diffs, or rerun checks. Put temporary files under `.scratch/`.

Update a GitHub PR description only when the user explicitly requests that exact external mutation. Otherwise provide draft text.

## Stop Conditions

Stop instead of improvising when:

- requirements conflict
- the approved plan is wrong
- a human review trigger activates
- implementation needs an unapproved product or architecture decision
- tests fail repeatedly and root cause is unclear
- a tool or plan asks for mutating git commands

Present the evidence and ask one focused question.
