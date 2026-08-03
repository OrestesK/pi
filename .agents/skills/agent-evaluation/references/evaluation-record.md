# Evaluation Record

Use this structure for a compact, reproducible evaluation record. Omit empty optional sections rather than manufacturing evidence.

## Decision

- Question being decided
- Baseline
- Candidate
- Recommendation
- Confidence

## Outcome contract

- Observable success
- Unchanged behavior
- Failure or regression conditions
- Claims explicitly outside this evaluation

## Conditions

Record materially relevant values:

- Model and provider
- Harness and version
- Available tools and skills
- Prompt or instruction boundary
- Input data or corpus
- Environment and dependency versions
- Run ordering or randomization

State any condition that could not be held equivalent.

## Cases

For each case record:

- Stable case identifier
- Why it is representative
- Input or reproducible pointer
- Expected observable result
- Baseline evidence
- Candidate evidence
- Deterministic check result, when applicable
- Limitation or unavailable boundary

Do not persist prompts, private data, or session content outside the approved artifact boundary.

## Judgment

- Rubric defined before output inspection
- Deterministic checks used
- Human or model judge conditions
- Pairwise order and swapped-order result
- Agreement, disagreement, or variance
- Invalid or incomplete runs retained in the accounting

## Findings

Separate:

- Candidate improvements
- Candidate regressions
- No meaningful difference
- Inconclusive cases

Tie every finding to case evidence. Do not infer intent or quality from one preferred tool trajectory when several trajectories satisfy the outcome contract.

## Limitations and recommendation

State residual uncertainty, untested boundaries, and the smallest next evidence that could change the decision. Promotion, persistent regression cases, and runtime mutation require explicit user approval through their canonical owner.
