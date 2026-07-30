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

## Tech-spec clarification

When `manager-workflow` uses this skill only to clarify intent before a tech spec:

- Stay in the manager's current design stage
- Inspect the current state and ask only the questions needed for architecture work
- Return the resolved goal, behavior, limits, acceptance conditions, and open questions to the manager
- Do not start another design, review, approval, plan, or implementation flow

Standalone brainstorming still uses the normal process below.

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

- Ask one focused question per `ask_user` call
- Ask only material user-owned choices after tools and evidence resolve factual or routine questions
- Briefly explain why the choice matters, recommend an option when useful, and ask in normal language
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

Use bullets or short labeled options in generated Markdown. Use a table in direct chat only when it makes the choice clearer.

### 4. Validate design

For larger work, present the design in short sections for inspectability and non-blocking feedback; this incremental presentation is not an approval wait or permission to omit the complete reviewed design:

- architecture / placement
- data/control flow
- previous and proposed user-visible behavior
- reachable failure behavior when relevant
- proof strategy
- rollout/cleanup when relevant

The only default normal-mode wait is after the complete draft, asynchronous review, and complete revised design. Any additional milestone wait must be named in the decision-ready proposal and explicitly approved.

For a nontrivial complete design, hand the visible draft to `manager-workflow`; it owns review timing, revised presentation, and the approval question. This skill owns only the design evidence and decision-ready draft. If the user corrects direction, revise the affected design before that handoff.

### 5. Save a design when useful

Write `.scratch/plans/YYYY-MM-DD-<topic>-design.md` only when the user explicitly requests it or it is materially useful for continuity. Include the goal and non-goals, chosen and rejected approaches, marked assumptions, affected systems, risks, review triggers, and open questions.

Do not edit project docs during brainstorming. The artifact preserves detail but never replaces a self-contained decision-ready proposal in chat.

## Handoff

After reviewed design approval:

- Use `writing-plans` only when the user explicitly requested a durable plan or it is materially useful for continuity or execution.
- Otherwise return to `manager-workflow` execution.
- For unresolved material design choices, ask one clear question at a time and recommend an option when useful.

## Quality Bar

A brainstorm is not done until:

- the user's actual goal is clear,
- at least one simpler alternative was considered,
- risks are explicit,
- the proof strategy is plausible,
- the next step is either planning or a clearly bounded implementation.
