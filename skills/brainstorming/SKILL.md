---
name: brainstorming
description: Use for refining ambiguous or nontrivial feature, behavior, UI, API, or architecture requests into an approved design
---

# Brainstorming

Turn a rough idea into a concrete design before implementation

This is a discussion and design skill, not an implementation skill

## Process

### 1. Understand the current state

Before asking questions, inspect what can be answered from tools:
- relevant README/docs/instruction files
- nearby code and tests
- existing patterns and similar implementations
- current constraints from the active instructions already in context, specifically applicable project rules and global workflow and safety boundaries

Use `scout` if the area is broad. Keep raw research in `.scratch/research/`

### 2. Clarify intent

Ask only what tools cannot answer. If evidence does not settle user intent, defer to the user instead of choosing silently

Rules:
- Ask one focused question per `ask_user` call
- Ask about material intent, preferences, and trade-offs that evidence cannot settle
- Explain the problem, your recommendation, and why it matters before asking for a decision. If the user is still exploring or correcting the model, keep discussing
- Surface assumptions that would materially change the design instead of silently deciding them. When several candidate assumptions serve the same focused scope decision, one short checklist may be clearer than asking them separately
- Map the workflows, roles, states, failure paths, and consequences that can actually occur. Ask about unresolved behavior in those paths. Do not invent impossible cases or ask questions tools can answer
- When cost, time, downtime, rollout, production load, or resource tolerance could change the design, explain the consequence and ask whether it is acceptable. Do not silently optimize around it
- Do not start planning while a consequential user-owned assumption, material requirement, scope boundary, or design choice is unresolved
- Use structured options only when the alternatives are clear, materially different, and the user is ready to choose
- Include a short context summary in `ask_user` so the user sees why the question matters
- Do not bundle unrelated questions

Clarify:
- user goal and non-goals
- success criteria
- materially reachable user/system workflows and states
- constraints, risks, and acceptable cost/time/downtime/rollout consequences
- compatibility expectations
- testability expectations
- human review triggers

### 3. Explore approaches

Present only credible approaches that would produce materially different outcomes. Do not force an arbitrary number of options. Lead with the recommendation and confidence level. Explain what changes for the user, the tradeoffs and risks, and why the preferred option is the simplest coherent solution. If one option is clearly wrong, say so and explain why

Use bullets or short labeled options in generated Markdown. Use a table in direct chat only when it makes the choice clearer

### 4. Validate design

For larger work, show the design in short sections so it is easy to inspect and comment on without stopping progress. These sections are not an approval wait and do not replace the complete reviewed design:
- architecture / placement
- data/control flow
- previous and proposed user-visible behavior
- reachable failure behavior when relevant
- proof strategy
- rollout/cleanup when relevant

The only default normal-mode wait is after the complete draft, asynchronous review, and complete revised design. Any additional milestone wait must be named in the decision-ready proposal and explicitly approved

### 5. Save a design when useful

Write `.scratch/plans/YYYY-MM-DD-<topic>-design.md` when the user explicitly requests it or helps continuity. Include the goal and non-goals, chosen and rejected approaches, marked assumptions, affected systems, risks, review triggers, and open questions

Do not edit project docs during brainstorming. The artifact preserves detail but never replaces a self-contained decision-ready proposal in chat

## Quality Bar

A brainstorm is not done until:
- the user's actual goal is clear,
- at least one simpler alternative was considered,
- risks are explicit,
- the proof strategy is plausible,
- the next step is either planning or a clearly bounded implementation
