# Candidate review packet: <task id>

Reviewer mode: blinded_pairwise | single_output | audit
Review stage: leaf_review | validator | audit
Review role: <review_lane role, e.g. correctness | false_positive | severity_calibration>
Focus surface: output | process | harness | privacy | labels | report
Allowed evidence scope: normal_reviewer | elevated_reviewer | audit_only
Rubric version: <version>
Reviewer prompt version: <version>
Review packet id: <id>
Reviewer assignment manifest id: <id-or-null>
Blinding record id: <opaque-id>; stored outside this packet; do not include paths or identities here.
Candidate provenance record ids: stored outside this blinded packet; do not include config names, model names, run order, or unblinding paths here.

Use opaque artifact ids and sanitized bounded excerpts in normal-review packets. Do not include raw host paths, unblinding paths, gold patches, hidden-test bodies, task origin, or generation rationale unless this is explicitly `audit` mode.

## Task statement

Paste or link the frozen candidate-facing task statement.

## Evaluator brief excerpt

Include desired outcomes, risks, and anti-solutions needed for fair review.

Do not include gold/reference patch unless this is audit mode.

## Candidate X

Use this section for pairwise review or as the single candidate in single-output review.

### Artifacts

- Candidate artifact id:
- Diff/output:
- Final answer:
- Transcript/process artifact id or sanitized excerpt, if process review is requested:
- Public test/log summary from frozen task/scorer inputs:
- Hidden/scorer summary from frozen task/scorer inputs, if allowed:
- Candidate edits to task/scorer files, if any, as process evidence only:

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
- Public test/log summary from frozen task/scorer inputs:
- Hidden/scorer summary from frozen task/scorer inputs, if allowed:
- Candidate edits to task/scorer files, if any, as process evidence only:

### Content

```text
<insert candidate Y diff/output or bounded excerpt with artifact paths>
```

## Review instructions

1. Review final outputs first.
2. Use logs/tests as evidence, not as the whole verdict unless deterministic scoring is primary.
3. Use only logs/tests generated from frozen task/scorer inputs; candidate-edited tests or scorer files are process evidence only.
4. Do not infer candidate identity.
5. Decide absolute readiness for each reviewed candidate.
6. In `blinded_pairwise` mode, decide pairwise winner: X clear win, X slight win, tie, Y slight win, Y clear win, or neither acceptable.
7. In `single_output` mode, decide single-output verdict: excellent, acceptable, weak, or reject; do not produce a pairwise winner.
8. Cite evidence for every major claim.
9. Flag missing evidence instead of guessing.
10. If asked for process review, do it separately after output review.
11. If this is a leaf review in a panel, stay inside the assigned lane and do not perform reducer/adjudicator work.
12. Reducers should normally use `templates/candidate-review-adjudication.json`, not this raw candidate packet. Use this packet for reducer work only when an explicitly elevated reducer needs bounded raw evidence.

## Role-specific questions

- <question 1>
- <question 2>

## Stop condition

Stop after answering the role-specific questions with evidence-backed findings. Do not broaden into unrelated review lanes.

## Default rubric

- Correctness
- Completeness
- Regression risk
- Maintainability
- Scope control
- Tests/verification
- Safety/security
- PR readiness
