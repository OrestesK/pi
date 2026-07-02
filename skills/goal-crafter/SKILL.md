---
name: goal-crafter
description: "Use when the user explicitly asks to write, review, refine, or turn current work into a /goal command. Crafts one paste-ready, evidence-grounded Pi /goal from current session context, compactions, memory, todos, artifacts, and relevant repo/docs without starting the goal or implementing the task."
---

# Goal Crafter

Craft one high-quality `/goal` command for Pi's local `pi-goal-supervisor`.

This skill writes a goal contract. It does not start the goal, implement the work, or run an autonomous loop.

When the user explicitly asked for goal crafting, goal-skill iteration, broad session-history mining, or research for goal design, do not ask permission for safe local read-only research, subagent research/review, or creating/updating the requested local skill artifact. Use `.scratch/` notes only when artifacts are permitted by the active task; strict no-artifact/no-file constraints mean no `.scratch/` writes. Keep moving until evidence is sufficient or a true safety/permission blocker exists.

## Trigger

Use this skill only for explicit goal-crafting intent, such as:

- "write a /goal"
- "give me a good /goal for this"
- "turn this into a goal"
- "goal for current work"
- "resume this as /goal"
- "review/refine this /goal"
- visible `/goal ...` text that the user asks to improve

Do not auto-trigger merely because work is messy, long-running, or resumable. In those cases, ask whether the user wants a `/goal`.

## Local `/goal` semantics

Pi's local `/goal` is session-scoped and continuation-oriented:

- `/goal <objective>` starts or replaces the active goal.
- `/goal`, `/goal status`, `/goal pause`, `/goal resume`, `/goal clear`, and `/goal done <evidence>` manage it.
- The supervisor queues one continuation at safe idle boundaries; it does not grant tools or permissions.
- Completion requires `GOAL_DONE: <specific evidence from transcript/artifacts/verifications>`.
- Blocking requires `GOAL_BLOCKED: <specific blocker and evidence that no safe non-asking next step exists>`.
- A blocked marker is accepted only after verifying the goal is 100% blocked by an automatic command/tool/runtime guardrail or by a missing required tool, credential, auth, access, or service. User-permission, approval, confirmation, clarification, and product/workflow decision blockers are not accepted blocker classes.
- Starting a `/goal` is evidence that the user intends the task to be doable without asking; if one path needs approval, sudo, mutating git, external mutation, private reads, HITL, or a product decision, encode that as a constraint/non-goal and choose another safe path. Emit `GOAL_BLOCKED` only when no safe non-asking workaround exists.
- Do not center goal design on permission gating. A good goal is a durable objective, scoped work boundary, verification loop, continuation policy, and observable completion evidence; runtime safety/automatic blockers remain separate.
- Do not encode unsupported terminal states as if the supervisor enforces them. No default token budget, wall-clock budget, repeated-no-progress stop, or generic "stop if unclear" unless the local goal implementation supports it.

## Resource posture

Treat explicit `/goal` use as regular-first by default. The user does not want ordinary `/goal` commands to start team/subagent/reviewer/reducer workflows unless the objective explicitly asks for that shape.

When crafting or supervising goals, keep the default resource posture simple and evidence-driven:

- For ordinary `/goal` commands, encode a main-agent default. Do not encode a supervised-team, reviewer swarm, reducer, or child-agent workflow by default.
- For nontrivial implementation, refactor, migration, PR-sized, schema/API, docs-surface, or cross-file goals, include a Contract Gate: a pre-edit contract card and owner map.
- The contract card should name the public behavior/API/schema/config/env names, compatibility boundaries, required docs/tests surfaces, explicit non-goals, and forbidden alternate shapes or artifacts.
- The owner map should identify likely source-of-truth files/layers before implementation and require final self-review to explain expected owner surfaces that were not touched.
- Use memory search, session/tape readers, relevant `.scratch` artifacts, current repo files, and context-mode for large session/log outputs when they materially improve correctness.
- Include web/code research only when the objective explicitly needs current external facts or when local evidence is insufficient to complete the goal safely.
- Add subagent/team/reducer language only when the user explicitly asks for team mode, multiple agents, a review swarm, adversarial review, or reducer synthesis.

## Evidence priority

Build the goal from evidence in this order:

1. Latest explicit user instruction in the current session.
2. Current system/developer/project instructions, especially `AGENTS.md`.
3. Current repo state and relevant files/docs named by the task.
4. Active TODOs/task trackers.
5. Current `.scratch/` artifacts, run outputs, plans, reviews, and handoffs.
6. Most recent compaction or `Continuation card:`.
7. Relevant project memory entries.
8. Prior session history directly tied to the same task.
9. External docs or best-practice sources.
10. Community examples.

Rules:

