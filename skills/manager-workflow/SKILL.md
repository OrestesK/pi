---
name: manager-workflow
description: Owns approval, stage flow, execution boundaries, and progress for nontrivial implementation work. Use for features, refactors, migrations, services, architecture changes, or multi-step implementation.
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

A `.scratch/plans/` artifact may preserve implementation detail but never replaces this presentation. Avoid tables in generated plan artifacts; direct UI/chat may use one only when materially clearer.

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
3. **Independent review/fix:** run at least three fresh parallel reviewers with distinct evidence targets. Apply automatically validated, mechanically local, non-material fixes inside the approved behavior. A final `PASS` requires every accepted primary in-scope `must-fix` and `should-fix` to be fixed or explicitly user-deferred; optional/background quality exploration remains nonblocking. Freshly re-review meaningful behavior, correctness, architecture, or proof fixes; tiny mechanical fixes may use direct parent final-diff inspection. Report the review/fix result visibly, then continue without another approval wait unless a material decision or named milestone requires one.
4. **Final verification:** run safe, bounded, local, non-expensive claim-bound evidence after the last relevant edit; bounded disposable repository-local verification state is allowed, but source/config/dependency/real-data/external/system changes are not. Report `PASS`, `FAIL`, or `INCONCLUSIVE`; stop and await user direction.
5. **Live/external/expensive validation, commit, deploy, rollout, external mutation, or destructive action:** require separate authorization unless the exact protected action was already approved. Authorization names the target/environment, exact workflow/action, permitted effects, credential/data boundary, and cost/time boundary.

An extra milestone is a wait only when the decision-ready proposal names it and the user approves it. A new material choice interrupts the affected stage; individual tasks, children, edits, reviews, and safe checks are not approval checkpoints.

## Progress and continuity

For nontrivial work, report at approval/final-result boundaries, material discoveries/blockers, requested updates, and the start of every distinct material work group or stage. Do not narrate tools or skipped groups. Keep the plan/status inspectable while asynchronous work runs.

Use the native TODO as the concise routing card: claim it when active, update it only when objective, blocker, or next action materially changes, and close it only when work is actually complete. When complex execution needs more mutable detail, use one ignored `.scratch/sessions/` record with the current stage, evidence links, changed assumptions, blockers, unverified boundaries, and next action. After continuation or compaction, recover that state, the approved plan, unresolved child state, and the latest user correction before resuming. Do not create tracked progress files unless the project already requires one or explain continuity using internal token/context-pressure rationale.

## Workflow Skill Routing

Load or apply these skills when their trigger fits:

- Vague idea, behavior shape, design, or placement → `brainstorming`.
- Approved complex work needing a durable task plan → `writing-plans`.
- Material behavior evidence strategy → `behavioral-proof`.
- Tests, helpers, fixtures, mocks, or test-review feedback → `writing-tests`.
- Bug, failure, crash, flake, or unexpected output → `systematic-debugging`, then `behavioral-proof` for the fix.
- Code/spec/plan review or review-feedback evaluation → `review`; use `pi-subagents` for detailed fanout.
- Before done/fixed/passing/ready claims → `verification-before-completion`.

Do not stack blocking workflows on trivial mechanical work.

## Subagent Recipe Routing

`pi-subagents` owns detailed natural-language recipe routing, prompt shortcut semantics, and proposal-verification mechanics. Do not duplicate its full recipe matrix here.

Implementation-specific routing rules:

