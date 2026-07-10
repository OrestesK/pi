# Candidate-output review

Candidate-output review judges one or more candidate results for a frozen benchmark task.

This review is intentionally model- or human-judgment-based. Do not turn it into test-suite scoring. For PR-derived `gold_reference_single_output` tasks, the primary score is the adjudicated PR-quality judgment against the broad rubric, task-specific outcome rubric, and original merged PR/source reference.

Use the accepted task packet and task-specific outcome rubric as source of truth. Candidate-workspace prompts, checks, edited task files, and self-reported validation may inform scope-control/process review, but they must not redefine the task or scoring basis.

Keep three outcomes distinct: final output/code correctness, trajectory/process compliance, and harness/report-format health. Do not let candidate-edited task/check files, leaked private path names, generated cleanup artifacts, or acceptance-wrapper parse failures overwrite the rubric judgment; record them as separate evidence.

## Required inputs

For pairwise review:

- frozen task statement;
- evaluator brief or outcome rubric;
- candidate X artifact(s);
- candidate Y artifact(s);
- process and verification summaries when available;
- known risks and anti-solutions;
- rubric version;
- opaque blinding record id; the anonymization/randomization paths stay outside the reviewer packet.

For single-output review:

- same packet, but only one candidate.

For gold-reference single-output review:

- frozen task statement;
- task-independent PR-quality rubric;
- private per-task outcome rubric supplement when present;
- original merged PR/source commit or equivalent private gold reference;
- one candidate artifact/diff/final answer;
- process and verification summaries when available.

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
- gold/reference patch unless the mode is `gold_reference_single_output` or audit.

Use X/Y labels for paired review. Swap order for a second judge pass when result is important or when using LLM judges at scale.

Normal reviewer packets should use opaque artifact ids and sanitized bounded excerpts. Do not include raw host paths, unblinding paths, task-origin details, generation rationale, or gold patches unless the lane is explicitly `gold_reference_single_output` or audit-only. Gold-reference packets are judge-private and must not be candidate-facing.

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
4. For gold-reference review, compare candidate behavior and design against the original PR/source intent without requiring byte-for-byte patch equivalence.
5. Before using any finding to reject or downgrade, classify the failed expectation as `public_task_stated`, `task_specific_outcome_rubric`, `repo_discoverable`, `gold_reference_intent`, or `not_applicable`.
6. Reject shape-biased counted findings: do not downgrade a candidate for file names, helper names, method names, call order, or module decomposition unless those details are required by public task text or repo-discoverable behavior.
7. Inspect process/verification summaries only as confidence evidence, not as a substitute for rubric judgment.
8. Decide absolute readiness for each reviewed candidate.
9. In `blinded_pairwise` mode, decide pairwise winner or tie/neither.
10. In `single_output` or `gold_reference_single_output` mode, decide the single-output verdict and do not produce a pairwise winner.
11. Inspect trajectory/process only if requested as a separate diagnostic stage.
12. For panel review, leaf reviewers stop after their lane output. Reducers consume leaf outputs, resolve disagreement, and decide whether targeted second-wave review is needed.

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
| Goal fulfillment / correctness | Does it solve the task and original PR intent? |
| Completeness | Does it handle edge cases and integration paths? |
| Regression risk | Does it preserve existing behavior, API, data, and compatibility expectations? |
| Code quality / maintainability | Is it simple, local, idiomatic, and understandable? |
| Integration fit | Does it belong in the right owner layer and avoid duplicated sources of truth? |
| Scope control | Does it avoid unrelated churn, broad rewrites, and overengineering? |
| Tests/verification | Are checks relevant, honest, and sufficient PR evidence? |
| Safety/security/privacy | Any data loss, secret leak, unsafe command, permission, or private-reference leakage risk? |
| Documentation/user-facing behavior | Are docs, comments, examples, and visible behavior aligned when relevant? |
| PR readiness | Would a maintainer merge it, request minor changes, request major changes, or reject it? |

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
- did not edit task or rubric files except where explicitly allowed;
- did not inspect parent directories, private artifacts, manifests, or evaluator briefs;
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

Use `templates/candidate-output-review.json` when structured output is useful. Canonical `review_mode` values are `blinded_pairwise`, `single_output`, `gold_reference_single_output`, and `audit`.

The template supports both paired review and single-output review:

- `blinded_pairwise` review uses `winner` and X/Y readiness fields;
- `single_output` review sets `winner` to `null`, uses `single_output_verdict`, and marks Y fields as `not_applicable` or `null`.

Use qualitative `dimension_assessments`, not unlabeled numeric scoring. The primary output remains verdict + evidence; dimension labels are diagnostic only unless a benchmark report explicitly predeclares otherwise. If `quality_score_0_to_10` is requested, use the anchored scale in the PR-quality rubric and report it as secondary evidence only.

Keep free-text explanation short and evidence-backed.
