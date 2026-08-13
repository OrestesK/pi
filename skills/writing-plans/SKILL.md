---
name: writing-plans
description: Use for technical specifications, technical designs, architecture proposals, and implementation plans after the goal is clear
license: MIT; see LICENSE
---

# Writing Plans

Turn clear intent into a technical specification, an implementation plan, or one plan that covers both.

This skill plans work. It does not approve or implement it.

## Choose the output

Write only what the task needs:

- **Technical specification:** define the architecture, contracts, boundaries, and end-to-end flows
- **Implementation plan:** break an approved design into ordered tasks, owners, and checks
- **Integrated plan:** include both when architecture decisions and execution detail belong in one handoff

Use `brainstorming` first when a user-owned product or design choice is still open. Do not invent the missing decision inside the plan.

When the user asks only for a specification or plan, return it inline and stop. Do not implement or offer implementation by default.

## Boundaries

Allowed:

- Read code, docs, tests, types, configuration, and read-only Git state
- Use read-only scouts when the area is broad
- Verify relevant external behavior in current version-matched documentation
- Save supporting detail in `.scratch/plans/` when the user asks or continuity needs it

Not allowed:

- Edit source, tests, tracked config, or project docs while planning
- Hide assumptions or present guesses as facts
- Make product decisions for the user
- Claim that a planned check passed
- Include mutating Git commands for the agent to run

When the user asks for a plan, show it in the conversation. When this skill supports `manager-workflow`, return the detailed plan to the manager. The manager gives the user the short explanation defined by that workflow instead of showing the full plan.

## Inspect first

Before writing:

1. Confirm the goal, current behavior, desired behavior, limits, and non-goals
2. Inspect the real entrypoints, owners, types, call paths, tests, and local conventions
3. Verify external framework, provider, protocol, library, or service behavior when the plan depends on it
4. Separate verified facts, proposed changes, and open questions
5. Return unresolved user decisions to `brainstorming`

Do not invent requirements, APIs, files, contracts, or call stacks to make the plan look complete.

## Specify architecture when needed

Include architecture detail when the task changes a boundary, public contract, data flow, state model, persistence model, external integration, or runtime behavior.

Compare alternatives only when they lead to meaningfully different implementation or risk. State the recommendation and why it is the simplest coherent choice.

For each changed boundary, define what matters:

- domain values and state
- inputs, outputs, request and response shapes, and expected errors
- public or module interfaces
- adapters, protocols, persistence, and runtime boundaries
- ownership and what may cross the boundary

Use the project's language and conventions for code-shaped contracts. Do not add types, adapters, interfaces, or abstractions without a real invariant, boundary, reuse point, or test seam.

Trace each affected behavior from its entrypoint to side effects and response. Show current and proposed flows when behavior changes. Include values or types crossing each step.

Cover failure, retry, cancellation, transaction, concurrency, idempotency, authorization, monitoring, and runtime hops only when the real path can reach them. Name the owner for each responsibility.

A technical specification is complete when another engineer can identify the chosen architecture, every changed contract and owner, each affected end-to-end flow, likely implementation locations, planned proof, and open decisions without inventing missing design.

## Plan implementation tasks when needed

Make each task one small behavior or coherent structural change. The implementer should not need to redesign it.

For each task include:

- **Purpose:** the observable result
- **Likely owners:** files, modules, symbols, or boundaries when known
- **Baseline:** current behavior, reproduction, characterization, or why none helps
- **Implementation:** the smallest change at the canonical owner
- **Verification:** the future command or user flow and the claim it must prove
- **Review:** approved behavior, non-goals, risks, focus points, and stop conditions

Locations guide execution and concurrent write ownership. They do not narrow or expand the user's approval boundary.

Split or stop when a task still needs product judgment.

## Plan proof once

Load `behavioral-proof` and use its evidence selection. For each changed claim, name the smallest future evidence that could disprove a wrong implementation, the expected observation, and any unavailable boundary.

A plan names checks to run later. It never reports them as passed.

## Plan shape

Use only the sections that help the task. Avoid empty boilerplate and tables.

```markdown
# <Title>

## Summary and recommendation
## Current behavior
## Goals and non-goals
## Constraints and open questions
## Alternatives
## Architecture
### Contracts and ownership
### Current and proposed flows
### Reachable failure and runtime behavior
## Implementation tasks
## Proof plan
## Risks
## Review and stop conditions
```

Omit architecture sections for a straightforward execution plan. Omit task sections for a specification-only request. Keep both in one document when both are needed.

Do not include agent-run commands for `git add`, `git commit`, `git push`, `git checkout`, `git reset`, `git stash`, `git rebase`, `git merge`, or `git worktree`.