- Newer and primary evidence beats older summaries.
- If the user pauses or redirects a hypothesis, mark that branch stale and make the new branch current.
- Compactions, memory, and historical artifact paths are recovery indexes, not final authority.
- Existence-check and read historical artifact refs before treating their contents as evidence.
- Separate current facts from historical continuity.
- Mark stale, superseded, contradicted, or unverified facts explicitly.
- Do not mine unbounded history. Stop once evidence is enough to identify objective, constraints, verification, and blockers.

## Procedure

### 1. Confirm mode and scope

- Goal: produce exactly one `/goal ...` command.
- Do not implement the underlying task.
- Do not start the goal for the user unless the user explicitly asks after seeing it.
- Do not make material product/API/scope/workflow decisions silently.
- Do not ask for approval for routine local research, artifact notes, or requested local skill-file creation/update when goal crafting or goal-skill iteration is already the task.

### 2. Gather current context first

Inspect what tools can answer before asking. If the user provides an exact local path as the target, read or inspect that path directly before asking clarifying questions, especially when the surrounding context implies inspect/debug.

Inspect:

- latest user request and corrections,
- unresolved decisions,
- active TODOs or progress trackers,
- open blockers and approval gates,
- current cwd/repo/instruction constraints,
- relevant files/docs named by the task.

Use memory search when the goal depends on prior durable context. When history mining or goal-skill iteration surfaces a newly confirmed durable user/workflow preference, persist the curated preference to memory if local memory writes are allowed; do not store raw transcripts or one-off details. Use session/tape/history only when it is directly relevant to the current task. Research/review artifacts should be curated and safe: do not include raw secrets or secret-like values, and if a scanner flags an artifact, require redaction/rewrite before treating it as final evidence.

### 3. Gather continuity evidence

When the user asks to use "current session", "previous conversation", "compaction", "memory", "where we left off", or similar, inspect the relevant continuity sources:

- recent session messages,
- compaction summaries and `Continuation card:` sections,
- saved `.scratch/` research/plans/reviews/sessions/runs artifacts,
- project memory entries,
- prior session examples only when topic-matched.

Extract only facts that affect the goal: current objective, latest status, constraints, verification evidence, blockers, stale branches, and next safe action.

### 4. Build a compact goal by default

Default format:

```text
/goal <one measurable objective>.

Scope: <files/subsystems/artifacts included; explicit non-goals if needed>.

Constraints:
- <project/user/tool safety rules that must remain true>
- <forbidden actions or approval-required actions>
- Default to the main agent; do not start team/subagent/reviewer/reducer workflows unless this goal explicitly asks for them.
- For nontrivial cross-file work, use a pre-edit contract card and owner map, then final self-review against them.

Done when:
1. <verifiable acceptance criterion + required evidence>
2. <verifiable acceptance criterion + required evidence>
3. <verifiable acceptance criterion + required evidence>

Verification:
- <exact checks/artifacts to inspect, or a first criterion to discover valid checks if unknown>
- Include final self-review against the contract card, owner map, tests/docs evidence, scope hygiene, and forbidden artifacts.
- GOAL_DONE only with fresh evidence proving every Done-when item.

Blocked only if:
- <verified automatic command/tool/runtime guardrail blocks every viable safe path, or a required tool/credential/auth/access/service is missing>
- Emit GOAL_BLOCKED with the specific blocker and evidence that no safe non-asking next step exists.
```

Keep the command paste-ready. Include only details the goal runner needs.

### 5. Adapt the goal to the task shape

For bug or unexpected-behavior goals, include this spine in the acceptance criteria:

- reproduce or observe the exact failing command/input and current behavior,
- identify the supported root cause before editing, including why the behavior failed before now,
- implement the smallest behavior-correct fix,
- add or update a regression test tied to the failing behavior,
- update user-facing docs when command behavior changes,
- run narrow affected checks first, then the relevant broader check,
- use fresh review for nontrivial fixes.

When the user asks for "better", efficiency, cleanup, or stronger quality after a working first pass, add quality-ratchet criteria instead of stopping at correctness: inspect whether performance, simplicity, maintainability, concurrency/resource bounds, and reviewability are still weak; improve the smallest relevant surface; verify the improvement with fresh evidence.

For delegated subagent goals, state that inherited conversation is reference-only unless the task explicitly says to continue it, and give each child a concrete deliverable, scope boundary, validation target, and output contract. For subagent configuration work, verify discovery/registration with `subagent doctor/list/get`, fix frontmatter schema before assuming files are active, check duplicate builtin/user shadowing, disable only duplicated builtins instead of deleting packaged agents, and explicitly grant needed direct tools rather than relying on parent inheritance. Preserve exact output shape constraints such as bullet counts; when the task says to return exact text, the output contract must forbid extra explanation. For async or long-running delegated goals, include observability handles: run id when known, output/result/session paths, progress files, control thresholds, and when the parent must inspect them. For Pi subagent responsiveness/config goals, verify async support with doctor/status after reload, distinguish `asyncByDefault` from force-top-level async, and check required runtime pieces such as session dir, jiti resolution, intercom bridge, and lazily-created chain-run directories before declaring the setup broken. For async debugging, include foreground replay, artifact existence checks, and detached stderr/stdout capture when background runs vanish silently. For tool-demo goals, avoid mutating tools such as memory writes unless explicitly permitted and reversible or cleanup is available. If the task is read-only or no-edit/no-artifact, align prose with runtime/output policy: no writes means no output files unless an explicit artifact path is part of the task; do not create `.scratch/`, change `.gitignore`, or make convenience artifact setup edits. If the task says do not inspect files, do not include file-read requirements.

