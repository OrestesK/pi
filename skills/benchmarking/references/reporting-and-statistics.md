# Reporting and statistics

Use this reference to summarize benchmark runs and compare configurations without overstating noisy results.

## Primary outputs

A benchmark report should include:

- benchmark suite name, version, and suite root under `<pi-config-dir>/benchmarks/`;
- task count and category breakdown;
- candidate/config identifiers or blinded labels;
- run dates and environment summary;
- config hashes, model IDs, agent versions, prompt versions, and tool versions when known;
- rubric, reviewer-prompt, reviewer model, and judge setup versions;
- blinding assignment record and anonymization-map references for paired reviews;
- deterministic mechanics status;
- separate final-output/code result, process/trajectory result, and harness/report-format result for each run;
- candidate edits to task/scorer files as process evidence, not scorer truth;
- paired win/loss/tie/neither counts;
- absolute readiness counts;
- safety vetoes;
- judge/reviewer agreement where available;
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

## Process and harness flags

Do not collapse every run problem into code failure.

Track separately:

- final output/code result: frozen tests, review verdict, or declared scorer outcome;
- process/trajectory result: private path exposure, task/scorer edits, generated artifact handling, unsafe commands, or policy violations;
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

Do not mark a task invalid just because a candidate edited public tests or an acceptance wrapper rejected malformed final JSON, if frozen scorer inputs and candidate artifacts still allow fair scoring. Record those as process or harness flags.

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
- whether trajectory review can affect the final verdict.

If these were not predeclared, label the result exploratory or directional.
