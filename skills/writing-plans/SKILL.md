---
name: writing-plans
description: Use after the requirements or design are approved when the user explicitly requests a durable plan or it is materially useful. Produces precise implementation tasks that may be saved under `.scratch/`, plus a behavioral-proof strategy, verification commands, and review checkpoints.
---

# Writing Plans

Create implementation plans that can be executed without implicit design decisions.

Use this when the user explicitly asks for a durable task breakdown or one is materially useful for continuity or execution. A plan file is not required for routine work whose approved chat proposal is sufficient.

Plans live in `.scratch/plans/` unless the user explicitly asks for project documentation. The artifact supports continuity; the complete user-facing plan is still presented directly.

## Boundaries

Allowed:

- Read code, docs, tests, and relevant configs.
- Dispatch read-only scouts.
- Write implementation plans to `.scratch/plans/`.

Not allowed:

- Editing source/tests/config while planning.
- Hiding assumptions.
- Adding mutating git instructions.

## Before Planning

Verify you have:

- approved design or approved, sufficiently clear requirements,
- known constraints from project instructions,
- likely files/symbols affected,
- project test/lint/typecheck commands when discoverable,
- human review triggers identified.

If not, use `brainstorming` or `scout` first.

## Plan Format

Avoid tables in generated plan Markdown. Every implementation plan should include:

```markdown
# <Feature> Implementation Plan

**Recommendation and outcome:** <chosen approach and observable result>
**Previous behavior and delta:** <verified current state and proposed change>
**Approved design or requirements:** <compact summary; a path is supporting evidence only>
**Changed behavior:** <material changes>
**Unchanged behavior / non-goals:** <preserved boundaries>
**Constraints:** <protected actions, no mutating git, project conventions>
**Proof strategy:** <behavioral evidence selected for each material claim>
**Review handoff:** <plan-only: return the plan and stop; standalone nontrivial plan review: `review`; manager-attached plan: active `manager-workflow` stage>
**Behavioral approval boundary:** <outcome, risks, stops; not an exact file list>

## Alternatives and rationale

- <meaningful alternative, tradeoff, and why rejected>
- <why the recommendation is the simplest coherent solution>

## Assumptions, uncertainties, and risks

- **[ASSUMPTION: ...]**
- **[UNCERTAINTY: confidence and resolution]**
- **[RISK: impact, reversibility, and safer alternative]**

## Evidence and focus points

- <inspected evidence; passed, failed, and unexecuted checks>
- <specific sections/decisions requiring close user inspection>

## Tasks

### Task N: <small behavior>

**Purpose:** <observable behavior or coherent structural result>
**Likely implementation owners:**

- Modify: `path/file.ext` (`symbol` or lines when known)
- Test/proof: `path/test.ext`, command, live flow, or none with reason

These locations guide execution and concurrent ownership; they are not the user approval boundary.

**Baseline / reproduction:**

- Existing behavior, failing reproduction, characterization, or reason no baseline is informative.

**Implementation:**

- Minimal target at the canonical owner. Include exact symbols or small snippets only when necessary.

**Verification:**

- Exact command or user flow and the claim it proves.

**Review:**

- Approved behavior/non-goals, relevant decisions, proof/evidence packet, review focus points, and stop conditions.

## Approval and stop conditions

- <exact behavioral authorization, exclusions, next separately authorized action, and material stops>
```

## Task Granularity

Make tasks small enough for the parent or an exceptional concurrent worker to complete without redesigning:

- one behavior or one coherent refactor per task,
- one coherent proof target per changed behavior where practical,
- likely owner locations and exact commands,
- explicit stop conditions.

If a task requires product judgment, split it or return to `brainstorming`.

## Behavioral-proof selection

Load `behavioral-proof` and select the smallest evidence that proves the actual claim:

- test-first when a failing test efficiently isolates new behavior;
- characterization or baseline-first for existing behavior;
- reproduction-first for bugs after root-cause evidence;
- existing coverage plus before/after checks when sufficient;
- integration, live, or manual evidence when the claim crosses those boundaries;
- no invented test for non-behavioral or language/framework-guaranteed behavior.

## Git Policy

Do not include agent-run commands for:

- `git add`
- `git commit`
- `git push`
- `git checkout`
- `git reset`
- `git stash`
- `git rebase`
- `git merge`
- `git worktree`

If a handoff command is useful, label it as **User-run only** and prefer copying it to the clipboard at completion time, not in the implementation plan.

## Handoff

Choose the path that matches the request:

- **Plan only:** present the complete plan directly in chat, save it only when requested or materially useful, then stop. Do not start implementation or approval flow.
- **Standalone nontrivial plan review:** route directly to `review`. Its three fresh reviewers remain required; `delegation` dispatches them.
- **Manager-attached plan:** return the task breakdown to the active `manager-workflow` stage. It does not add review or approval unless it introduces a material behavioral delta.

This skill owns the executable task breakdown and proof detail.
