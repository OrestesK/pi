# Reviewer topology

Use this reference when a benchmark review needs more rigor than one leaf reviewer.

Benchmarking is not resource-constrained by default. Extra reviewers, tokens, tool calls, and latency are acceptable when they improve evidence quality. Track those costs as observed metrics; do not treat them as constraints unless the benchmark explicitly declares resource efficiency as the target.

## Core primitives

Use only three primitives:

| Primitive | Meaning |
|---|---|
| `review_lane` | One independent reviewer role over a bounded evidence scope. |
| `review_panel` | A set of non-duplicative lanes reviewing the same frozen packet or derived reviewer outputs. |
| `reducer` | The fan-in/adjudication step that clusters findings, resolves disagreement, and emits the final review result. |

Do not create a new benchmark concept for every reviewer flavor. Add metadata to these primitives.

## Review-stage control flow

For high-rigor review, use this internal stage pattern:

```text
freeze packet
  -> canonical blinded review packet
  -> reviewer assignment manifest
  -> leaf review fanout
  -> reducer/adjudicator
  -> optional targeted second wave
  -> report
```

Rules:

- Build one canonical packet per evidence scope; do not build 20 ad hoc copies.
- Leaf reviewers work independently and should not read peer outputs.
- Reducers consume reviewer outputs first, not raw candidate artifacts, unless their lane explicitly requires raw evidence.
- Second waves must target named gaps or contradictions; never rerun a generic panel.

## Topology profiles

| Profile | Use | Shape |
|---|---|---|
| `single_review` | Tiny smoke checks or low-stakes triage. | 1 leaf reviewer, no reducer required. |
| `quality_gate_3` | Small readiness checks. | 3 distinct reviewers plus parent synthesis or reducer. |
| `matrix_10` | Normal high-stakes task curation or candidate-output review. | 6-8 leaf lanes, 1-2 validators, 1 reducer. |
| `panel_20` | Decision-grade or disputed benchmark review when roles are meaningfully distinct. | Broad leaf lanes, validators, specialized reducers, final adjudicator. |

These are recipe-level benchmark topologies. Do not imply a runtime builtin exists unless the runtime actually provides it. Current benchmark docs can describe `panel_20` as a recipe even before runner automation exists.

## Example `panel_20` lane map

Leaf output lanes:

- correctness;
- completeness and edge cases;
- regression/API/data compatibility;
- maintainability and simplicity;
- tests/verification interpretation;
- safety/security/privacy;
- scope control and overengineering;
- PR readiness.

Leaf process/harness lanes:

- benchmark mechanics and scorer separation;
- tool-fit/code-intelligence/verification honesty;
- artifact hygiene and workspace contamination;
- blinding/report-format integrity;
- runner-mode and replay/frozen-snapshot integrity.

Validator lanes:

- severe-finding validator;
- evidence-citation validator;
- false-positive reviewer;
- false-negative reviewer;
- disagreement/confidence calibrator;
- X/Y order-swap or label-bias checker;
- severity calibration reviewer.

Reducer lanes:

- output reducer;
- process/harness reducer;
- final adjudicator.

Adjust counts to the task. The invariant is distinct lanes plus reducer fan-in, not exactly 20.

## Anti-duplication rules

Each `review_lane` must declare:

- `review_stage`;
- `review_role`;
- `focus_surface`;
- allowed evidence scope;
- role-specific questions;
- stop condition.

Ban vague duplicate roles such as “overall reviewer 1”, “overall reviewer 2”, or “check everything again” in high-fanout modes.

Reducers deduplicate by finding cluster, not by reviewer count. A claim does not become true because many reviewers repeated it; it becomes stronger only when independent evidence supports it.

## Shared finding shape

Use a common finding object across curation, candidate-output review, process review, and adjudication:

```json
{
  "id": "F-001",
  "subject": "candidate:X",
  "label": "correctness",
  "severity": "serious",
  "confidence": "medium",
  "claim": "",
  "evidence_refs": [],
  "counterevidence_refs": [],
  "impact": "",
  "disposition": "supported"
}
```

Recommended enum values:

- `subject`: `task`, `candidate:X`, `candidate:Y`, `run`, `review_panel`, `harness`, `report`.
- `severity`: `blocker`, `serious`, `moderate`, `minor`, `positive`.
- `confidence`: `high`, `medium`, `low`, `unknown`.
- `disposition`: `supported`, `unsupported`, `duplicate`, `overturned`, `needs_adjudication`, `second_wave_requested`.

Keep verdict/readiness fields top-level. Findings are the aggregation unit.

## Reducer contract

A reducer must:

1. Cluster leaf findings by subject, label, claim, and evidence.
2. Mark duplicates and unsupported claims.
3. Preserve minority high-severity claims when evidence-backed.
4. Identify contradictions and missing evidence.
5. Decide whether a targeted second wave is required.
6. Produce final verdict, confidence, and remaining risks.
7. Report agreement and adjudication metrics.

A reducer must not silently average reviewer prose or majority-vote unsupported claims.

## Disagreement ladder

1. Cluster equivalent findings.
2. Separate factual disagreement from severity/confidence disagreement.
3. Re-check evidence for severe or contradictory claims.
4. Use validator lanes for evidence quality and missed issues.
5. Launch second-wave reviewers only for named unresolved gaps.
6. Final adjudicator emits one of: `winner`, `tie`, `neither_acceptable`, `invalid`, or `inconclusive`.

## Evidence exposure tiers

Scale fanout only after evidence visibility is explicit.

| Tier | May include | Should not include |
|---|---|---|
| `normal_reviewer` | Public task, reviewer-visible evaluator excerpt, anti-solutions, blinded candidate artifacts, frozen public/scorer summaries when allowed, opaque blinding id. | Gold patch, hidden-test bodies, task origin, generation rationale, raw unblinding maps, raw host paths. |
| `elevated_reviewer` | Sanitized hidden/scorer summaries, process excerpts, limited transcript excerpts. | Raw hidden tests, secrets, unblinding maps, raw task-origin evidence unless explicitly required. |
| `audit_only` | Gold/reference materials, hidden-test bodies, task origin, generation rationale, raw transcripts, raw local paths. | Candidate-facing packets or normal reviewer packets. |
| `reducer` | Reviewer JSON outputs, rubric versions, packet IDs, blinded labels, agreement stats. | Raw candidate artifacts, unblinding maps, gold materials, unless using an explicitly elevated reducer. |

Candidate agents never receive private/gold/scorer materials.

## Metrics

### Observed resource metrics

Track resource use as observed metrics with units and provenance:

- wall-clock time;
- active runtime;
- wait/queue time;
- tool calls total and by tool;
- subagent count by role;
- token counts;
- estimated cost;
- reviewer count;
- second-wave count.

These metrics describe the run. They are not verdict constraints unless predeclared.

### Label metrics

When labels or expected findings exist, report:

- true positives;
- false positives;
- false negatives;
- precision;
- recall;
- F1;
- severity-weighted precision/recall/F1;
- support per label;
- abstentions.

Do not compute precision/recall/F1 for unlabeled judgment-only tasks. Use agreement and adjudication metrics instead.

### Agreement metrics

For panels, report:

- reviewer count by role;
- agreement rate by finding cluster;
- validator overturn rate;
- unresolved disagreement count;
- second-wave trigger count;
- final adjudicator confidence.