- `manager-workflow` owns approval, stage flow, write safety, progress, and execution batching. It does not own detailed child orchestration.
- Load `pi-subagents` for all nontrivial work unless delegation is concretely unavailable or prohibited. Read-only/advisory children support investigation and decision quality; parent implementation remains normal.
- Enter review requests through `review`, vague product/design requests through `brainstorming`, and implementation work through this skill before applying any write-capable subagent recipe.
- Apply review fixes only under the approved behavioral review/fix boundary. The parent normally performs each coherent fix pass, followed by at least three fresh independent reviewers of the resulting effective change.
- For every nontrivial proposal, show the draft before asynchronous proposal review, inspect the gate, integrate supported findings, and re-present the complete revised plan before implementation approval.
- The parent normally implements approved work directly. A write child is permitted when at least two independent implementation areas can proceed concurrently in the shared checkout, with the parent owning one area, or under the narrow quality-worker exception below.
- **Narrow quality-worker exception:** after the parent validates a simple, behavior-preserving, non-material cleanup/quality fix inside the approved boundary, one worker may own its exact coherent, exclusive assignment—including multiple files—while the parent continues independent non-overlapping work. The parent inspects, integrates, and verifies the result.

## Delegation Rules

### Approved implementation batch

Before execution:

- read the approved proposal/plan and current instructions;
- re-check assumptions and the real behavior owner;
- confirm the approved behavior/non-goals, proof surface, protected boundaries, and stop condition;
- identify likely implementation owners without treating their file list as the user approval boundary;
- stop for stale evidence or a material scope/behavior conflict.

For each coherent edit group, implement the smallest approved behavior, run applicable non-unit static/discovery proof that can detect drift, inspect the effective change, and record material results. Run unit tests after the complete implementation batch, except for one deliberately selected focused reproduction/test-first check when it is the most efficient proof. After the batch and focused checks, report the stage, evidence, discoveries, and remaining boundaries, then continue automatically into independent review/fix.

### Subagent Execution Policy

For exceptional write execution with subagents:

- Use write workers when at least two independent implementation areas will run concurrently in the shared checkout and the parent owns one area, or use one worker under the narrow quality-worker exception. Every worker receives an exclusive, non-overlapping file list.
- Give every write child an exact edit packet: assigned files and symbols, required behavior, non-goals, selected proof strategy, validation commands and evidence, and prohibited product/API/compatibility/scope decisions.
- Require each child to stop before touching an unassigned file and contact the parent only for a real blocker, discovered file overlap, or an unapproved product/API/compatibility/scope decision.
- Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active.
- Workers write summaries to `.scratch/` or explicit output paths. The parent inspects their diffs, integrates their changes, and verifies the combined result.
- Dispatch read-only `reviewer` agents after implementation:
  1. spec compliance review against the approved task/design,
  2. code quality review when needed.
- The parent applies validated primary in-scope `must-fix` and accepted `should-fix` findings that directly support the task intent and stay within approved boundaries, then re-reviews meaningful fixes. `PASS` requires those accepted findings fixed or explicitly user-deferred. Route material expansion through the active decision mode above. Use write children for fixes only under the concurrent-write contract or narrow quality-worker exception.
- Continue focused fixes only while each attempt tests a supported root-cause hypothesis and produces material progress. Stop when failures repeat, progress stalls, evidence invalidates the plan, or a material/protected boundary is reached; then route the next decision through the active decision mode above.

### Research Phase

- For nontrivial, ambiguous, high-impact, externally grounded, or multi-step work, use quality-first fanout by default. Treat fanout as the normal planning substrate, not an exceptional escalation.
- Route ordinary user language to the matching `pi-subagents` recipe; the user does not need to name a slash command. Keep detailed recipe examples in the `pi-subagents` skill so this workflow does not become a second routing authority.
- Dispatch scout agents for codebase exploration.
- Scouts can run in parallel when their scopes and evidence targets are distinct; size the group from the actual independent surfaces.
- Give each child a distinct angle and output contract; avoid duplicate vague agents.
- For parallel scouts, pass `output: false` for concise findings or give every scout an explicit unique output path. Do not rely on a shared default artifact path.
- Scouts return findings inline or through parent-managed `.scratch/research/` output artifacts only when an explicit unique output path is provided.
- Read scout/research findings before planning.

### Implementation Phase

Before editing behavior, identify the behavior owner:

- Observable behavior: what user/system-visible behavior should change?
- Normal entrypoint: what command, route, UI action, function, job, or workflow exercises it?
- Canonical owner: which existing module/component owns this behavior today?
- Proof surface: what focused check would prove the behavior changed?

