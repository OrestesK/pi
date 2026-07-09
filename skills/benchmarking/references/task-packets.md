# Task packets

A benchmark task packet is a frozen bundle of public candidate-facing material, private evaluator material, provenance, and review metadata.

## Persistent storage

Store Pi-local benchmark suites under `<pi-config-dir>/benchmarks/`; on the default Linux setup this expands to `~/.config/pi/benchmarks/`. Do not hardcode a specific user's home directory in manifests or reviewer packets.

Recommended suite layout:

```text
<pi-config-dir>/benchmarks/
  suites/
    <suite-id>/
      suite.yaml
      tasks/
        <task-id>/
          task-manifest.yaml
          public/
          private/
          artifacts/
      runs/
        <run-id>/
          run-manifest.yaml
          candidates/
          reviews/
          reports/
```

Use paths relative to the suite root inside manifests unless an artifact is intentionally external, such as a large object store path. Use `templates/run-manifest.yaml` as the canonical run manifest starter.

Reference prefixes:

- no prefix: suite-root-relative artifact;
- `suite:`: logical suite reference, e.g. `suite:<suite-id>`;
- `task:`: path relative to the current task root, e.g. `task:public/task.md`;
- `benchmarking:`: benchmarking skill reference/template, e.g. `benchmarking:templates/candidate-output-review.json`;
- `session:`: logical session/subagent transcript reference, not a filesystem path;
- `host_local:`: local recovery path that must not be published;
- `external:`: object store, URL, or other non-suite artifact reference.

Candidate workspaces should contain only candidate-facing files. Prefer isolated workspaces that are not nested above private task material. If a workspace must live inside a larger benchmark repository, the candidate prompt and harness must forbid parent-directory discovery and repo-level status/listing commands that can expose private paths.

## Required task layout

Recommended task layout under `tasks/<task-id>/`:

```text
<task-id>/
  task-manifest.yaml
  public/
    task.md
    setup-notes.md
    public-logs/                # optional
  private/
    evaluator-brief.md
    reference-outcome.md         # optional but recommended
    gold.patch                   # optional
    hidden-tests/                # optional
    anti-solutions.md            # optional
    task-origin.md              # audit-only, not for normal candidate-output review
    generation-rationale.md     # optional audit-only generation notes
  artifacts/
    validation/                  # optional pre-run validation evidence
```

Use equivalent paths when integrating with an existing harness, but preserve the same public/private distinction and record the storage root in the manifest.

## Public material

Public material is what candidate agents can see.

It may include:

- task statement;
- relevant issue summary;
- setup notes;
- public tests or commands;
- public logs;
- allowed tools/budget;
- success criteria written as outcomes;
- explicit allowed-edit boundaries and read-only artifact rules.

For implementation tasks, `public/task.md` must state that public tests, task files, manifests, private files, hidden tests, scorer files, and benchmark metadata are read-only. If candidates believe tests or task material are wrong, they must report that instead of editing them.

It must not include:

- gold/reference patch;
- hidden tests;
- hidden test names when those names leak the fix;
- reviewer notes;
- candidate comparison labels;
- private source PR comments that reveal implementation;
- generated task rationale that gives away the trick.

## Private evaluator material

Private material is for task curators and output reviewers.

It may include:

- evaluator brief;
- reference outcome;
- gold patch when available;
- hidden tests or scorer commands;
- anti-solutions;
- known edge cases;
- task provenance;
- leakage risks;
- expected difficulty and task type.

Candidate-output reviewers should not see gold patches or generation rationale by default. Give them outcome notes, risks, anti-solutions, logs, and candidate artifacts. Use gold/reference patches and task-origin/generation-rationale material only in audit mode or deterministic validation.

## Reviewer exposure tiers

Declare evidence exposure before broad reviewer fanout.

| Tier | Intended readers | Examples |
|---|---|---|
| `normal_reviewer` | Blinded leaf reviewers. | Public task, reviewer-visible evaluator excerpt, anti-solutions, blinded candidate artifacts, frozen public/scorer summaries when allowed, opaque blinding id. |
| `elevated_reviewer` | Specialized lanes that need more context. | Sanitized hidden/scorer summaries, process excerpts, limited transcript excerpts. |
| `audit_only` | Curators, auditors, deterministic validators. | Gold/reference materials, hidden-test bodies, task origin, generation rationale, raw transcripts, raw local paths. |
| `reducer` | Reducers/adjudicators. | Reviewer JSON outputs, rubric versions, packet ids, blinded labels, agreement stats. |

