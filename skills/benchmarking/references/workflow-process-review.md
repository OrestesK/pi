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

For high-fanout process review, use `references/reviewer-topology.md`. Assign distinct lanes, require reducer fan-in, and record reviewer topology in the structured output. Do not launch many generic process reviewers without a reducer.

Published or user-facing workflow audits should use logical references and repo-relative paths. Do not publish raw home-directory paths, temp workspace paths, tool-install paths, private blinding-map contents, secrets, or hidden-test bodies. Keep raw host paths only in local scratch evidence when they are needed for recovery.

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
| Benchmark mechanics | Were packet completeness, public/private split, scorer immutability, blinding, and benchmark-run mechanics handled correctly? |
| Tool fit | Were tools appropriate and least-powerful enough for the evidence needed? |
| Code intelligence use | For code work, did workers/reviewers use tree-sitter, ast-grep, and LSP where code structure, symbols, or diagnostics mattered? |
| Subagent strategy | Were subagents distinct, useful, bounded, and fan-in reviewed? |
| Concurrency control | Did concurrent work stay isolated and avoid shared-workspace conflicts? |
| Evidence discipline | Were claims backed by fresh artifacts, logs, diffs, or session evidence? |
| Artifact hygiene | Were generated files, temp workspaces, reports, and scorer inputs controlled? |
| Context economy | Did the run avoid unnecessary context files, broad reads, duplicate artifacts, and noisy outputs? |
| Safety/privacy | Were private/gold/hidden materials protected and destructive operations avoided? |
| Recovery and invalidation | Did the workflow detect contamination/failures and version/invalidate instead of papering over them? |
| Verification | Were final checks relevant, fresh, and inspected before completion? |
| Reporting clarity | Did the final report separate code/output score, process score, harness issues, missing evidence, and confidence clearly? |

## Numeric score

When the user wants a score, produce `process_efficiency_score` from 0 to 100.

Default weights:

| Component | Weight |
|---|---:|
| Goal focus | 8 |
| Planning and approval | 8 |
| Benchmark mechanics | 8 |
| Tool fit | 8 |
| Code intelligence use | 8 |
| Subagent strategy | 8 |
| Concurrency control | 8 |
| Evidence discipline | 8 |
| Artifact hygiene | 8 |
| Context economy | 7 |
| Safety/privacy | 8 |
| Recovery and invalidation | 7 |
| Verification | 7 |
| Reporting clarity | 6 |

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
- review topology profile, reducer/adjudicator refs, and second-wave triggers when a panel was used;
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
- invalid tool arguments, schema mismatches, or blocked tool-policy warnings are repeated instead of corrected or escalated, including Edit/Write blind-write, ambiguous-edit, or repeated-edit warnings;
- read-only git commands keep running after the workspace is known not to be a git repo;
- code-editing or code-review subagents skip tree-sitter/LSP despite identifiable symbols, multi-file edits, or code-diff review;
- aggregate tool counts used to infer avoidable work without exact overlap evidence;
- validation, lint, typecheck, or test output reported as clean despite warnings, failures, skips, truncation, reconstruction, or an unnecessary rerun after an already-green check without file changes or a stated validity reason;
- optional supplemental context files block progress after required task inputs are already sufficient;
- too many duplicate reviewers with no new angle;
- async subagents left unresolved;
- final claim made from subagent summary only;
- declared final-answer/output artifact missing, empty, or reconstructed without being reported as a harness issue;
- context files written but never used;
- memory/todo state left stale;
- reviewer packet prepared before deterministic score exists when scores might make review unnecessary;
- missing artifact tree or missing transcript/session references.

## Deep audit mode

Use deep audit mode when the user asks for a Docent-style or comprehensive run analysis, asks to examine every edge, or when the workflow itself is high-stakes, broad, or disputed.

Deep audit mode is evidence-heavy. It should reconstruct the run, not merely summarize it.

### Deep audit inputs

Collect or explicitly mark missing:

- parent session logical ref and relevant turn ranges; keep raw JSONL path local-only;
- subagent logical refs, run ids, statuses, repo-relative output refs, and retry relationships;
- run/task manifests;
- candidate metadata, declared final-answer/output refs, reconstruction metadata, frozen workspaces, and workspace file lists;
- scorer result JSON, logs, diffs, and scorer-input copies;
- review packets, blinded review outputs, and private blinding-map paths without exposing private map contents in public summaries;
- todo, memory, and tape state;
- artifact trees and generated-artifact scans;
- exact tool-result availability: direct, bounded, virtualized preview-only, recoverable `tr_*`, missing, or not inspected;
- wall-clock timing, retry overhead, failed tool/reviewer overhead, artifact generation/scoring time, and optional tool/subagent cost where available;
- sanitized logical references for user-facing output, with raw host paths kept only in local scratch evidence when necessary.

### Reconstructed trace

Build a normalized `trace_events[]` model for complex runs. Each event should include:

- order or timestamp;
- actor: parent, subagent, worker, reviewer, tool, user, harness;
- lane: orchestration, task-packet, candidate-a, candidate-b, scoring, review, reporting, audit;
- action;
- status: ok, blocked, revise, accepted, invalidated, failed, retried, skipped;
- input refs;
- output refs;
- retry-of or invalidates links;
- evidence refs.