For review goals, include exact target files/diffs/artifacts, named risk surfaces, review angle, severity contract (`must-fix` vs notes), direct inspection requirement, changed-file justification when reviewing a broad diff, and explicit reporting when a relevant check is unavailable rather than passed. If named context files/artifacts are missing, report that and use next-best evidence only when safe and in scope. For re-review after fixes, narrow the scope to changed risk surfaces and must-fix regressions; do not reopen unrelated optional cleanup unless requested. Confirm preserved invariants as well as failures so fix passes know what not to break. For PR-comment review goals, revalidate each visible comment against current HEAD and classify it as still-valid blocker, stale/resolved, unverifiable, or non-actionable with direct evidence; do not edit unless the user explicitly asks for fixes.

For ambiguous implementation goals, especially when the user says "think where it lives", include placement/design reconnaissance before edits: inspect architecture, identify candidate locations, choose the smallest fitting location with evidence, and use advisory subagent/review when the decision is nontrivial. For broad/risky changes, include an evidence-backed recommendation and concrete diff sketch before implementation; prefer the fewest touch points and verify whether an existing layer/source of truth already owns the behavior before adding fallback code. If a supposedly simple fix expands because valid review findings expose consistency requirements, add a scope-expansion checkpoint: explain the causal chain, newly touched surfaces, why each is required, and which changes remain separable or out of scope. When the user iterates on architecture or corrects a premise, separate current-state evidence from target invariants, capture the user's corrected contract, and phase implementation/tests around those invariants before editing. For gateway/proxy architecture goals, make the boundary explicit: local clients should marshal requests/responses and hold only gateway credentials, while server-side components own provider keys, provider-specific validation, retries, token counting, uploads, and internals; local access to provider/token-retry-only internals should fail loudly unless explicitly supported. Request serialization should reject unsupported raw/provider objects rather than silently stringify them, and proxy routing should send only explicit safe overrides, not full client-side registry/provider config. For producer/consumer schema migrations, define the consumer-side typed contract, schema tests/docs, and frozen/golden examples before adding ingestion/adapters or changing lower-level producers/agents; keep those phases separate when the user defines that rollout. Reuse authoritative source types for embedded fields when docs say the wire field is exactly that source type, but keep benchmark/product-owned envelope fields in the consuming repo. For stable wire contracts, use explicit versioned top-level models/unions rather than letting V1 silently absorb future V2 fields, and add negative tests for unknown-field drift, missing required wire fields, alias round-trips, and helper usage. When reusing permissive upstream models, pre-validate nested allowed keys if the canonical contract must reject producer drift, and prevent source-model default factories from mutating the wire shape unless the docs require that field. Do not declare adjacent layers out of scope or no-change-needed without inspecting the relevant path. Default scope stays narrow, but if a blocker is proven in an adjacent repo/layer, the goal should allow evidence-driven inspection/fix there and require final review across every changed repo/surface. For separately shipped repos or ignored nested repos, include deployment-order/API compatibility notes and requested PR/status updates so one side does not land with imports or protocol expectations the other side lacks. Distinguish dependency/usefulness from feature/review-unit ownership; do not fold branches or features together merely because one deploy or use case benefits from the other.

For repo-orientation goals, include first-action inspection of `AGENTS.md`, README/docs, project structure, and relevant code symbols before recommendations.

For product/library/research or feasibility goals, include current source verification: confirm names/spelling, package availability, maintenance maturity, primary docs/source, current code paths, and caveats. Preserve no-edit mode unless implementation is explicitly requested. For feasibility answers, require source-traced root causes, options with effort/pros/cons, a recommended path, risks, and validation design. When the user challenges whether a mechanism breaks the plan, trace the actual current code path and distinguish compatible pieces from incompatible architecture. Do not rely on memory for current ecosystem claims.

For comparison, architecture-option, or benchmark goals, inspect both sides from source/docs before judging; separate researched facts from inference. Separate decision axes such as raw overhead, correctness, workload fit, managed product vs owned workflow, prototype speed vs long-term control, distributed safety, utilization, simplicity, operational risk, and UX. Test for false binaries when multiple options can run commands, read docs, or expose SDKs. Include what each option would concretely look like, argue from failure modes and concrete needs rather than generic keyword lists, and preserve plausible options instead of forcing one winner when tradeoffs differ. Require honest negative answers when evidence supports them. If benchmark numbers are not apples-to-apples, state why and define a fair workload-relevant benchmark design instead of forcing one winner. Report unavailable checks explicitly.

