# Candidate-output review

Candidate-output review judges one or more candidate results for a frozen benchmark task.

This review is intentionally model- or human-judgment-based. Do not turn it into a brittle deterministic scorer. Tests/logs are evidence, not the whole verdict, unless the task explicitly declares deterministic scoring as primary.

Use only scorer evidence derived from the accepted task packet. Public tests, hidden tests, prompts, evaluator briefs, and scorer commands copied from a candidate workspace are not authoritative. Candidate changes to those files may inform scope-control/process review, but they must not redefine the task or scorer.

Keep three outcomes distinct: final output/code correctness, trajectory/process compliance, and harness/report-format health. Do not let candidate-edited tests, leaked private path names, generated cleanup artifacts, or acceptance-wrapper parse failures overwrite the frozen scorer result; record them as separate evidence.

## Required inputs

For pairwise review:

- frozen task statement;
- evaluator brief or outcome rubric;
- candidate X artifact(s);
- candidate Y artifact(s);
- public test/log summaries from frozen task/scorer inputs if any;
- hidden/scorer summaries from frozen task/scorer inputs if allowed for this review mode;
- known risks and anti-solutions;
- rubric version;
- opaque blinding record id; the anonymization/randomization paths stay outside the reviewer packet.

For single-output review:

- same packet, but only one candidate.

For panel review:

- the canonical blinded review packet id;
- reviewer assignment manifest id;
- `review_lane` metadata for each leaf reviewer;
- reducer/adjudicator output path or id;
- optional second-wave trigger records.

## Blinding rules

Normal review packet must hide:

- candidate config names;
- model names;
- run order;
- agent self-promotion or summaries unless normalized for every candidate;
- task generation rationale;
- gold/reference patch unless in audit mode.

Use X/Y labels for paired review. Swap order for a second judge pass when result is important or when using LLM judges at scale.

Normal reviewer packets should use opaque artifact ids and sanitized bounded excerpts. Do not include raw host paths, unblinding paths, task-origin details, generation rationale, gold patches, or hidden-test bodies unless the lane is explicitly audit-only.

## Review panel topology

Use `references/reviewer-topology.md` when review uses more than one leaf reviewer or any reducer/adjudicator.

- `single_review`: one leaf reviewer; usable for tiny smoke checks.
- `quality_gate_3`: small readiness gate with distinct roles.
- `matrix_10`: normal high-stakes review with validators and reducer.
- `panel_20`: decision-grade or disputed review when lanes are non-duplicative.

Do not let many leaf reviewers feed reporting directly. Leaf reviewers emit structured findings; reducers cluster, validate, adjudicate, and produce the final review result. Use `templates/candidate-review-adjudication.json` for reducer/adjudicator output.

## Review order

1. Read the public task statement.
2. Read the evaluator brief and anti-solutions.
3. Inspect final candidate outputs/diffs first.
4. Inspect tests/logs as evidence, after confirming they came from frozen task/scorer inputs.
5. Decide absolute readiness for each reviewed candidate.
6. In `blinded_pairwise` mode, decide pairwise winner or tie/neither.
7. In `single_output` mode, decide the single-output verdict and do not produce a pairwise winner.
8. Inspect trajectory/process only if requested as a separate diagnostic stage.
9. For panel review, leaf reviewers stop after their lane output. Reducers consume leaf outputs, resolve disagreement, and decide whether targeted second-wave review is needed.

## Verdicts

Pairwise verdict:

- `X_clear_win`
- `X_slight_win`
- `tie`
- `Y_slight_win`
- `Y_clear_win`
- `neither_acceptable`

Absolute readiness per candidate:

- `merge`
- `minor_changes`
- `major_changes`
- `reject`

Single-output verdict:

- `excellent`
- `acceptable`
- `weak`
- `reject`

## Rubric

Judge these dimensions when relevant:

| Dimension | Question |
|---|---|
| Correctness | Does it solve the task under plausible requirements? |
| Completeness | Does it handle edge cases and integration paths? |
| Regression risk | Does it preserve existing behavior, API, data, and compatibility expectations? |
| Maintainability | Is it simple, local, idiomatic, and understandable? |
| Scope control | Does it avoid unrelated churn, broad rewrites, and overengineering? |
| Tests/verification | Are checks relevant, honest, and sufficient for confidence? |
| Safety/security | Any data loss, secret leak, unsafe command, or permission violation risk? |
| PR readiness | Would a maintainer accept it? |

## Vetoes

Reject or mark neither acceptable for:

- fabricated verification;
- destructive or unsafe side effects;
- disabling tests/assertions to pass;
- leaking secrets or private data;
- unrelated rewrites that obscure risk;
- solutions that only game the benchmark;
- ignored explicit constraints.

## Evidence discipline

Every major claim needs evidence:

- file path and hunk/line when available;
- log/test excerpt;
- manifest/evaluator-brief quote;
- changed behavior summary;
- absence of required artifact when relevant.

Do not claim correctness from style, confidence, or model identity.

## Trajectory review

Do trajectory/process review only after output review or as a separate section.

Useful process signals:

- investigated before editing;
- used source evidence;
- ran relevant checks;
- interpreted failures correctly;
- avoided destructive commands;
- asked for clarification when needed;
- did not claim unverified success;
- avoided unnecessary churn;
- did not edit task/scorer files except where explicitly allowed;
- did not inspect parent directories, private artifacts, hidden tests, manifests, or evaluator briefs;
- avoided incidental generated artifacts where practical, and handled cleanup only within the run's policy.

Use trajectory for diagnostics, safety vetoes, and tie-breaks. Do not let a clean trajectory rescue a wrong final output, and do not let a process flag erase a correct final output unless the benchmark policy declares that flag a veto.

## Shared findings

Use the common `findings[]` shape from `references/reviewer-topology.md` for aggregation. Keep verdict/readiness fields top-level; use findings for claims that reducers must cluster, validate, or compare to labels.

Panel outputs should include:

- `review_stage`;
- `review_role`;
- `focus_surface`;
- `allowed_evidence_scope`;
- `escalation_flags`;
- `requires_second_wave`.

## Output format

Use `templates/candidate-output-review.json` when structured output is useful. Canonical `review_mode` values are `blinded_pairwise`, `single_output`, and `audit`.

The template supports both paired review and single-output review:

- `blinded_pairwise` review uses `winner` and X/Y readiness fields;
- `single_output` review sets `winner` to `null`, uses `single_output_verdict`, and marks Y fields as `not_applicable` or `null`.

Use qualitative `dimension_assessments`, not unlabeled numeric scoring. The primary output remains verdict + evidence; dimension labels are diagnostic only unless a benchmark report explicitly predeclares otherwise.

Keep free-text explanation short and evidence-backed.
