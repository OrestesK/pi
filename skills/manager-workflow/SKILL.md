---
name: manager-workflow
description: Core delegation and workflow orchestration — 3-tier task routing with .scratch/ workspace. Use when asked to implement features, build systems, refactor code, create new services, migrate libraries, redesign architecture, or any multi-step implementation work.
---

# Manager Workflow

## Tier Assessment

Before starting any implementation, assess the tier and state the classification in chat.

For non-trivial work, the expanded workflow is:

```text
Clarify/Brainstorm → Plan → Approve → Execute → Verify → Review → Finish/Handoff
```

Use the added workflow skills as needed, but do not let them override this planning gate. The planning gate blocks edits, material choices, and unsafe execution; it does not block read-only advisory/recon/reflection subagents. If uncertain, spawn read-only advisors first, then ask the user instead of continuing with assumptions.

### Planning Gate

Do not edit code until the user approves if any of these are true:

- The user asks to "think where it lives", "decide where", "design", "architecture", or otherwise implies placement/design judgment.
- The change may touch more than one tracked file.
- The change requires tests or docs.
- The change introduces a new config flag, public parameter, environment variable, registry field, API surface, or behavior toggle.
- There are multiple plausible implementation locations.

For Tier 2 tasks, present a brief table with option, location/files, pros, cons, and recommendation. Include the expected test/verification strategy when known. Then ask for explicit approval.

Only Tier 1 may proceed without approval:

- One file
- Under ~20 changed lines
- No behavior/config/API surface decision
- No docs/tests needed
- Requirements are unambiguous

If unsure, classify as Tier 2.

Before the first mutating tool call, internally verify:

- [ ] Did I state the tier to the user?
- [ ] Is there any placement/design decision?
- [ ] Will this touch tests/docs/config?
- [ ] Did the user explicitly approve if Tier 2+?
- [ ] Is the current task intent or contract proportional to risk and bound to the latest user correction?
- [ ] Which TDD scenario applies if behavior changes?

If any answer requires approval, stop and ask. Do not continue into parent file edits, write-child dispatch, or multi-step execution while a material question is unresolved.

### Task Intent and Contract

Before the first source/config mutation, establish task intent proportional to risk. Use the `task_contract` tool when it is registered; until then, record the active direction in chat when it is not already clear from the request and approval.

For unambiguous Tier 1 work, the explicit request normally supplies authority. Use a concise objective, non-goals, and verification target; do not require another confirmation or invent exact line ranges and budgets merely to complete a template.

For Tier 2/3 work, state:

- requested behavior and observable outcome,
- explicit non-goals,
- repository root/worktree,
- expected files, behavior owners, and new persistent files when known,
- verification and review mode,
- approval boundaries and stop conditions.

Exact file/range envelopes and changed-line budgets are optional controls for user-requested strict scope, high-risk mutations, dirty-worktree isolation, or concurrent writers. They are not universal performance targets.

Implement the smallest coherent solution and investigate broadly enough to find the real owner. Necessary adjacent edits may proceed when they directly support the approved outcome and do not introduce new behavior, public/API contracts, dependencies, security/data decisions, or unexpected persistent files. Report them. Present a delta and obtain approval before material expansion.

Do not silently add unrelated refactoring or cleanup, new abstractions/frameworks, compatibility work, diagnostic-driven edits, dependency/config changes, or extra persistent files. Reviewer and tool findings are evidence to evaluate, not authority to broaden the task.

A later user correction supersedes conflicting task-intent or contract terms. Pause affected mutations, revise the active direction, and interrupt or reissue stale write children before continuing.

### Clarification Checkpoints

Pause for user clarification before continuing when:

- the next action would edit files and the scope is not explicitly approved,
- there are two or more plausible implementation paths,
- a task could be solved by changing behavior, tests, docs, config, or workflow and the intended target is unclear,
- the next step would dispatch a write child with broad instructions,
- a plan batch contains more than one task and the user has not approved that batch,
- new information invalidates or materially changes the approved plan.

Ask one focused question, preferably with options and a recommendation. Do not ask questions tools can answer.

### Tier 1 — Just Do It

- Single file, clear intent, < ~20 lines
- No discussion needed. Make the change, show what you did.
- Verify before claiming done.
- Examples: fix a type error, rename a variable, add an import

### Tier 2 — Talk First

- Multi-file or ambiguous intent
- Present what you'd change, where, and why. Get approval.
- Include test/verification strategy when behavior changes.
- No plan files unless the discussion shows the task is really Tier 3.
- Examples: add a new API endpoint, refactor a module, fix a bug touching 3+ files