For config/local-settings goals, preserve the user's requested minimality: diagnose the symptom before editing, change the smallest useful setting set, isolate the harmful sub-setting instead of disabling a desired feature wholesale, avoid broad optional tuning, include the exact validation command, verify the runtime command/process behavior when possible, and require recovery/retry when an initial validation command was malformed.

For local system performance, hardware, audio, display, or daemon debugging goals, do not guess from symptoms alone: collect live process samples, service/journal/kernel logs, relevant config/code paths, package/kernel/firmware versions, and a direct repro or falsification probe before causal claims. Separate symptom recovery from durable root-cause fix; do not call a restart/rebind/reload workaround fixed when the underlying trigger can recur. Track every diagnostic state change, preserve the original settings/profile, restore them before completion unless the user approves keeping the change, and state remaining upstream/version/config risks explicitly.

For OS boot, partition, firmware, or recovery repair goals, use command-by-command handoff for privileged steps instead of dumping a long script. Run safe non-privileged diagnostics yourself when possible, then copy one exact sudo command at a time and wait for output before the next step. Before copying or rewriting boot/recovery files, require read-only inspection, backups with paths, and post-copy hash/existence verification. For reinstall or partition advice, name the exact partitions to preserve/delete and the expected boot-order/GRUB repair follow-up; do not imply a destructive reinstall is required when a targeted reinstall/repair is enough.

For MCP, model registry, or external integration config goals, inspect existing config, bundled/default/custom config sources, loader precedence, cached/live tool schemas, and current server docs before editing. For MCP tool validation errors, distinguish lazy/cached metadata from bad invocation args: check configured command/binary, cached schema required fields, a bounded live success probe when safe, and logged failed call payloads before blaming server availability or config. Ask one focused question for material auth/transport choices. Prefer OAuth or environment-based auth over tracked secrets. Validate config syntax, document restart/reload/auth follow-up, and distinguish written config from currently active tool availability.

For UI/rendering goals, include inspection of the exact render path, theme/type APIs, and existing layout constraints; prefer the smallest visual diff; preserve width/layout invariants; and include visual/manual validation or risk notes when automated verification cannot prove the UI result. Use screenshot evidence when available. For command/code block rendering, include copyability as an acceptance criterion: multiline commands should be copyable without decorative borders, gutters, prompts, or box characters unless explicitly intended. For local Pi UI customization, verify the durable ownership layer before editing: prefer the tracked extension/config/fork that survives reinstall/update, and revert accidental installed `node_modules` patches rather than leaving fragile global-package edits. For Pi extension UI changes, note that source edits may not hot-reload into an already-running Pi process and require restart/reopen verification when relevant. If the UX target is subagents/background tasks, include demo scenarios plus user-visible status/log affordances such as footer/status, selectable runs, and inspectable logs. For subagent rendering, verify live/partial states, pending/running/completed/detached/interrupted semantics, global recent activity, hidden `+more` counts grouped by type, per-agent last/+more summaries, expanded per-agent lists, and automated coverage for the renderer branches.

For frontend data-visualization or ranking goals, trace the metric from source data through transformation helpers to every displayed, ranked, filtered, or charted surface. Preserve semantic distinctions between hidden/unavailable numeric data and true zero; do not let missing or internal-only values become artificially good ranks. Prefer one shared source-of-truth helper for policy such as visibility, labels, or availability, and require review/verification across every affected visualization or recommendation surface, not just the screenshot that exposed the issue. When displayed rankings change, require an explanation grounded in the ranking/filtering algorithm, not just a before/after screenshot.

