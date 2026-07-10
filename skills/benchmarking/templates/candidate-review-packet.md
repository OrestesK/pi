# Candidate review packet: <task id>

Reviewer mode: blinded_pairwise | single_output | gold_reference_single_output | audit
Review stage: leaf_review | validator | audit
Review role: <review_lane role, e.g. correctness | false_positive | severity_calibration>
Focus surface: output | process | harness | privacy | labels | report
Allowed evidence scope: normal_reviewer | gold_reference_judge | elevated_reviewer | audit_only
Rubric version: <version>
Reviewer prompt version: <version>
Review packet id: <id>
Reviewer assignment manifest id: <id-or-null>
Blinding record id: <opaque-id>; stored outside this packet; do not include paths or identities here.
Candidate provenance record ids: stored outside this blinded packet; do not include config names, model names, run order, or unblinding paths here.

Use opaque artifact ids and sanitized bounded excerpts in normal-review packets. Do not include raw host paths, unblinding paths, gold patches, task origin, or generation rationale unless this is explicitly `gold_reference_single_output` or `audit` mode. Gold-reference packets are judge-private and must never be candidate-facing.

## Task statement

Paste or link the frozen candidate-facing task statement.

## Evaluator brief excerpt

Include desired outcomes, risks, and anti-solutions needed for fair review.

Do not include gold/reference patch unless this is `gold_reference_single_output` or `audit` mode.

## Gold/reference material

Use this section only for judge-private gold-reference review. Do not include it in candidate-facing packets or normal public reports.

- Source/base commit:
- Original PR/source ref:
- Gold diff or bounded summary ref:
- Per-task rubric supplement ref:
- Privacy notes:

## Candidate X

Use this section for pairwise review or as the single candidate in single-output review.

### Artifacts

- Candidate artifact id:
- Diff/output:
- Final answer:
- Transcript/process artifact id or sanitized excerpt, if process review is requested:
- Process and verification summary, if available:
- Candidate edits to task/rubric files, if any, as process evidence only:

### Content

```text
<insert candidate X diff/output or bounded excerpt with artifact paths>
```

## Candidate Y

Use this section only for pairwise review. Delete or mark `not_applicable` for single-output review; do not invent fake Y data.

### Artifacts

- Candidate artifact id:
- Diff/output:
- Final answer:
- Transcript/process artifact id or sanitized excerpt, if process review is requested:
- Process and verification summary, if available:
- Candidate edits to task/rubric files, if any, as process evidence only:

### Content

```text
<insert candidate Y diff/output or bounded excerpt with artifact paths>
```

## Review instructions

1. Review final outputs first.
2. Use the original PR/source reference and rubric to judge PR quality when `gold_reference_single_output` is active. Treat gold as intent/reference, not a byte-for-byte implementation target.
3. Accept clean equivalent implementations when they satisfy the public task goal and repo-discoverable contracts, even if helper names, module boundaries, or internal decomposition differ from the original PR.
4. Before using any finding to reject or downgrade, classify the failed expectation as `public_task_stated`, `task_specific_outcome_rubric`, `repo_discoverable`, `gold_reference_intent`, or `not_applicable`.
5. Do not count shape-biased findings against the candidate. Exact helper names, file names, method names, call order, or module decomposition matter only when required by public task text or repo-discoverable behavior.
6. Use process and verification summaries as confidence evidence only; do not convert them into a separate score.
7. Do not infer candidate identity.
9. Decide absolute readiness for each reviewed candidate.
10. In `blinded_pairwise` mode, decide pairwise winner: X clear win, X slight win, tie, Y slight win, Y clear win, or neither acceptable.
11. In `single_output` or `gold_reference_single_output` mode, decide single-output verdict: excellent, acceptable, weak, or reject; do not produce a pairwise winner.
12. Cite evidence for every major claim.
13. Flag missing evidence instead of guessing.
14. If asked for 0-10 scoring, use the anchored secondary scale from the PR-quality rubric and do not average raw scores.
15. If asked for process review, do it separately after output review.
16. If this is a leaf review in a panel, stay inside the assigned lane and do not perform reducer/adjudicator work.
17. Reducers should normally use `templates/candidate-review-adjudication.json`, not this raw candidate packet. Use this packet for reducer work only when an explicitly elevated reducer needs bounded raw evidence.

## Role-specific questions

- <question 1>
- <question 2>

## Stop condition

Stop after answering the role-specific questions with evidence-backed findings. Do not broaden into unrelated review lanes.

## Default rubric

- Goal fulfillment and semantic correctness against the task and gold/original PR intent
- Completeness and edge cases
- Code quality, simplicity, and maintainability
- Integration fit and regression risk
- Scope control
- Tests/verification quality as PR evidence
- Safety/security/privacy
- Documentation and user-facing behavior when relevant
- PR readiness
