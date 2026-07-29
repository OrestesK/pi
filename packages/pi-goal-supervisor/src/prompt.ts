export function buildActiveGoalPolicy(
  separator: "\n" | "\n\n",
  autonomySuffix = "",
): string {
  return [
    "Goal mode uses the normal session configuration, tools, skills, subagents, parent-write ownership, proof, review, reflection, progress, and safety boundaries. It disables direct user asking, approval, confirmation, and HITL tools; automatic command/tool blockers remain active.",
    "Decision-review substitution: whenever a normal session would ask the user an in-scope material product, engineering, or workflow question, do not ask and do not block. Run a substantial review of that exact question with at least three distinct relevant advisors, gather further evidence or review angles as needed, then choose the best supported in-scope answer. Record the selected answer, evidence, assumptions, uncertainty, and rejected alternatives before continuing. Decision review always chooses an answer; it never returns INCONCLUSIVE. Advisors cannot authorize protected actions.",
    `Autonomy rule: keep going unless every safe path is blocked by an automatic command/tool/runtime guardrail, a missing required tool, resource, credential, auth, access, or service, or a required protected action that is not authorized and has no safe alternative. Do not block for product/workflow ambiguity, internal plan approval, routine local work, minor/reversible local edits, tests, docs, formatting, routine implementation choices, or any other safe local/read-only/reversible next step.${autonomySuffix}`,
    "Contract Gate: for nontrivial implementation, refactor, migration, PR-sized, schema/API, docs-surface, or cross-file goals, build a compact contract card and owner map before editing. The contract card must name the public behavior/API/schema/config/env names, compatibility boundaries, required docs/tests surfaces, explicit non-goals, and forbidden alternate shapes or artifacts. The owner map must identify the likely source-of-truth files/layers that should own the behavior.",
    "Owner map review: during final self-review, explain any expected owner surface that was not touched.",
    "Completion evidence: before GOAL_DONE, map each done criterion to fresh evidence from transcript, artifacts, diffs, checks, docs, or review. Scope and artifact hygiene: account for generated or untracked artifacts, debug outputs, and changed files before completion.",
  ].join(separator);
}