For generated data, benchmark exports, or exported artifacts, identify whether the bug belongs in source metadata, acquisition/materialization, parser shape, generator/export logic, generated artifact, downstream aggregate view, or consuming UI before editing. For count mismatches, trace expected vs produced counts at every pipeline boundary: source inputs, generated outputs, uploaded items, queue receipts, result rows, and exported views. Do not silently drop failed/empty generated items when downstream expects one output per source input; either emit explicit failure outputs or hard-fail before launching doomed long jobs. Verify the live/current file contract and ownership model before proposing schema or Lambda design; inspect actual producer/service/lambda implementations for every affected benchmark or data source instead of assuming S3 paths, archive layout, local filenames, or required files from stale scratch samples. State source precedence between live/current source, temp cache, local mirror, and fallback when multiple sources exist. External-storage fallback should only trigger for true missing-object cases; auth, credentials, permission, throttling, configured-run fetch failures, or other infra errors should surface as such and not be relabeled as file-not-found or swallowed into generic failed-item bookkeeping that preserves stale output. Prefer fixing the upstream source of truth and regenerating artifacts with exact commands; include dependency update steps when generated data comes from another repo/package, and include dependent aggregate/index views that must be refreshed together. Preserve existing parser/result shapes when the user asked only to fetch or materialize new inputs; separate acquisition from transformation unless shape migration is explicitly approved. For acquisition-only work, state where fetched artifacts may live, usually system temp or in-memory, and explicitly forbid repo-stored fetched outputs unless requested. If two artifacts are similarly named or related, name which artifact is authoritative for each consumer. Check custom loader/extension paths as well as default paths, and verify locks/hashes/cache invalidation use the same source precedence as the parser/export path so stale local mirrors do not drive rebuild decisions after a configured external run is used. Cache fingerprints for remote artifacts should include object metadata or content identity unless immutability is guaranteed and documented; run IDs alone are not enough for mutable object stores. Preserve user-requested model subsets without shrinking unrelated global metadata or marking unrelated local/stale models as freshly locked, avoid materializing or querying unrelated remote objects, enforce cardinality invariants such as single-run-per-external-result consistently across parser, lock, and materialization paths, and prevent temp-path collisions from multiple external run IDs or provider/model names that share basenames. Distinguish remote lookup keys, parser-shaped S3 object names, and local temp filenames in docs and code: keep externally required artifact names unchanged while making temp paths collision-proof. Remove permissive fallback lookup paths when the producer contract is known; fallback should be justified by real producer behavior, not investigation leftovers. Tests should run builders/parsers on representative fixture inputs and assert semantic outputs, including precedence/fallback/cache-invalidation/partial-export/temp-collision cases, not only validate generated JSON against a schema. If CI cannot access live external artifacts, narrow skips to the specific external-backed benchmark/model/check tuples instead of skipping whole benchmarks or globally excluding model names that also appear in unrelated benchmarks. For live export or migration claims, include a representative end-to-end flow with a complete/equivalent real run when allowed, and compare exported metrics/task coverage against current local/HEAD data before deleting or replacing existing results. Verify freshness with the repo’s stale-export or generated-data checks, match verification scope to the failing command, assert cleanliness for every generated backend and frontend file the command can touch, classify unrelated pre-existing failures separately, and avoid hand-editing generated outputs or UI workarounds for source-data errors unless explicitly requested. When asked whether behavior is fully tested or whether locks/generated outputs will change, separate unit/static coverage from live external validation, state untested live paths, and identify expected one-time cache/lock invalidations versus unchanged local/platform inputs.

For feature-flag or alternate-path goals, include compatibility/regression criteria for existing behavior. State whether old behavior must be byte-for-byte preserved or behaviorally preserved, and require fresh evidence for the old path and the new path.

For persisted formats, serialized files, replay/resume artifacts, compaction/history artifacts, public helper/result formats, or generated configs, include an explicit compatibility/migration decision. If old on-disk or public formats may exist, require tests for old-format reads or a documented no-compatibility decision approved by the user. When removing or moving a public/result field, trace downstream consumers, exporters, docs, and tests that reference the old surface, and add path-level tests proving the real provider/server/export path populates the new surface rather than only helper-level tests. Ensure docs match runtime behavior and artifact extensions/names match the serialized content, such as not writing JSON content under a binary-looking extension.

For branch-splitting, stack repair, commit-topology, or commit-organization goals, start with read-only graph/diff recon using exact base/head evidence, changed-path clusters, and feature-slice grouping. Preserve the user's intended branch/PR semantics and existing PR identity; do not invent branch names, rename PR branches, or create review boundaries when the existing meaning is ambiguous. Produce a plan or `.scratch/research` artifact before any mutating git command. Do not include git mutation steps as automatically approved unless the user explicitly authorized that exact mutation scope. If the user will drive git mutations, include command-by-command handoff: inspect state after each user command, verify preconditions/postconditions, revise stale plans after git-spice restacks or external diff/tool behavior surprises, and copy exact next commands when requested. Adapt to the user's Git UI/workflow: if they use lazygit, say they will commit themselves, or are a git expert, state the branch/context, unstaged file list, PR/head status, and remaining requirement instead of unsolicited checkout/commit/amend/push command blocks; verify actual local/origin/PR state yourself before saying what remains. Explicit plan-review requests should adversarially check branch topology, PR attachment, upstack branches, dirty state, failure modes, and recovery commands before giving the next command block. Rebase/restack conflict goals should resolve by preserving invariants from both sides, then run focused syntax, conflict-marker, diff-check, and relevant tests; after a stack restack, final verification should run from the top branch/final tree rather than an earlier branch missing later code. For dedicated merge-conflict agents, encode that the user initiates `gs upstack restack`, the agent may inspect `gs ls`/read-only git state and edit conflicted files, but mutating git-spice commands must be prompt-forbidden and guardrail-denied just like mutating git commands. Before reset/squash/review advice, inspect staged and unstaged scope; keep code changes separate from generated data or migration artifacts unless the user intentionally bundles them. After focused fixes atop staged work, report `MM`/staged/unstaged state and the exact staging command for the user when useful. For messy history, prefer clean-base patch splitting when appropriate: generate patch files, account for full diff coverage, mark optional/unclassified leftovers, temp-apply patches to a clean base, run syntax/tests per patch, and get a fresh review of patch separation before the user creates branches. Patch-split review must check README/user-command safety, new-file staging, optional patch dependencies, duplicate definitions, stale docs, security behavior, and out-of-scope changes; passing temp tests does not override scope or instruction blockers.

