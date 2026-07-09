# Workflow/process deep audit: <run-or-scope>

Audit id: <audit-id>
Review mode: deep_audit
Reviewer: <reviewer-id-or-model>
Reviewed at: <date>
Scope: <suite/run/session/candidate-lane scope>

## Verdict

Workflow verdict: <excellent | effective_with_flags | inefficient_but_valid | unreliable | invalid>
Process efficiency score: <0-100> / 100
Confidence: <high | moderate | low | inconclusive>

Short answer:

- <one to five bullets>

## Evidence sources

| Source | Logical ref | Evidence availability | Notes |
|---|---|---|---|
| Parent session | `session:<id>` | direct | Use logical refs in published audits; keep raw host paths in local-only scratch notes if needed. |
| Run manifest | `<repo-relative-path>` | direct | |
| Subagent session | `subagent:<run-id>/<index>` | direct / virtualized_preview / missing | Do not publish raw session-storage paths. |
| Tool result | `<source-id-or-repo-relative-path>` | bounded / recoverable / direct | |

Evidence availability labels:

- `direct`: exact content inspected directly.
- `bounded`: bounded line window or summarized excerpt inspected.
- `virtualized_preview`: preview-only; not decisive evidence unless retrieved exactly.
- `recoverable`: raw source exists via `tr_*`, logical session ref, or repo-relative artifact path but was not fully read.
- `missing`: expected evidence not found.
- `not_inspected`: intentionally out of scope.

## Reconstructed trace

| Time/order | Actor | Lane | Action | Status | Evidence | Notes |
|---:|---|---|---|---|---|---|
| 1 | parent | orchestration | <action> | <ok/retry/failed/invalidated> | `<repo-relative-path:line>` or `session:<id>:turn` | |

Include:

- approvals and scope changes;
- task creation and curation gates;
- candidate launch/finish;
- scoring and review gates;
- retries, invalidations, and failed tool/subagent attempts;
- final verification/closeout.

## Subagent lineage

| Node | Parent | Role | Lane/scope | Session/run ref | Status | Retry-of | Output refs | Evidence |
|---|---|---|---|---|---|---|---|---|
| `<node-id>` | `<parent-id>` | reviewer/worker/etc. | `<scope>` | `subagent:<run-id>/<index>` | completed/failed | `<id>` | `<repo-relative-path-or-logical-ref>` | `<repo-relative-path:line>` |

Assess:

- role distinctness;
- duplication or missing reducer/fan-in;
- async tracking and inspection;
- worker isolation;
- reviewer failures and retries.

## Tool and virtualization footprint

| Tool | Parent calls | Child calls | Virtualized results | Main use | Fit assessment |
|---|---:|---:|---:|---|---|
| `read` | | | | | |
| `bash` | | | | | |
| `tree_sitter_*` | | | | | |
| `lsp_*` | | | | | |

Call out:

- overuse/underuse of code intelligence;
- whether code-editing workers used tree-sitter before multi-file edits and `tree_sitter_symbol_definition` before identifiable symbol edits;
- whether code reviewers used tree-sitter/LSP for code-diff review and readiness gates;
- any skipped mandatory code-intelligence gate and the child’s stated reason, or absence of such a reason;
- whether material tree-sitter, ast-grep, or LSP calls answered a concrete implementation/review question instead of being reported only as compliance;
- bash used for shell-worthy work vs file browsing;
- invalid or blocked tool calls that were retried without changing the argument shape or approach, including Edit/Write blind-write, ambiguous-edit, or repeated-edit warnings;
- read-only git calls that kept running after a non-git workspace failure;
- broad reads/searches that caused avoidable virtualization;
- replaceability claims for reads, greps, or bash calls. Do not infer replaceability from aggregate counts alone; cite the earlier code-intelligence result, the later overlapping lookup, and whether any file-changing edit intervened. Treat validation, tests, linters, typechecks, and git probes separately from code browsing;
- validation reporting that conflated clean passes with warnings, failures, skipped checks, truncated output, reconstructed evidence, or unnecessary reruns after already-green checks without file changes or a stated validity reason;
- preview-only evidence that needed exact retrieval.

