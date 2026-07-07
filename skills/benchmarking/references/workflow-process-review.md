# Workflow/process review

Workflow/process review judges how a benchmark run was executed, independent of candidate output correctness and frozen scoring.

Use this review when the user asks how the agent worked, how efficient the run was, whether the workflow was streamlined, or how two benchmark runs/configurations compare on orchestration quality.

## Boundary

This is not candidate-output scoring.

Keep these outcomes separate:

- **Final output/code result**: frozen tests, hidden tests, rubric review, or declared scorer outcome.
- **Workflow/process result**: planning, tool choice, subagent strategy, artifact hygiene, evidence discipline, safety, and efficiency.
- **Harness/report-format result**: runner failures, malformed final reports, missing artifacts, broken monitor/reviewer attempts, parser failures.

A workflow/process score may diagnose waste or risk. It must not override the frozen code/output result unless the benchmark policy explicitly declares a process veto.

## Required inputs

Use the smallest available evidence set that can answer the question:

- run manifest(s);
- run summary/report;
- candidate metadata/final answers when relevant;
- session JSONL or session-reader `toc`, `tools`, and `subagents` views;
- subagent run summaries and statuses;
- todo state and memory updates;
- artifact tree or file list for run outputs;
- tool/command logs when available;
- explicit user approvals or constraints;
- known policy docs for the benchmark suite.

Do not inspect hidden/private benchmark material unless the workflow review is explicitly in audit mode and the user approved that scope.

## Review order

1. State the evaluated scope: session, run, candidate lane, or whole suite.
2. Summarize workflow shape from evidence:
   - tools used;
   - subagents spawned;
   - chains/background jobs;
   - todos/memory/tape use;
   - files/artifacts written;
   - validation and review gates;
   - invalidated/retried steps.
3. Separate necessary work from avoidable work.
4. Identify safety/privacy/approval boundary behavior.
5. Identify artifact/context hygiene issues.
6. Assign qualitative ratings and, if requested, a numeric process-efficiency score.
7. Compare runs/configs only after normalizing for task difficulty and required evidence.
8. List concrete next workflow improvements.

## Dimensions

Use these dimensions for single-run or comparative review.

| Dimension | Question |
|---|---|
| Goal focus | Did actions advance the requested benchmark objective without drifting into unrelated work? |
| Planning and approval | Were tiering, approvals, and scope boundaries handled at the right time? |
| Tool fit | Were tools appropriate and least-powerful enough for the evidence needed? |
| Subagent strategy | Were subagents distinct, useful, bounded, and fan-in reviewed? |
| Concurrency control | Did concurrent work stay isolated and avoid shared-workspace conflicts? |
| Evidence discipline | Were claims backed by fresh artifacts, logs, diffs, or session evidence? |
| Artifact hygiene | Were generated files, temp workspaces, reports, and scorer inputs controlled? |
| Context economy | Did the run avoid unnecessary context files, broad reads, duplicate artifacts, and noisy outputs? |
| Safety/privacy | Were private/gold/hidden materials protected and destructive operations avoided? |
| Recovery and invalidation | Did the workflow detect contamination/failures and version/invalidate instead of papering over them? |
| Verification | Were final checks relevant, fresh, and inspected before completion? |
| Streamlining | Could the same trustworthy result have been reached with fewer steps or cleaner routing? |

## Numeric score

When the user wants a score, produce `process_efficiency_score` from 0 to 100.

Default weights:

| Component | Weight |
|---|---:|
| Goal focus | 10 |
| Planning and approval | 10 |
| Tool fit | 10 |
| Subagent strategy | 10 |
| Concurrency control | 10 |
| Evidence discipline | 10 |
| Artifact hygiene | 10 |
| Context economy | 10 |
| Safety/privacy | 10 |
| Recovery/verification | 10 |

Scoring guidance:

- `90-100`: streamlined, well-gated, minimal avoidable work, strong evidence, clean artifacts.
- `75-89`: effective with minor overhead or artifact/process noise.
- `60-74`: usable but materially inefficient, noisy, or over-delegated.
- `40-59`: result may be valid but workflow has serious waste, missing gates, or avoidable contamination.
- `<40`: workflow is unreliable for benchmarking even if final code/output passed.

Do not penalize necessary extra work caused by discovered benchmark bugs. Do penalize avoidable rework from premature acceptance, missing gates, bad artifact policy, duplicate advisors, or uninspected subagent output.

## Comparative review

For comparing two or more runs/configs, use normalized dimensions.

Report:

- task/run identifiers;
- difficulty and scope normalization notes;
- process-efficiency score per run/config;
- dimension deltas;
- invalid/retry count;
- subagent count and whether each had a distinct role;
- tool/artifact footprint;
- evidence completeness;
- safety/privacy incidents;
- recommended workflow winner, tie, or inconclusive.

Never compare raw tool-call counts without context. A hard run with curation, invalidation, frozen scoring, and blinded review should have more workflow cost than a tiny deterministic smoke.

## Common findings

Useful positive findings:

- external isolated candidate workspaces;
- accepted packet validation before exposure;
- frozen scorer-input copies;
- blinded review with private X/Y mapping;
- subagent outputs inspected before claims;
- invalidation/versioning after contamination;
- final report separates code, process, and harness results.

Common negative findings:

- candidate sees hidden/private paths;
- scorer uses candidate-edited tests;
- generated caches contaminate accepted task packets;
- too many duplicate reviewers with no new angle;
- async subagents left unresolved;
- final claim made from subagent summary only;
- context files written but never used;
- memory/todo state left stale;
- reviewer packet prepared before deterministic score exists when scores might make review unnecessary;
- missing artifact tree or missing transcript/session references.

## Output discipline

Lead with the workflow verdict and process score when requested.

Always include:

- evaluated scope;
- evidence sources inspected;
- workflow timeline or stage list;
- tool/subagent/todo/memory/artifact summary;
- dimension ratings;
- process-efficiency score if requested;
- what was necessary vs avoidable;
- concrete next improvements;
- approval/privacy caveats.

Use `templates/workflow-process-review.json` for structured output.