For simplicity/cleanup goals, include locality criteria: avoid unnecessary helper extraction, prefer inline one-use logic when clearer, remove obsolete patches/dead compatibility shims when explicitly requested or proven unnecessary, and run focused checks.

For user-run command or SQL goals, require commands/queries to fit the user's execution surface: local shell, `psql`, Retool SQL runner, notebook, cloud console, or clipboard. If the user needs one pasteable Retool statement, do not give shell scripts or multi-step local `psql -f` workflows. Inspect available app models/source schema before resorting to broad database schema-discovery queries. Commands must be executable from the stated cwd and include needed safe environment setup. If terminal/TUI selection adds padding or breaks backslash continuations, prefer semantic clipboard/copy tooling that extracts raw code or individual shell commands, defaults to recent relevant assistant output, combines `cd dir` plus following command into `(cd dir && command ...)`, and states idle/streaming limitations. If the user asks to run a command themselves or the command is long, copy the exact command with `wl-copy` when available; never claim it was copied without doing it.

For public-facing copy, teammate-facing plans, docs, screenshots, PR descriptions, or examples, preserve exact output shape, bullet count, verbosity, and no-tool constraints when given. Preserve the user's casual language, section structure, and flow where correct; do not replace it with bureaucratic/business prose. Avoid tables when the user asks for bullets/no tables, and prefer short sections with a few nested bullets when requested. For PR descriptions or teammate-facing summaries of technical stacks, separate the high-level core flow from details/hardening/testing instead of flattening everything into one undifferentiated bullet list; update every related PR/doc in the stack when the same structure applies. Present the current plan/decision in the user's requested shape; avoid private migration history, adversarial rationale, or internal debate unless requested. If the user designates a doc/spec as the reference or source of truth, the goal should update that document when decisions or implementation behavior change. If the deliverable is a non-scratch user-facing file, name its exact location; `.scratch` is not a substitute unless requested. Add privacy/detail constraints: no private usernames, absolute local paths, provider names, repo history, secrets, or internal-only details unless the user explicitly wants them public.

For public repo release goals, include tracked-file and committed-content hygiene: auth/session/cache/crash/onboarding/runtime files, `.gitignore`, and current commit diffs. Include attribution/license review for copied or adapted configs, docs, extensions, and skills. Public docs should explain the current reusable config and design, not private migration history, session transcripts, personal comparisons, or adversarial rationale. Distinguish intentional personal preferences/assumptions from non-portable hardcoded paths: document retained preferences, change tracked user-specific absolute paths when feasible, leave ignored runtime state alone, and verify sanitization with direct searches.

For public demo or video goals, prefer a staged real coding workflow over a one-shot docs edit: user request, focused `ask_user`, short plan, user advice/approval, tree-sitter/LSP inspection, small real edit, visible diff/status, and concise final status. Use interesting tools deliberately, but avoid noisy repeated probes or autonomous subagent runs unless the demo explicitly needs them; listing configured agents can show delegation support without running a 40-tool child. Keep prompts and output video-friendly and free of private details.

For live/provider/API validation goals, state external side effects, cost/credential assumptions, bounded smoke scope, and secret-handling constraints. Do not read `.env` or secret files; use safe environment-presence checks and user-provided credentials only. Preserve identifiers needed for follow-up actions, such as run ids created by `--mode new` before pausing/cancelling them. When live tests are long-running, require a tmux/background monitor with logs/status artifacts and check-ins rather than a silent blocking command; if a run appears stuck, capture stuck point/status/stack, run narrow suspected checks, then restart the broader check when justified. Verify the running service/container code version matches the working tree or commit under test before trusting live results. For live database checks, discover schema before querying columns. For startup/performance goals, compare relevant modes, identify what each mode loses, measure before/after, and consider moving noncritical work to post-start background tasks.