## Artifact census

| Artifact kind | Repo-relative path/logical ref | Owner/lane | Source/generated/frozen | Sensitivity | Inspected? | Audit relevance |
|---|---|---|---|---|---|---|
| scorer input | `<repo-relative-path>` | candidate-a | frozen | private/public | yes | |
| workspace snapshot | `<repo-relative-path>` | candidate-b | frozen | public+process residue | yes | |

Include:

- run manifest/report files;
- task/scorer inputs;
- declared final-answer/output refs, whether they exist and are non-empty, and any transcript reconstruction source;
- candidate workspaces and snapshots;
- generated caches/bytecode/tool files, including whether canonical snapshots exclude, flag, or retain them only as process residue;
- blinded packets and private maps;
- transcript logical refs, such as `session:<id>` or `subagent:<run-id>/<index>`;
- missing or external-only evidence.

## Findings and evidence matrix

| ID | Severity | Class | Affected surface | Finding | Confidence | Evidence | Counterevidence | Missing evidence | Impact | Recommendation | Disposition |
|---|---|---|---|---|---|---|---|---|---|---|---|
| F-001 | serious | artifact_hygiene | process_only | <finding> | high | `<repo-relative-path:line>` | <none> | <none> | <impact> | <fix> | adopt/defer/reject |

Every finding must be independently understandable from this matrix. Do not rely on vague prose elsewhere for confidence, missing evidence, or impact.

Severity labels:

- `blocker`: invalidates run/workflow claim unless fixed.
- `serious`: materially harms reliability, privacy, or repeatability.
- `moderate`: inefficient or risky but does not invalidate this run.
- `minor`: cleanup, clarity, or small overhead.
- `positive`: practice to preserve.

Classes:

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

Affected surfaces:

- `output_score`
- `process_only`
- `harness_only`
- `privacy_safety`
- `decision_confidence`

## Score breakdown

| Dimension | Score | Weight | Evidence | Rationale |
|---|---:|---:|---|---|
| Goal focus | | | | |
| Planning and approval | | | | |
| Benchmark mechanics | | | | |
| Tool fit | | | | |
| Code intelligence use | | | | |
| Subagent strategy | | | | |
| Concurrency control | | | | |
| Evidence discipline | | | | |
| Artifact hygiene | | | | |
| Context economy | | | | |
| Safety/privacy | | | | |
| Recovery and invalidation | | | | |
| Verification | | | | |
| Reporting clarity | | | | |

## Time-cost accounting

| Stage/lane | Started | Ended | Elapsed | Evidence | Notes |
|---|---|---|---|---|---|
| candidate-a runtime | <timestamp> | <timestamp> | <duration> | `<repo-relative-path:line>` | |
| candidate-b runtime | <timestamp> | <timestamp> | <duration> | `<repo-relative-path:line>` | |
| curation/retry overhead | <timestamp> | <timestamp> | <duration> | `<logical-ref>` | |
| failed tool/reviewer overhead | <timestamp> | <timestamp> | <duration> | `<logical-ref>` | |
| artifact generation/scoring time | <timestamp> | <timestamp> | <duration> | `<logical-ref>` | |
| parent orchestration elapsed | <timestamp> | <timestamp> | <duration> | `<logical-ref>` | approximate when inferred |

If exact timing is missing, mark the row `unknown` and state whether that weakens the score.

## Necessary vs avoidable work

Necessary work:

- <item>

Avoidable work or overhead:

- <item>

## Recommended next workflow

1. <step>
2. <step>
3. <step>

## Missing evidence and caveats

- <missing evidence>
- <privacy/approval caveat>
- <confidence caveat>