Trace reconstruction should show what happened, why it happened, and where the workflow could have stopped earlier.

### Subagent lineage

Model subagents as a lineage graph or table, not just a count.

For each node, record:

- node id or run id;
- parent id;
- role;
- lane/scope;
- logical session ref, such as `session:<id>` or `subagent:<run-id>/<index>`;
- status;
- retry-of link;
- repo-relative or logical output refs;
- whether the parent inspected the output before relying on it;
- distinctness/usefulness assessment.

### Tool and virtualization audit

Account for both parent and child tool use.

For each major tool family, record:

- parent call count;
- child call count;
- virtualized/truncated result count;
- main use;
- fit assessment;
- invalid or blocked calls that were retried without changing the argument shape or approach, including Edit/Write policy warnings;
- read-only git calls that kept running after a non-git workspace failure;
- missed better tool, such as LSP/tree-sitter where code structure mattered;
- any skipped mandatory code-intelligence gate and the child’s stated reason, or absence of such a reason;
- whether material tree-sitter, ast-grep, or LSP calls answered a concrete implementation/review question instead of being reported only as compliance;
- evidence-availability impact.

Do not infer that reads, greps, or bash calls were replaceable from aggregate tool counts alone. Mark a lookup as avoidable only when the review can cite an earlier code-intelligence result that provided the same fact, a later overlapping read/search, and no intervening file-changing edit that made the earlier result stale. Classify validation, tests, linters, typechecks, and git probes separately from code browsing.

Validation and verification claims must distinguish clean passes from warnings, failures, skipped checks, truncated output, reconstructed evidence, and unnecessary reruns after already-green checks without file changes or a stated validity reason. A warning-only nonzero static-check result is not an unqualified pass.

Do not treat a tool-result preview as complete evidence. If a claim depends on a virtualized result, retrieve exact bounded lines, export the result, or mark the evidence as preview-only.

### Artifact census

For every material artifact class, record:

- repo-relative path, logical ref, or sanitized path pattern;
- owner/lane;
- source, generated, frozen, derived, or private;
- sensitivity: public, private, hidden/gold, host-path-sensitive, or process residue;
- inspected/not-inspected status;
- audit relevance;
- retention recommendation: keep, sanitize, deduplicate, move to debug bundle, or delete only with explicit approval.

A good deep audit distinguishes canonical evidence from process residue. Generated caches and tool logs may be useful process evidence while still being bad canonical snapshots.

Verify declared final-answer/output refs as artifacts: each should exist, be non-empty, and match the artifact actually used for review. If a final output was reconstructed from a transcript or another source, mark it as `harness_reliability` evidence and cite the reconstruction source.

For benchmark validation commands, prefer no-cache or redirected-cache modes so `.ruff_cache`, `__pycache__`, `.pi-lens`, and similar process residue do not become accepted candidate artifacts. If residue is unavoidable, keep it out of canonical snapshots or flag it explicitly as process residue.

### Severity taxonomy

Classify every finding.

Severity:

- `blocker`: invalidates the run or workflow claim unless fixed.
- `serious`: materially harms reliability, privacy, repeatability, or decision confidence.
- `moderate`: inefficient or risky but does not invalidate the run.
- `minor`: cleanup, clarity, or small overhead.
- `positive`: practice to preserve.

Class:

- `planning_approval`
- `tool_fit`
- `subagent_orchestration`
- `concurrency_isolation`
- `evidence_discipline`
- `artifact_hygiene`
- `safety_privacy`
- `scoring_separation`
- `harness_reliability`
- `context_economy`
- `recovery_and_invalidation`
- `reporting_clarity`

Affected surface:

- `output_score`
- `process_only`
- `harness_only`
- `privacy_safety`
- `decision_confidence`

### Evidence matrix

Every major finding should include:

- claim;
- severity;
- confidence;
- evidence refs;
- counterevidence;
- missing evidence;
- impact;
- recommendation;
- finding disposition from `references/reviewer-topology.md` (`supported`, `unsupported`, `duplicate`, `overturned`, `needs_adjudication`, or `second_wave_requested`);
- recommended action: adopt now, defer, reject, needs approval, or changes to future workflow.

### Time-cost accounting

When timing exists, report:

- candidate runtime per lane;
- parent orchestration elapsed time when recoverable;
- curation/retry overhead;
- failed reviewer/tool overhead;
- wait/idle time if known;
- failed tool or reviewer overhead;
- artifact generation and scoring time if known.

Do not score raw elapsed time without context. A deep audit should distinguish necessary rigor from avoidable churn.

### Deep audit outputs

For deep audits, produce both:

User-facing deep audit outputs must not contain raw host paths. Use repo-relative paths for artifacts inside the suite and logical refs for sessions/subagents/tool-result handles.

- `templates/workflow-process-audit.md` for readable narrative;
- `templates/workflow-process-review.json` or a filled variant for structured comparisons and downstream aggregation.

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

Use `templates/workflow-process-review.json` for structured output. Use `templates/workflow-process-audit.md` for deep narrative audits.
