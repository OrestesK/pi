# Reporting and statistics

Use this reference to summarize benchmark runs and compare configurations without overstating noisy results. Use `templates/benchmark-report.json` when structured report output is useful.

## Primary outputs

A benchmark report should include:

- benchmark suite name, version, and suite root under `<pi-config-dir>/benchmarks/`;
- task count and category breakdown;
- candidate/config identifiers or blinded labels;
- run dates and environment summary;
- config hashes, model IDs, agent versions, prompt versions, and tool versions when known;
- rubric, reviewer-prompt, reviewer model, and judge setup versions;
- blinding assignment record and anonymization-map references for paired reviews;
- rubric-packet mechanics status;
- separate final-output/code result, process/trajectory result, and harness/report-format result for each run;
- candidate edits to task/rubric files as process evidence, not scoring truth;
- paired win/loss/tie/neither counts;
- absolute readiness counts;
- optional anchored 0-10 secondary score summaries when predeclared, reported as median/range rather than averages;
- safety vetoes;
- judge/reviewer agreement and adjudication metrics where available;
- observed resource metrics: wall time, active runtime, tokens, estimated cost, tool calls, subagent counts, and second-wave count when available;
- label metrics when labels or expected findings exist;
- task-level table;
- category-level analysis;
- decision and confidence.

## Two-config comparison

For A vs B, use task-level paired outcomes.

Recommended counts:

- A wins;
- B wins;
- ties;
- neither acceptable;
- invalid tasks;
- safety vetoes by config;
- merge-ready counts by config.

Primary metric:

```text
paired_win_rate_A = (A_wins + 0.5 * ties) / valid_comparison_tasks
```

Report ties and neither-acceptable separately. Do not hide them inside one score.

## Optional 0-10 secondary scores

Use numeric scores only when the benchmark predeclares anchored 0-10 semantics in the rubric/schema. Keep qualitative verdict/readiness as the primary metric. For panel scores, report median, range, count, and reducer rationale. Do not average unlabeled judge scores, and do not convert old qualitative-only reviews into post-hoc numeric scores.

Numeric scores are invalid for decision-grade reporting when leaf reviews lack provenance, task-public sufficiency classification, or expectation-source labels for rejection-critical findings.

## More than two configs

Use pairwise matrices first. Use Bradley-Terry-style ranking only when:

- comparing three or more configs;
- maintaining a rolling leaderboard;
- enough pairwise outcomes exist;
- the report clearly states uncertainty and data sparsity.

Avoid online Elo for one-off offline comparisons.

## Confidence language

Use these labels:

- `high` — enough tasks, stable task curation, consistent reviewer agreement, result exceeds predeclared practical delta.
- `moderate` — useful directional result, but limited tasks or some reviewer disagreement.
- `low` — smoke-test only, noisy, small sample, or many invalid/tie/neither outcomes.
- `inconclusive` — no decision-grade difference.

Do not present small samples as proof.

## Sample-size guidance

| Size | Use |
|---|---|
| 5-10 tasks | Smoke test; catches obvious regressions. |
| 20-40 tasks | Directional signal for config iteration. |
| 80+ non-tie outcomes | Decision-grade when effect is large and task mix is balanced. |
| 200+ outcomes | Leaderboard or fine-grained tuning. |

## Category breakdowns

Always look for subgroup effects:

- bugfix;
- feature;
- refactor/migration;
- CI/debugging;
- review-only;
- safety/restraint;
- long-context;
- tool-use;
- test-quality.

A config can improve one category while regressing another. Report both.

## Panel and label metrics

For high-fanout review panels, report:

- topology profile: `single_review`, `quality_gate_3`, `matrix_10`, `panel_20`, or custom;
- reviewer count by role;
- finding clusters;
- agreement rate by finding cluster or label;
- validator overturn rate;
- unresolved disagreement count;
- second-wave trigger count;
- final adjudicator confidence.

When labels or expected findings exist, report:

- true positives;
- false positives;
- false negatives;
- precision;
- recall;
- F1;
- severity-weighted precision/recall/F1 when predeclared;
- support per label;
- abstentions or unknowns.

Do not compute precision/recall/F1 for unlabeled judgment-only tasks. Use agreement/adjudication metrics instead.

## Observed resource metrics

Resource use is descriptive by default. Record units and provenance.

Recommended fields:

- wall-clock time;
- active runtime;
- wait or queue time;
- tool calls total and by tool;
- subagent count by role;
- token counts;
- estimated cost;
- reviewer count;
- second-wave count.

Only treat resource metrics as a score or veto when the benchmark predeclares resource efficiency as a primary objective.

## Process and harness flags

Do not collapse every run problem into code failure.

Track separately:

- final output/code result: adjudicated review verdict against the broad rubric and task-specific outcome rubric;
- process/trajectory result: private path exposure, task/rubric edits, generated artifact handling, unsafe commands, or policy violations;
- harness/report-format result: wrapper parse failures, missing structured fields, broken artifact capture, or monitor failures.

A benchmark report may count a candidate as code-correct while process-flagged. Only convert a process or harness issue into an invalid run or safety veto when the benchmark policy declares that condition a veto.

## Invalid tasks

Track invalid tasks explicitly. Do not force-score them.

Invalid reasons:

- leaked answer;
- impossible setup;
- broken packet;
- candidate artifacts missing;
- reviewer packet not blinded;
- task ambiguity made scoring impossible;
- benchmark bug that prevents fair scoring.

Do not mark a task invalid just because a candidate edited local checks or an acceptance wrapper rejected malformed final JSON, if the frozen rubric packet and candidate artifacts still allow fair judgment. Record those as process or harness flags.

For structured output, use `templates/benchmark-report.json` and include only metrics that apply to the benchmark. Omit label metrics for unlabeled judgment-only tasks.

## Report skeleton

```text
Verdict: <A better | B better | inconclusive | benchmark invalid>
Confidence: <low|moderate|high>

Summary:
- Valid tasks: <n>
- A wins / B wins / ties / neither: <counts>
- Paired win rate A: <value>
- Merge-ready A/B: <counts>
- Safety vetoes A/B: <counts>

Decision rationale:
- <evidence-backed explanation>

Category findings:
- <category>: <finding>

Risks and limitations:
- <missing data, judge disagreement, small sample, artifacts not retained>

Next benchmark actions:
- <add tasks, rerun category, calibrate judges, retire invalid tasks>
```

## Decision rules

Before running decision-grade benchmarks, predeclare:

- primary metric;
- minimum practical delta;
- task suite version and suite root;
- candidate provenance fields to capture;
- reviewer/judge setup, including prompt versions and model IDs;
- blinding and X/Y assignment procedure;
- tie and neither handling;
- invalid-task handling;
- whether trajectory review can affect the final verdict;
- review topology profile and reducer policy;
- whether label metrics are applicable;
- whether resource metrics are descriptive or part of the primary metric.

If these were not predeclared, label the result exploratory or directional.