Do not start from helper or abstraction design. Start from the existing owner path and observable behavior.

- The parent normally implements approved changes and directly reads the precise files and symbols it edits.
- Use write workers only under the exceptional concurrent-write policy or narrow quality-worker exception above.
- Give every write worker an exact edit packet: current task-contract revision, assigned files and baseline symbols/ranges, required behavior, non-goals, selected proof strategy, validation commands and evidence, and prohibited product/API/compatibility/scope decisions.
- If the edit packet cannot specify those boundaries exactly, or its revision is stale, go back to planning.
- Concurrent writers must have exclusive, non-overlapping file lists. Each child stops before an unassigned file and communicates only a real blocker, discovered overlap, or an unapproved product/API/compatibility/scope decision.
- Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active.
- The parent and workers run focused checks; the parent inspects and integrates worker diffs, then verifies the combined result.
- Workers write results to `.scratch/`, not back to main context.

### Review Phase

- Dispatch at least three fresh parallel read-only reviewers after nontrivial implementation. Skip review only for truly trivial work, an explicit no-review constraint, or a concrete unavailable evidence surface that is reported.
- Give every reviewer the approved behavior, non-goals, relevant decisions, actual target/effective change, required proof and available evidence, one distinct angle/evidence target, and a stop condition.
- Select at least three genuinely distinct primary angles from the actual risk surfaces; add security, ops/resource, UX, architecture, or other specialists only when relevant.
- Reviewers never edit or become writers. Use `/parallel-review` or `/quality-gate` patterns through `subagent(...)` when they fit.
- Reviewer output separates primary in-scope required findings, incidental material adjacent risks, and incidental optional cleanup/polish. Reviewers actively hunt only the primary assigned scope unless cleanup/adjacent analysis was explicitly requested as primary.
- The parent validates each candidate's scope, producer/reachability, impact, proof, and behavior preservation before disposition; it synthesizes `PASS`, `FAIL`, or `INCONCLUSIVE` rather than blindly applying suggestions.
- Automatically apply only validated, mechanically local, non-material fixes inside the approved behavior, then run at least three fresh reviewers again. Continue while a round produces material progress; stop clean, incidental-only, stalled/repeated, blocked, or approval-gated—not at an arbitrary round count.
- Findings cannot amend material scope. Ask before new behavior, public/API contracts, dependencies, compatibility, security/data decisions, unexpected persistent artifacts, or another approval boundary.

### Completion Phase

- Run safe, bounded, local, non-mutating, non-expensive required checks automatically and report evidence.
- Verify worker/subagent claims from actual output, diffs, or rerun checks before reporting completion.
- If the current branch has an open PR and the user explicitly asks to update the PR description/body, load the github skill and update only that PR description/body with what changed and how it was tested.
- Without an explicit user request for that exact PR description/body update, draft suggested PR text instead of mutating GitHub.
- When performing a requested PR body update, merge or append; never overwrite unrelated content.

## .scratch/ Workspace

Use `.scratch/` for workflow artifacts when artifact creation is allowed and useful. Ensure it exists and is gitignored before workflows that require persistent plans, research, reviews, sessions, or run logs. Do not make unrelated setup edits such as adding `.scratch/` to `.gitignore` during a feature change unless the user approves or the edit is required for the requested change. If a required workflow needs persistent artifacts but the task forbids artifacts, stop and ask whether to relax the constraint.

Organized:

- `research/` — scout findings
- `plans/` — draft-for-approval and approved plans with [ASSUMPTION] annotations
- `reviews/` — reviewer output
- `sessions/` — session state for continuation
- `runs/` — long-running command logs/status when artifacts are allowed

Quick lookups stay in context. Deeper research goes to files.
Check for existing .scratch/ files before re-researching.

## Stop Conditions

Stop instead of improvising when:

- requirements conflict
- the approved plan is wrong
- a human review trigger activates
- implementation needs an unapproved product or architecture decision
- tests fail repeatedly and root cause is unclear
- a tool or plan asks for mutating git commands

Present the evidence and ask one focused question.
