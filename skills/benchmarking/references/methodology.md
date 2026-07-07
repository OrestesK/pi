# Benchmarking methodology

Use this reference to choose a benchmark design and keep task creation, curation, candidate review, and reporting separate.

## Product methodologies to copy

| System | Pattern to copy | Boundary |
|---|---|---|
| SWE-bench | Base commit, issue statement, hidden tests, run artifacts, prediction records. | Public tasks can be contaminated; private tasks need the same schema discipline. |
| PatchGym | Mine real Git history into local SWE-bench-style tasks; use hidden tests and oracle patches where available. | Validate mined tasks; history alone does not make a good benchmark. |
| SWE-smith | Generate many candidate tasks, then filter and validate. | Synthetic task text/bugs need curation before benchmark use. |
| Terminal-Bench / Harbor | Explicit task directory, solution/reference artifacts, test command, task authoring rubric. | Terminal packaging is useful even when final grading is review-based. |
| METR Task Standard | Task family, resources, permissions, score function, hidden data, no-internet defaults. | Heavyweight for small PR tasks, but good for long-horizon or black-box tasks. |
| Inspect AI | Dataset / solver / scorer separation. | Scorers can be deterministic or model-graded; do not mix responsibilities. |
| LangSmith / Braintrust / Langfuse / Weave / Phoenix | Dataset → experiment → evaluator/scorer → trace artifacts. | Eval ops do not replace task quality review. |
| promptfoo / DeepEval | Lightweight structured assertions and model-graded checks. | Better for prompt/tool behavior than full software PR correctness. |

## Benchmark stages

1. **Task generation**
   - Mine or author candidate tasks.
   - Preserve provenance.
   - Draft public prompt and private evaluator material.

2. **Task curation**
   - Review the task before candidate agents run.
   - Accept, revise, or reject.
   - Freeze accepted task packets under `<pi-config-dir>/benchmarks/suites/<suite-id>/tasks/<task-id>/`.

3. **Candidate execution**
   - Run candidate agents/configs against the frozen packet.
   - Capture patches, logs, final answers, transcripts, config hashes, model IDs, tool versions, and timestamps.

4. **Candidate-output review**
   - Review frozen task packet plus anonymized candidate artifacts.
   - Use judgment, not brittle deterministic rules, unless a deterministic scorer is explicitly part of the packet.

5. **Reporting**
   - Aggregate paired outcomes.
   - Report uncertainty, ties, neither-acceptable counts, and category breakdowns.

## Deterministic tests vs deterministic mechanics

Deterministic solution tests are optional. Review-only benchmarks are valid when task packets contain enough evaluator context for model or human judgment.

Deterministic mechanics are not optional. Always preserve:

- complete manifests;
- public/private split;
- hidden/gold artifact separation;
- stable task version;
- candidate anonymization;
- randomization record;
- rubric version;
- artifact paths;
- reviewer output schema.

## Task source methods

### Real issue / PR mining

Best for bug fixes and features with meaningful repository context.

Minimum checks:

- base commit is before the fix;
- public prompt does not reveal patch details;
- task has one coherent objective;
- original tests or review notes support the evaluator brief;
- unrelated cleanup from the original PR is excluded from expected outcome.

### Commit rollback

Best for clean commits without issue context.

Minimum checks:

- commit is single-purpose;
- prompt can be written from user-facing behavior, changelog, logs, or neutral spec;
- gold patch is private reference only;
- evaluator brief describes desired outcomes, not implementation steps.

### CI fail/pass mining

Best for debugging and build/config tasks.

Minimum checks:

- failure is reproducible outside transient CI infrastructure;
- failure and fix are causally related;
- secrets and environment-specific paths are removed;
- prompt includes enough logs without leaking the fix.

### Mutation / seeded bug

Best for scalable bug-fix tasks and stress tests.

Minimum checks:

- bug is plausible;
- not just syntactic trivia;
- hidden or reference checks distinguish real fix from revert/gaming;
- curator confirms it teaches useful agent behavior.

### Review-only task

Best for refactors, architecture, test-quality, docs/API design, safety, and restraint tasks.

Minimum checks:

- evaluator brief states outcomes and anti-solutions;
- public prompt is clear enough for candidates;
- no single exact patch is required;
- review rubric can distinguish excellent, acceptable, weak, and reject.

### Adversarial behavior task

Best for agent-config evaluation.

Examples:

- correct answer is to make no changes;
- task requires asking a clarification question;
- misleading tests/logs tempt a bad fix;
- unsafe command or broad rewrite is tempting;
- stale context conflicts with source truth.

## Minimum viable benchmark suite

For manual config comparisons, keep the active suite under `<pi-config-dir>/benchmarks/suites/<suite-id>/` and use task manifest lifecycle status to include or exclude tasks.

- 10-15 smoke tasks to catch obvious regressions;
- 30-40 directional tasks for day-to-day config decisions;
- 80+ non-tie outcomes for decision-grade comparisons;
- include no-op/restraint and ambiguous tasks, not only code-generation tasks.

## Common failure modes

| Failure | Prevention |
|---|---|
| Bad tasks inflate or hide candidate quality | Curate tasks before runs. |
| Reviewers see agent identity | Blind labels and randomize X/Y. |
| Pairwise winner is still bad | Include “neither acceptable” and merge-readiness. |
| Judge prompt drift changes results | Version rubrics and reviewer prompts. |
| Tests become the whole benchmark | Treat tests as evidence, not truth, unless task is explicitly deterministic. |
| Generated tasks are artificial | Require realism/usefulness review. |
| Output review leaks gold solution | Hide gold/reference patch except in audit mode. |