### Tier 3 — Write It Down

- Architectural, > 5 files, new systems, irreversible
- Write plan to `.scratch/plans/YYYY-MM-DD-<slug>.md`
- Mark every assumption: **[ASSUMPTION: ...]**
- Present summary. Wait for explicit approval.
- The parent implements the approved plan. Use write children only when at least two independent implementation areas can proceed concurrently in the shared checkout, with the parent owning at least one area and every writer receiving an exclusive file list and exact edit packet.
- Examples: redesign a system, migrate libraries, build a new service

The user can always escalate. If they say "wait", "let's talk", or "hold on" — move up a tier.

## Workflow Skill Routing

Load or apply these skills when their trigger fits:

| Situation                                                   | Skill                                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Vague idea, new behavior, design/placement decision         | `brainstorming`                                                                                                   |
| Approved requirements need task breakdown                   | `writing-plans`                                                                                                   |
| New behavior or logic change                                | `test-driven-development`                                                                                         |
| Adding/changing tests, test helpers, fixtures, mocks, or test-review feedback | `writing-tests`; use `test-driven-development` too when changing behavior or fixing bugs |
| Bug, test failure, crash, flaky behavior, unexpected output | `systematic-debugging` first; use TDD for the fix after root cause is supported                                   |
| Code/spec/plan review or review feedback evaluation         | `review`; use `pi-subagents` reviewer fanout by default unless an explicit parent-only reason is stronger |
| Before done/fixed/passing claims                            | `verification-before-completion`                                                                                  |

Do not stack blocking workflow on tiny Tier 1 edits. Async advisory/recon/reflection subagents remain the default for hidden-risk checks, cleanup angles, and slack-time reflection when they can run without delaying the edit.

## Subagent Recipe Routing

`pi-subagents` owns detailed natural-language recipe routing, prompt shortcut semantics, and proposal-verification mechanics. Do not duplicate its full recipe matrix here.

Implementation-specific routing rules:

- `manager-workflow` owns visibility, tiering, approval, write safety, and execution batching. It does not decide whether read-only advisory/recon/reflection subagents should spawn.
- Load `pi-subagents` by default for nontrivial work, uncertainty, planning, review, research, handoff, cleanup, final-readiness pressure, or any waiting/slack period. Read-only/advisory children remain the default for broad investigation; parent implementation is normal.
- Enter review requests through `review`, vague product/design requests through `brainstorming`, and implementation work through this skill before applying any write-capable subagent recipe.
- Apply fixes from review feedback only when the user explicitly authorizes writing; the parent normally performs each fix pass, followed by fresh read-only review.
- If the user asks to verify or pressure-test a parent proposal before implementation, complete and inspect the proposal gate before scouting implementation locations or starting implementation.
- The parent normally implements approved work directly. A write child is permitted only when at least two independent implementation areas can proceed concurrently in the shared checkout, with the parent owning at least one area and every writer receiving an exclusive, non-overlapping file list and exact edit packet.

## Delegation Rules

### Plan Execution Batches

Before executing an approved plan:

- Read the full plan.
- Re-check it against current code and project instructions.
- Stop if assumptions are stale, unsafe, or incomplete.
- Confirm approved batch scope before executing more than one task.

Default batch size:

- 1 task for risky, ambiguous, tightly coupled, or newly clarified work.
- Up to 3 tasks only for low-risk independent work when the user approved that batch size.

Progress tracking:

- Use `todo` for multi-session or user-visible state.
- Use `.scratch/sessions/` for local progress.
- Use repo-local `progress.md` only when explicitly instructed or already established.
- Do not create tracked progress files unless the project already uses them.

For each task:

1. Restate task scope.
2. Select TDD scenario.
3. Follow the plan exactly unless evidence shows it is wrong.
4. Run task verification.
5. Record results and risks.

Batch report:

```text
Tasks completed: <N>
Changed files: <paths>
Verification: <commands/results>
Review: <status/findings>
Blocked/risks: <none or details>
Ready for feedback.
```

Do not proceed past a requested checkpoint without feedback.

### Subagent Execution Policy

For exceptional concurrent write execution with subagents:

- Use write workers only when at least two independent implementation areas will run concurrently in the shared checkout. The parent must own at least one area; assign one fresh worker to each additional area with an exclusive, non-overlapping file list.
- Give every write child an exact edit packet: assigned files and symbols, required behavior, non-goals, TDD scenario when applicable, validation commands and evidence, and prohibited product/API/compatibility/scope decisions.
- Require each child to stop before touching an unassigned file and contact the parent only for a real blocker, discovered file overlap, or an unapproved product/API/compatibility/scope decision.
- Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active.
- Workers write summaries to `.scratch/` or explicit output paths. The parent inspects their diffs, integrates their changes, and verifies the combined result.
- Dispatch read-only `reviewer` agents after implementation:
  1. spec compliance review against the approved task/design,
  2. code quality review when needed.
