# Task curation review

Task curation decides whether a generated benchmark task is valid, useful, and safe enough to enter a benchmark suite.

This is not candidate-output review. Do it before candidate runs.

## Inputs

Review these artifacts when available:

- `task-manifest.yaml`;
- `public/task.md`;
- public setup notes/logs;
- `private/evaluator-brief.md`;
- reference outcome, gold patch, or task-specific outcome rubric;
- task origin/provenance;
- mechanical validation output.

## Output

Return structured JSON following `templates/task-curation-review.json`, plus a concise explanation.

For high-stakes curation, use `references/reviewer-topology.md` with a small curation panel and reducer. Keep curation before candidate exposure.

Verdict options:

- `accept` — task can enter the benchmark.
- `revise` — task is promising but needs specific fixes.
- `reject` — task should not be used.

## Review criteria

### Clarity

- Can a candidate agent understand the objective from public material alone?
- Are required constraints visible to the candidate?
- Are success outcomes stated without leaking the implementation?
- Is ambiguity intentional and evaluator-visible?

### Solvability

- Is the task possible from the base state and allowed tools?
- Are setup requirements realistic?
- Does the evaluator brief identify what a good solution must achieve?
- Are impossible external dependencies, credentials, or unavailable services removed?

### Benchmark usefulness

- Does the task distinguish agent quality?
- Is it too trivial, too broad, too tedious, or too implementation-specific?
- Does it test a useful capability category?
- Is it representative of work the user actually cares about?

### Leakage

Reject or revise when public material reveals:

- gold patch details;
- non-public exact check details;
- exact implementation names that are not discoverable from the repo;
- private reviewer notes;
- source PR comments that give away the solution;
- canary/private strings.

### Fairness

- Does the task reward the intended outcome rather than patch imitation?
- Are rubric requirements and evaluator notes fair to alternate valid implementations?
- Are anti-solutions documented?
- Does the task avoid style-only preferences unless style is the task?

### Stability

- Can the task be rerun later?
- Are base commits/images/setup commands pinned enough?
- Are flake risks identified?
- Are time/resource budgets clear?

### Privacy and safety

- Are secrets, tokens, private URLs, customer data, and sensitive paths removed or marked private?
- Are destructive or external operations explicitly scoped?
- Is publication status clear: private/internal or sanitized/public?
- Is the normal candidate-review packet safe for broad blinded reviewer fanout?
- Are audit-only artifacts separated from reviewer-visible excerpts?

### Reviewer packet safety

For tasks expected to use candidate-output reviewers, verify:

- reviewer-visible evaluator excerpts exclude gold patches, task origin, generation rationale, and unblinding data;
- normal reviewer packets can be assembled with opaque artifact ids and sanitized bounded excerpts;
- elevated/audit-only evidence is explicitly marked;
- reducer-visible material is limited to reviewer outputs and metadata unless an elevated reducer is declared;
- labels or expected findings are versioned when precision/recall/F1 will be reported.

## Difficulty labels

Use the smallest honest label:

- `smoke` — catches basic regressions or obviously bad configs.
- `medium` — meaningful local/cross-file work, expected under about one hour for a human.
- `hard` — multi-step reasoning, ambiguous context, or substantial integration.
- `long_horizon` — requires sustained planning, multiple subsystems, or hours of human work.

## Task type labels

Prefer one primary type and optional secondary tags:

- `bugfix`
- `feature`
- `refactor`
- `migration`
- `ci_debug`
- `test_quality`
- `review_only`
- `safety`
- `restraint`
- `tool_use`
- `docs_api`

## Required fixes

For `revise`, list specific fixes, not generic concerns. Examples:

- “Move `private/gold.patch` reference out of `public/task.md`.”
- “Add evaluator note explaining why changing `FooConfig` is an anti-solution.”
- “Split this into two tasks; current prompt asks for auth migration and UI redesign.”
- “Mark task-specific rubric as outcome-oriented and classify as `review_only`."

## Rejection reasons

Reject tasks that are:

- impossible from available context;
- unsafely dependent on secrets or production systems;
- primarily trivia or formatting;
- broad multi-issue bundles;
- leaked or contaminated beyond repair;
- not reproducible enough even for review-only use;
- not useful for comparing agent behavior.
