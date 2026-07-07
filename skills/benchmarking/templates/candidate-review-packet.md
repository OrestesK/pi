# Candidate review packet: <task id>

Reviewer mode: blinded_pairwise | single_output | audit
Rubric version: <version>
Reviewer prompt version: <version>
Review packet id: <id>
Blinding record id: <opaque-id>; stored outside this packet; do not include paths or identities here.
Candidate provenance record ids: stored outside this blinded packet; do not include config names, model names, run order, or unblinding paths here.

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
- Transcript/process artifact, if process review is requested:
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
- Transcript/process artifact, if process review is requested:
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

## Default rubric

- Correctness
- Completeness
- Regression risk
- Maintainability
- Scope control
- Tests/verification
- Safety/security
- PR readiness
