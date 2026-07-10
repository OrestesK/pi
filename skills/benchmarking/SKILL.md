---
name: benchmarking
description: Use when designing, generating, curating, reviewing, or comparing agent/coding benchmark tasks and candidate outputs. Supports review-first benchmarks, task packet schemas, blinded candidate review, and benchmark run summaries.
---

# Benchmarking

Design and review agent benchmark tasks and candidate outputs without turning model judgment into a brittle rule engine.

This skill is general-purpose. Pi configuration benchmarking is one use case, not the boundary.

## Core stance

- Build benchmark **task packets**, not loose prompts.
- Store Pi-local benchmark suites under `<pi-config-dir>/benchmarks/` (normally `~/.config/pi/benchmarks/`) and never hardcode a user home directory in task packets.
- Keep task generation, task curation, candidate execution, candidate-output review, and reporting as separate stages.
- For PR-derived LLM-judge benchmarks, active scoring, judge packets, review evidence, and reporting use rubrics, gold-reference intent, and candidate artifacts only.
- Benchmark mechanics are mandatory: packet completeness, public/private split, no answer leakage, anonymization, label randomization, artifact capture, and versioned rubrics.
- Candidate-output review should be judgment-based, blinded, evidence-backed, and structured for aggregation. For gold-reference review, judges compare the candidate to the task-independent PR-quality rubric plus the original merged PR/source reference.
- Use high reviewer fanout when it improves benchmark rigor, but only through distinct lanes and reducer/adjudicator fan-in.
- Treat cost, latency, token use, and tool volume as observed metrics, not constraints, unless the benchmark explicitly targets resource efficiency.
- Report final output/code correctness, trajectory/process compliance, and harness/report-format health as separate outcomes.

## When to use

Use this skill for:

- creating private or public benchmark suites for agents or coding systems;
- converting repo history, PRs, issues, commits, CI failures, mutants, or backlog work into benchmark tasks;
- reviewing generated task packets before any candidate agent sees them;
- reviewing single or paired candidate outputs from benchmark runs;
- reviewing benchmark workflow/process efficiency independent of scoring;
- comparing two or more agent configurations;
- writing benchmark reports, rubrics, evaluator briefs, workflow/process reviews, or review packets.

Do not use this skill as a substitute for a real runner/CLI when the user asks for executable automation. The skill defines workflow, schemas, and judgment protocols; a runner should enforce them later.

## Stage boundary rules

1. **Task curation happens before candidate runs.** Do not judge candidate outputs for a task that has not passed task-packet review unless explicitly doing exploratory triage.
2. **Candidate-output review uses a frozen task bundle.** Do not revise the task while judging candidates.
3. **Accepted task packets are immutable after candidate exposure.** If task or rubric material needs a fix after a candidate saw it, invalidate the run or create a new task version.
4. **Rubric packets are the source of truth.** Never use candidate-workspace prompts, checks, or edited task files as source of truth; candidate edits to those files are process evidence only.
5. **Normal candidate review is blinded.** Hide config/model/agent identity and randomize X/Y labels.
6. **Do not show task-generation rationale to candidate-output reviewers** unless the review is explicitly in audit mode.
7. **Keep final-diff/output review separate from trajectory/process review.** Judge the result first; inspect process later for diagnostics, safety, and failure taxonomy.
8. **Record “neither acceptable.”** Pairwise winner alone is not enough.
9. **Separate rubric judgment from process evidence.** Candidate-edited task/check files, private path exposure, generated artifacts, and wrapper parse failures are process or harness signals unless the benchmark policy declares them vetoes.
10. **Workflow/process review is independent of output scoring.** It may assign an efficiency/streamline score, but that score diagnoses orchestration quality and does not replace frozen output/code results.
11. **High-fanout review requires a reducer.** Use `review_lane`, `review_panel`, and `reducer` from `references/reviewer-topology.md`; do not send duplicate generic reviewers directly into reporting.

## Workflow selection

### 1. Design or generate benchmark task packets

Use when the user asks to create benchmark tasks, mine repo history, turn PRs into tasks, or build a benchmark set.

Load and follow:

- `references/methodology.md`
- `references/task-packets.md`
- `templates/task-manifest.yaml`
- `templates/evaluator-brief.md`
- `references/pr-quality-llm-judge-rubric.md` and `templates/per_task_rubric_supplement.json` when the task uses original PR/source reference judging

Output should include:

- source type and provenance;
- public task statement;
- private evaluator brief;
- required artifacts;
- task metadata and difficulty;
- rubric and evidence-boundary mechanics checklist;
- known risks and anti-solutions;
- whether the task is gold-reference LLM-judge primary.

### 2. Review or curate generated benchmark tasks

