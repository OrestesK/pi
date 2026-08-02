---
name: grill-me
description: Manually interview the user about a plan or design until shared understanding is reached.
disable-model-invocation: true
---

# Grill Me

Use the active conversation to identify the plan, decision, or idea to interview the user about. If no subject is clear, ask one question to establish it. Then interview the user until you reach shared understanding.

- Walk the decision tree one dependency at a time.
- Ask exactly one question, then wait for the user's answer before continuing.
- Give a recommended answer with each question.
- Find facts from the codebase, tools, or documentation yourself. Except for one opening question needed to establish the subject, ask the user only to make decisions.
- Surface important assumptions and trade-offs; do not leave material decisions implicit.
- Do not create files, make changes, or start implementation during the interview.
- When the important decisions are settled, end the interview phase and confirm the shared understanding. Then offer the optional planning output.

## Optional planning output

After confirming shared understanding, ask whether the user wants no artifact, a PRD, a technical specification, or implementation tickets. Do not write an artifact unless the user explicitly selects one.

For the selected output, read exactly one private procedure and follow it:

- PRD: [references/to-prd.md](references/to-prd.md)
- Technical specification: [references/to-spec.md](references/to-spec.md)
- Implementation tickets: [references/to-tickets.md](references/to-tickets.md)

These are Grill Me internals, not standalone skills. They write only under `.scratch/plans/`.
