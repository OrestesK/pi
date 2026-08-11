---
name: grill-me
description: Manually interview the user about a plan or design until shared understanding is reached.
disable-model-invocation: true
---

# Grill Me

Identify the plan, decision, or idea to discuss from the active conversation. If it is unclear, ask one question to establish it. Then interview the user until you reach shared understanding.

- Address one decision at a time, starting with decisions that later choices depend on.
- Ask exactly one question, then wait for the user's answer before continuing.
- Give a recommended answer with each question.
- Research facts in the codebase, with tools, or in documentation. Apart from one opening question to establish the subject, ask the user only to make decisions.
- State important assumptions and trade-offs. Make every material decision explicit.
- Do not create files, make changes, or start implementation during the interview.
- Once the important decisions are settled, confirm the shared understanding and end the interview. Then offer the optional planning output.

## Optional planning output

After confirming shared understanding, ask whether the user wants no artifact, a PRD, a technical specification, or implementation tickets. Do not write an artifact unless the user explicitly selects one.

For the output the user selects, read exactly one private procedure and follow it:

- PRD: [references/to-prd.md](references/to-prd.md)
- Technical specification: [references/to-spec.md](references/to-spec.md)
- Implementation tickets: [references/to-tickets.md](references/to-tickets.md)

These are Grill Me internals, not standalone skills. They write only under `.scratch/plans/`.