Use when the user asks whether generated tasks are good, fair, useful, or ready for a benchmark.

Load and follow:

- `references/task-curation.md`
- `references/reviewer-topology.md` when using a curation panel
- `templates/task-curation-review.json`

Output an accept/revise/reject verdict with evidence. Reject tasks that are unclear, leaked, impossible, too broad, too trivial, unstable, or not useful for comparing agents.

### 3. Review candidate benchmark outputs

Use when the user asks to review candidate outputs, compare A/B outputs, pick a winner, or judge model-generated code from benchmark runs.

Load and follow:

- `references/candidate-output-review.md`
- `references/reviewer-topology.md` when using more than one reviewer or any reducer/adjudicator
- `templates/candidate-review-packet.md`
- `templates/candidate-judge-packet.json` for gold-reference single-output review
- `templates/candidate-output-review.json`
- `templates/candidate-review-adjudication.json` when using a reducer/adjudicator

This review is intentionally judgment-based. Do not invent test-suite scoring. For `gold_reference_single_output`, use the task statement, PR-quality rubric, per-task outcome rubric supplement, original PR/source reference, candidate artifacts, and process/verification summaries to make an evidence-backed PR-readiness judgment.

### 4. Summarize or compare benchmark runs

Use when the user asks what a run means, whether a config is better, or how to report results.

Load and follow:

- `references/reporting-and-statistics.md`
- `references/reviewer-topology.md` when reporting panel agreement, adjudication, or label metrics
- `templates/benchmark-report.json` when structured report output is useful

Report paired outcomes, ties, neither-acceptable counts, safety vetoes, confidence, category breakdowns, panel/adjudication metrics, and observed resource metrics. Use win rates for two configs; reserve Bradley-Terry-style rankings for three or more configs or rolling leaderboards.

### 5. Review workflow/process efficiency

Use when the user asks how the agent got the result, what tools/subagents/chains/todos/context files were used, whether the run was efficient or streamlined, or how two runs/configs compare on process independent of code/output scoring.

Load and follow:

- `references/workflow-process-review.md`
- `templates/workflow-process-review.json`
- `templates/workflow-process-audit.md` for deep narrative audits

Report workflow shape, tool/subagent/todo/memory/artifact footprint, necessary vs avoidable work, process/harness issues, and an optional `process_efficiency_score` from 0 to 100. For code-heavy benchmark runs, explicitly judge code-intelligence use: worker/reviewer underuse of tree-sitter, ast-grep, or LSP where code structure mattered is a `tool_fit` / `code_intelligence_use` finding. For complex runs, use deep audit mode: reconstruct the execution trace, subagent lineage, tool/virtualization footprint, artifact census, finding taxonomy, evidence matrix, time-cost accounting, recovery discipline for repeated invalid/blocked tool calls and redundant validation reruns, and cleaner future workflow. Keep this process score separate from candidate-output review and pairwise winner verdicts.

## Required mechanics checklist

For any nontrivial benchmark packet or review, verify or explicitly mark missing:

- task id and version;
- source/provenance;
- benchmark suite id and storage root;
- base repo state or environment;
- public task artifacts;
- private evaluator artifacts;
- public/private separation;
- no private answer leakage;
- rubric/evaluator version;
- gold/reference provenance and privacy policy when original PR/source judging is used;
- candidate artifact paths;
- declared final-answer/output artifacts exist, are non-empty, and any reconstruction source is recorded;
- generated residue/caches are excluded from canonical artifacts or explicitly flagged as process residue;
- anonymized candidate labels when comparing outputs;
- X/Y assignment seed or record;
- config/model/prompt versions when known;
- reviewer/judge output format;
- judge packet refs and adjudication refs when LLM/human panel scoring is primary;
- workflow/process review artifact paths when used;
- privacy/redaction notes for sensitive artifacts;
- review topology profile when using a panel;
- reviewer exposure tiers and reducer visibility;
- observed resource metrics when available.

## Output discipline

- Lead with the verdict or recommendation.
- Separate facts from judgment.
- Cite evidence from task packets, diffs, logs, manifests, reviewer briefs, or run artifacts.
- Use structured JSON where templates request it.
- If evidence is missing, say what is missing and whether the result is still usable.
- Do not overfit to tests. Passing tests can still be a bad solution; failing tests can still reveal a good partial candidate.

## Approval boundaries

Ask before:

- turning private repo history into a saved benchmark artifact;
- publishing, moving, deleting, or permanently retiring accepted benchmark tasks under `<pi-config-dir>/benchmarks/`;
- exposing private/gold/reference materials to candidate agents;
- changing benchmark scoring policy after runs exist;
- publishing benchmark tasks, results, or artifacts;
- treating model-judged outputs as decision-grade without calibration or reviewer controls.