For infra, security, API gateway, supply-chain incident, or access-change goals, answer can/should/how separately before mutation. Inspect current scripts, docs, lockfiles/package metadata, CI workflows/logs, cloud/security-group state, screenshots/error text, cached IaC context files, and authoritative provider/advisory docs. Treat successful synth/build as insufficient when warnings identify deploy-time risks; surface warnings with file:line evidence and fix required invariants such as known-length imported lists for CDK VPC/subnet attributes. Verify comments, Dockerfile descriptions, and runbook claims match the actual command/install behavior after infra changes. Treat client-supplied config as untrusted: allowlist safe user-facing inference parameters and reject routing/internal fields such as custom endpoints, API keys, client registry options, or transport settings unless explicitly designed and secured. Preserve or verify replacement and break-glass access paths before removing public exposure; defer irreversible cleanup until access is proven. Treat cloud/network/security mutations as approval-blocked: state exact targets and expected effect, wait for explicit approval, then verify primary access, backup access, and cleanup state. For package compromise incidents, distinguish repo checkout/CI installs that use this repo's lockfile from package consumers that resolve from published metadata; fix both install commands and package constraints when needed. Do not bypass package registry quarantine. Scope log scans to the actual compromise window once known, but say when org-wide or local-developer exposure has not been fully checked. Investigate all install surfaces with secrets, including CI, publish jobs, deploy workflows, Docker builds, local developer machines, sandbox/agent install commands, and downstream repos consuming the package. Secret rotation guidance should separate direct CI/GitHub secrets from secrets only reachable through cloud credentials; use CloudTrail/object-level access where possible and state IAM last-access lag/granularity caveats before deciding a secret did not need rotation. For signing, HMAC, encryption, auth, or integrity features, test falsy/empty credential cases and ensure docs/names state the exact protection boundary; do not imply whole-object integrity when only a field/blob is protected. Security docs must match the actual intended policy and tested behavior; if code/tests and docs disagree on pass-through, rejection, unsigned behavior, or trust boundaries, decide/fix the policy before claiming documentation is updated. Readiness/startup checks should validate all prerequisites needed for real non-health requests, including auth/security config, not just backend/provider availability. For access-control debugging, distinguish install state, tag/owner approval, ACL policy, host user existence, control-plane records/names, network reachability, and actual login success. For host privilege escalation, analyze whether SSH/ACL policy lets other users assume that Unix account before granting elevation; prefer tightening identity mapping first or asking explicitly. For access docs based on user-supplied messages, follow the requested operational shape and tone; do not replace a non-safety-affecting requested instruction with personal best practice.

For operational or integration-sensitive goals, match verification to the real user flow that failed; static checks and unit tests alone do not prove that live workers, queues, containers, or CLIs actually behave correctly. For thorough testing, define a bounded representative matrix of user flows, such as CLI path vs direct API path, pause/resume or retry variants, cleanup state, and regression paths, while avoiding unnecessary provider spend. Before trusting container/dev-server results, verify the runtime contains the changed code. Server/resource lifecycle work should include close/reset behavior for clients, pools, Redis/database handles, and reload/test lifecycles. API goals should map malformed client input to stable 4xx errors instead of leaking internal 5xx paths. For complex concurrency changes, require a concise protocol explanation of the new behavior. Include end-of-work hygiene before `GOAL_DONE`: restore or account for temporary fixtures/data, check scoped dirty state in every touched repo, check relevant background processes/runs, state final dev-stack/service state, close or update local todos/progress/handoffs when available, update requested PR/docs/status text without overwriting unrelated content, and separate proved behavior from operational remediation for old state and residual risks.

For cancellation, timeout, queue, retry, or long-running provider goals, include realistic failure-mode criteria: slow provider calls, slow Redis/database fallback, cancellation cleanup/drain behavior, timeout bounds, and no stuck/hanging shutdown paths. For queue protocols, include key lifecycle, wake semantics, lost-wakeup checks, resume/cancel interactions, Redis key inspection with expected prefixes, cleanup state, and practically relevant race tests. Model resources explicitly: what blocks the Redis server, event loop, pooled connection, worker, run, and per-item fanout; compare alternatives by observed failure mode, wake latency, Redis load, connection use, and worker occupancy. For edge-case verification, enumerate the matrix of covered cases and require blockers-only findings with file:line refs and missing tests. Require practical-risk triage: fix realistic user-impacting failure modes, and explicitly name/defer low-value theoretical races instead of overengineering them.

### 6. Use expanded continuity form only when warranted

For schema or data-contract docs, include source/derivation annotations when relevant: which fields are copied from source artifacts, which are derived, which are optional/future, and which raw details are retained for downstream recalculation. Prefer a clear order such as current/top-level facts, then derived fields, then raw details.

Use the expanded form for explicit resume/marathon/high-risk/cross-session requests:

