---
name: brainstorming
description: "Use before creative or non-trivial implementation work: new features, behavior changes, UI/API design, architecture choices, or ambiguous requirements. Refines intent into an approved design using code/docs inspection and focused user questions."
---

# Brainstorming

Turn a rough idea into a concrete design before implementation.

This is a discussion and design skill, not an implementation skill.

## Boundaries

Allowed:

- Read code, docs, config, tests, and recent read-only git state.
- Use scouts for read-only reconnaissance.
- Use `ask_user` for one focused decision at a time.
- Write design notes to `.scratch/plans/` for larger work.

Not allowed:

- Editing source, tests, config, docs, or prompts outside `.scratch/`.
- Making architectural/product decisions without user approval.
- Running mutating git commands.

## Process

### 1. Understand the current state

Before asking questions, inspect what can be answered from tools:

- relevant README/docs/instruction files
- nearby code and tests
- existing patterns and similar implementations
- current constraints from `AGENTS.md`

Use `scout` if the area is broad. Keep raw research in `.scratch/research/`.

### 2. Clarify intent

Ask only what tools cannot answer. If evidence does not settle user intent, defer to the user instead of choosing silently.

Rules:

- Ask one focused question per `ask_user` call.
- Ask only material user-owned choices after tools and evidence have resolved factual/routine questions.
- For behavior/configuration/workflow/approval choices, give a concise card with verified previous behavior (or that none exists), proposed behavior, observable delta, recommendation, and tradeoff. Omit dimensions that cannot change the decision.
- Proactively map and verify materially reachable workflows, roles, states, failure paths, and consequences. Ask about unresolved reachable behavior; do not invent impossible hypotheticals or ask questions tools can answer.
- When cost, time, downtime, rollout, production load, or resource tolerance could materially change the design, show the consequence and ask whether it is acceptable instead of silently optimizing around it.
- Do not proceed from clarification to planning or implementation while a material requirement, scope boundary, or design choice remains unresolved.
- Prefer structured options when there are clear choices.
- Include a short context summary in `ask_user` so the user sees why the question matters.
- Do not bundle unrelated questions.

Clarify:

- user goal and non-goals
- success criteria
- materially reachable user/system workflows and states
- constraints, risks, and acceptable cost/time/downtime/rollout consequences
- compatibility expectations
- testability expectations
- human review triggers

### 3. Explore approaches

Present only credible, materially different approaches; do not force an arbitrary count. Lead with the recommendation and confidence level. Explain observable differences, tradeoffs, risks, and why the preferred option is the simplest coherent solution. If one option is clearly wrong, say so and explain why.

Use bullets or labeled decision cards in generated Markdown. A table is allowed only in direct UI/chat when it materially improves comparison clarity.

### 4. Validate design

For larger work, present the design in short sections for inspectability and non-blocking feedback; this incremental presentation is not an approval wait or permission to omit the complete reviewed design:

- architecture / placement
- data/control flow
- previous and proposed user-visible behavior
- reachable failure behavior when relevant
- proof strategy
- rollout/cleanup when relevant

The only default normal-mode wait is after the complete draft, asynchronous review, and complete revised design. Any additional milestone wait must be named in the decision-ready proposal and explicitly approved.

Before requesting approval on a nontrivial complete design:

1. Present the full decision-ready draft directly.
2. Launch at least three fresh parallel plan/design reviewers with distinct evidence targets.
3. Inspect and validate their evidence.
4. Integrate supported changes and keep incidental adjacent/cleanup findings separate.
5. Re-present the complete revised design and every material delta.
6. Ask one focused approval question on the behavioral boundary.

If the user corrects direction, revise and re-review the affected design before planning implementation.

### 5. Save material designs

For large or complex nontrivial work, write:

`.scratch/plans/YYYY-MM-DD-<topic>-design.md`

Include:

- goal and non-goals
- chosen approach and rejected alternatives
- assumptions marked as `**[ASSUMPTION: ...]**`
- affected files or systems
- risks and human review triggers
- open questions

Do not edit project docs during brainstorming. Ensure the design records documentation updates required for behavior that will be deployed or otherwise available to users. The design artifact preserves detail but never replaces a self-contained decision-ready proposal in chat.

## Handoff

After reviewed design approval:

- For multi-step work, use `writing-plans`.
- For an approved implementation, return to `manager-workflow` execution.
- For unresolved material design choices, keep asking one focused question at a time with prior behavior and recommendation.

## Quality Bar

A brainstorm is not done until:

- the user's actual goal is clear,
- at least one simpler alternative was considered,
- risks are explicit,
- the proof strategy is plausible,
- the next step is either planning or a clearly bounded implementation.