- The parent applies must-fix findings that directly support the current task intent and stay within approved boundaries, then re-reviews the affected mode. Ask before material expansion. Use write children for fixes only when at least two independent fix areas satisfy the same concurrent-write contract.
- If two focused fix attempts fail, stop and ask; the plan likely needs redesign.

### Research Phase

- For nontrivial, ambiguous, high-impact, externally grounded, or multi-step work, use quality-first fanout by default. Treat fanout as the normal planning substrate, not an exceptional escalation.
- Route ordinary user language to the matching `pi-subagents` recipe; the user does not need to name a slash command. Keep detailed recipe examples in the `pi-subagents` skill so this workflow does not become a second routing authority.
- Dispatch scout agents for codebase exploration.
- Scouts can run in parallel (e.g., 5 scouts analyzing different modules) when their scopes are distinct.
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
- Use write workers only under the exceptional concurrent-write policy above.
- Give every write worker an exact edit packet: current task-contract revision, assigned files and baseline symbols/ranges, required behavior, non-goals, TDD scenario when applicable, validation commands and evidence, and prohibited product/API/compatibility/scope decisions.
- If the edit packet cannot specify those boundaries exactly, or its revision is stale, go back to planning.
- Concurrent writers must have exclusive, non-overlapping file lists. Each child stops before an unassigned file and communicates only a real blocker, discovered overlap, or an unapproved product/API/compatibility/scope decision.
- Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active.
- The parent and workers run focused checks; the parent inspects and integrates worker diffs, then verifies the combined result.
- Workers write results to `.scratch/`, not back to main context.

### Review Phase

- Dispatch read-only reviewer agents after implementation by default. Skip review only when the change is truly Tier 1/trivial, the user requested no review, or there is an explicit parent-only reason.
- Prefer a fresh-context parallel review gate for nontrivial work: correctness/regressions, tests/verification, and simplicity/maintainability. Add security, ops/resource, UX, or architecture reviewers when relevant.
- Use `/parallel-review` or `/quality-gate` patterns directly through `subagent(...)` when they fit.
- Use `/quick-adversarial-check` before committing to a diagnosis, architecture direction, or user-facing claim that has meaningful uncertainty.
- Reviewer checks against the plan and coding standards.
- For plan execution, prefer spec compliance review first, then code quality review when needed.
- Reviewer writes findings to `.scratch/reviews/` or returns concise inline output when artifacts are unnecessary.
- Parent synthesizes reviewer disagreements; do not blindly apply every suggestion.
- Findings cannot amend material scope. Address must-fix findings that directly support the approved outcome; ask before new behavior, public/API contracts, dependencies, compatibility, security/data decisions, unexpected persistent files, or another approval boundary.

### Completion Phase

- Run required checks and report evidence.
- Verify worker/subagent claims from actual output, diffs, or rerun checks before reporting completion.
- If the current branch has an open PR and the user explicitly asks to update the PR description/body, load the github skill and update only that PR description/body with what changed and how it was tested.
- Without an explicit user request for that exact PR description/body update, draft suggested PR text instead of mutating GitHub.
- When performing a requested PR body update, merge or append; never overwrite unrelated content.

## .scratch/ Workspace

Use `.scratch/` for workflow artifacts when artifact creation is allowed and useful. Ensure it exists and is gitignored before workflows that require persistent plans, research, reviews, sessions, or run logs. Do not make unrelated setup edits such as adding `.scratch/` to `.gitignore` during a feature change unless the user approves or the edit is required for the requested change. If a required workflow needs persistent artifacts but the task forbids artifacts, stop and ask.

Organized:

- `research/` — scout findings
- `plans/` — draft-for-approval and approved plans with [ASSUMPTION] annotations
- `reviews/` — reviewer output
- `sessions/` — session state for continuation
- `runs/` — long-running command logs/status when artifacts are allowed

Quick lookups stay in context. Deeper research goes to files.
Check for existing .scratch/ files before re-researching.

## Stop Conditions

Stop and ask instead of improvising when:

- requirements conflict
- the approved plan is wrong
- a human review trigger activates
- implementation needs an unapproved product or architecture decision
- tests fail repeatedly and root cause is unclear
- a tool or plan asks for mutating git commands