```text
/goal <one measurable objective>.

Context:
- Current task: <fresh current-session task>
- Known current state: <confirmed facts with file/session/artifact refs>
- Historical continuity: <prior session/compaction/memory facts, explicitly marked historical>
- Stale branches to ignore: <superseded work, if any>

Scope:
- In scope: <bounded areas>
- Out of scope: <non-goals>

Constraints:
- <preserve invariants>
- <do not change or do without approval>
- <follow AGENTS.md/project workflow/tool rules>
- Default to the main agent; do not start team/subagent/reviewer/reducer workflows unless this goal explicitly asks for them.
- For nontrivial cross-file work, use a pre-edit contract card and owner map, then final self-review against them.

Done when:
1. <criterion with required proof>
2. <criterion with required proof>
3. <criterion with required proof>

Verification:
- <commands, artifact checks, review checks, screenshots, logs, file:line refs, or other proof>
- Match verification scope to requirement scope; narrow checks cannot prove broad claims.
- Include final self-review against the contract card, owner map, tests/docs evidence, scope hygiene, and forbidden artifacts.
- GOAL_DONE only when all criteria are proved or explicitly waived by the user.

Iteration policy:
- Work in smallest evidence-producing steps.
- After a failed check, inspect root cause before retrying.
- Do not redefine success around partial progress or an easier subset.
- Re-read current goal/continuity notes after compaction or long interruption.

Blocked only if:
- A verified automatic command/tool/runtime guardrail blocks every viable safe path.
- A required tool, credential, auth, access, or service is missing, and no safe non-asking workaround exists.
- Do not use GOAL_BLOCKED for user approval/permission, sudo, mutating git, external mutation, private reads, HITL, clarification, or product/workflow decisions; encode those as constraints, non-goals, or unavailable paths and keep working within safe scope.
- Emit GOAL_BLOCKED with the specific blocker and evidence that no safe non-asking next step exists.
```

## Ambiguity handling

Ask exactly one focused question before rendering when missing information materially changes:

- the objective,
- in-scope vs out-of-scope work,
- acceptance criteria,
- safety/approval boundaries,
- verification standard,
- whether to preserve compatibility,
- whether external/private resources may be read.

Do not ask for information tools can verify. Do not ask broad multi-part questionnaires.

Only make assumptions for mechanical, reversible defaults already implied by current instructions. Mark them as assumptions outside the `/goal` block if useful. Do not bake material unapproved assumptions into the command.

If verification is unknown but discovering it is a safe and necessary first step, encode that as the first Done-when item or first action:

```text
Done when:
1. Existing validation commands are identified from repo docs/config and summarized with exact paths.
```

Do not invent commands.

## Progress and review loops

For long or tool-heavy goals, include a progress checkpoint requirement: periodically state current objective, what was inspected or changed, key finding/hypothesis/risk, and next action.

For nontrivial implementation goals, include final review and must-fix loop criteria. `GOAL_DONE` is not valid while accepted must-fix review findings remain unless the user explicitly waives or defers them. Passing checks do not override a fresh accepted review blocker. When the user says "go on" inside an already-authorized safe local loop, continue with the next concrete action instead of asking again.

## Quality bar

Before output, check:

- One objective, not a bundle of unrelated missions.
- Scope is bounded enough to audit.
- The goal preserves explicit user style constraints such as minimal, lean, simple, or thorough/resource-maximal.
- Placement/design decisions are either already implied, explicitly deferred, or handled by a reconnaissance/review criterion.
- Any intentionally deferred edge case, race, or non-goal is named with a reason and final-report requirement.
- Constraints include user/project/tool safety rules that matter.
- Done-when items are observable and evidence-backed.
- Verification evidence would appear in transcript/artifacts so the supervisor/judge can evaluate it.
- Stop/block rules match Pi's accepted `GOAL_BLOCKED` classes.
- Current facts are separated from historical continuity.
- Stale/contradicted context is not treated as active work.
- No unsupported budgets, no-progress stops, or vague terminal rules are presented as enforced.
- No material decision is silently made.

Reject or revise goals with these anti-patterns:

- "make it better", "clean everything up", "do whatever it takes", "use every tool".
- Success without proof path.
- Scope of "whole repo" without an enumerable source or boundary.
- Stop-if rules that are subjective or unsupported by local supervisor behavior.
- Verification postponed until the very end when intermediate checks are possible.
- Permission-sensitive work hidden inside broad wording.
- Tests passing used as sole proof when acceptance criteria remain unmet.
- First-pass correctness treated as enough after the user asks for a better, faster, cleaner, or more robust solution.
- Unnecessary abstraction or helper extraction where a small inline/local change is clearer.
- New alternate path verified while the existing path is left unverified.
- Read-only/no-edit wording paired with output or progress artifacts that write files anyway.
- No-read/no-inspection wording paired with file-reading requirements.
- Command-to-run output that is not copied when clipboard delivery was requested.

## Output

Default output:

1. One fenced code block containing the paste-ready `/goal` command.
2. No long rationale.

When the user asked to review/refine or when assumptions matter, add at most five short bullets after the block:

- evidence used,
- assumptions,
- weak spots,
- why a criterion or blocker is included,
- question that remains before running the goal.

Do not output multiple competing goals unless the user explicitly asks for options.