Candidate agents never receive private/gold/scorer materials. Normal reviewers should receive opaque artifact ids and sanitized bounded excerpts, not raw host paths or unblinding maps.

## Manifest fields

Use `templates/task-manifest.yaml` as a starter. Minimum fields:

- `id`, `version`, `status`;
- `source.type` and provenance;
- `suite.id`, `suite.root`, and `suite.task_root`;
- `environment` or base repo state;
- candidate workspace and generated-artifact policies when the workspace is nested inside a larger repo or the task can produce incidental artifacts;
- `visibility.public_artifacts`;
- `visibility.private_artifacts`;
- `scoring.primary_mode`;
- `scoring.review.rubric_version`;
- `scoring.review.reviewer_prompt_version`;
- `run_metadata_requirements` for config/model/prompt/tool/artifact capture;
- `visibility.private_artifacts_not_for_candidate_review` for gold, hidden tests, task origin, and generation rationale;
- `visibility.reviewer_exposure_policy` for normal, elevated, audit-only, and reducer-visible evidence;
- `scoring.review.topology_profile` and reducer policy when panel review is expected;
- `labeling` when labels or expected findings will support precision/recall/F1;
- `blinding.assignment_record_path` and `blinding.anonymization_map_path` for paired review;
- `mechanics` checklist;
- `metadata` for task type, difficulty, domains, risks.

## Task modes

| Mode | Meaning | Primary evaluator |
|---|---|---|
| `deterministic` | Hidden/public tests or exact scorer are authoritative. | Test/scorer output, with review for diagnosis. |
| `review_only` | No deterministic solution scorer is expected. | Human/LLM rubric review. |
| `hybrid` | Tests/logs are evidence but not complete truth. | Tests plus reviewer judgment. |

Prefer `hybrid` for real software changes where tests exist but do not prove maintainability, compatibility, or design quality.

## Generation workflow

1. Choose source: PR/issue, commit rollback, CI fail/pass, mutation, backlog, review-only, or adversarial behavior task.
2. Freeze base state: commit, image, workspace, dependency versions, or setup notes.
3. Draft candidate-facing task in `public/task.md`.
4. Draft evaluator-facing notes in `private/evaluator-brief.md`.
5. Add reference outcome and anti-solutions.
6. Fill the manifest.
7. Run mechanical checks that are possible.
8. Send to task curation review.

## Mechanical checks

Before task curation, verify or mark missing:

- all referenced files exist;
- public/private split is clear;
- no gold/reference path appears in public material;
- no hidden-test path or secret appears in public material;
- base commit or setup can be located;
- budget and allowed tools are recorded;
- rubric/evaluator and reviewer-prompt versions are recorded;
- candidate run metadata requirements are recorded;
- paired-review blinding record paths are recorded when pairwise review is expected;
- task-origin and generation-rationale artifacts are excluded from normal candidate-output review;
- reviewer-visible excerpts exclude audit-only evidence;
- reducer-visible evidence is limited to reviewer outputs unless an elevated reducer is declared;
- candidate workspace isolation is checked, especially when candidate workspaces are nested under the suite root;
- public task instructions declare allowed edit globs and read-only public/task/scorer artifacts;
- public/scorer commands avoid incidental artifacts where practical, or those artifacts are explicitly separated from source/test diffs;
- task status is `draft`, not `accepted`.

## Acceptance gate

A task packet is not benchmark-ready until task curation returns `accept` and the manifest status changes to `accepted` or equivalent.

After a candidate has seen an accepted packet, treat that packet and its scorer inputs as immutable. Do not patch public tests, hidden tests, evaluator briefs, prompts, setup files, or manifests in place for that run. If a defect is found after exposure, either invalidate the run or create a new task version and rerun candidates.

Scoring must use a clean scorer workspace populated from the accepted task packet, not from candidate workspaces. Candidate edits to tests, prompts, setup files, or scorer files are process evidence; they are not scorer truth.

Report code/result correctness separately from trajectory/process and harness outcome. A candidate can pass frozen tests while failing process constraints, and an acceptance wrapper can fail because of report-format brittleness rather than task failure. Preserve both signals instead of collapsing them into one verdict.

Do not run candidate agents on draft tasks for decision-grade comparisons. Exploratory trials are allowed only if labeled as exploratory.
