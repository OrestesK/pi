---
name: pi-subagents
description: |
  Delegate work to builtin or custom subagents with single-agent, chain,
  parallel, async, forked-context, and native-supervisor-coordinated workflows. Use
  for advisory review, implementation context, exceptional parallel write handoffs, and multi-step tasks where a
  single agent should stay in control while other agents contribute context,
  planning, or execution. Also use when ordinary user language implies a
  workflow such as review this, quality gate, fix-review-fix, argue both
  sides, think through architecture, research and decide, generate options,
  build context, prepare a handoff, clarify first, or cleanup/deslop.
---

# Pi Subagents

This skill is for the main parent orchestrator only. Do not inject or follow it inside spawned child subagents. The parent session owns delegation, orchestration, review fanout, implementation, fixes, integration, and final verification; child subagents should receive concrete role-specific tasks. Ordinary children should not run their own subagent workflows; the explicit exception is a delegated fanout child whose resolved builtin `tools` includes `subagent`, and that child may use `subagent` only for the fanout work the parent assigned.

Use this skill when the parent orchestrator needs to launch a specialized subagent, compose multiple agents into a workflow, or create/edit agents and chains on demand.

## Parent-owned write policy

The parent normally owns implementation and fixes. Use read-only subagents by default for broad reconnaissance, research, planning advice, review, and validation. The parent directly reads the precise files and symbols it edits and every delegated diff.

Use a write-capable child when at least two independent implementation areas can proceed concurrently in the shared checkout and the parent owns one area, or under the narrow quality-worker exception below. Every writer receives an exclusive, non-overlapping internal file/symbol assignment. Every write-child dispatch names the current behavioral-contract revision, exclusive files/symbols, required behavior, non-goals, proof/validation evidence, and prohibited material decisions. The child stops before touching an unassigned file.

**Narrow quality-worker exception:** after the parent validates a simple, behavior-preserving, non-material cleanup/quality fix inside the approved boundary, one worker may own its exact coherent, exclusive assignment—including multiple files—while the parent continues independent non-overlapping work. The parent still inspects, integrates, and verifies the result. This is the only exception to the two-independent-areas/parent-owns-one gate.

A write child contacts the parent only for a real blocker, discovered file overlap, stale contract revision, or an unapproved product/API/compatibility/scope decision. Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active. The parent rejects stale-revision write results, inspects every delegated diff, and verifies the combined change.

Reviewer, diagnostic, test, and tool findings are evidence, not edit authority. The parent may apply a finding when it is validated, mechanically local, non-material, and inside the approved behavior/non-goals. Exact file ownership remains an internal writer-collision control, not the user's approval boundary. New behavior, architecture, public contracts, dependencies, compatibility, security/data decisions, protected actions, or unexpected persistent artifacts require a behavioral amendment.

This policy governs every recipe, workflow, role description, and example below. A single worker is not the normal implementation or fix path.

## Fanout and result classification

Use subagents for every nontrivial task unless delegation is concretely unavailable or prohibited.

- Every initial nontrivial review—including plan review and the first implementation-readiness review—uses at least three fresh parallel read-only reviewers with genuinely distinct evidence targets. Add more only for another distinct useful surface.
- Size non-review advisory/recon/research/planning/validation fanout from independent evidence need. One or two children are allowed only when no useful third role exists and the parent states why.
- Every child has a named angle, evidence target, novelty relative to active/recent work, and bounded stop condition.
- Every reviewer also receives the approved behavior, non-goals, relevant decisions, actual target/effective change, required proof, and available evidence.
- Classify each child at dispatch as `readiness-relevant` or `background`.
- A readiness-relevant child can change correctness, risk, scope, verification, or the dependent decision. Inspect its actual output before the applicable claim; unresolved material work makes the gate `INCONCLUSIVE`.
- Background work is nonblocking and cannot authorize or delay the primary path. It may seek an unusual behavior or better alternative without starting from a known defect, but it must stop when no concrete novel angle remains. Launch another wave only when completed evidence exposes a new useful target.
- Nontrivial readiness requires parent direct inspection, fresh proof after the last relevant edit, the initial review, and the applicable post-fix follow-up below.
- Honor a feasible explicit numeric request when it is literal/required and the target can be split into distinct safe scopes. Use bounded waves and fan-in/reduction when outputs are numerous; if the count would force duplicate or unsafe work, explain the limit and ask for revised slicing.
- The parent validates findings for scope, producer/reachability, impact, proof, and behavior preservation, then synthesizes `PASS`, `FAIL`, or `INCONCLUSIVE`. Children never decide approval, edits, or scope.

### Canonical post-fix follow-up sizing

This is the only executable reviewer-count and post-fix sizing policy. `manager-workflow` owns when plan review, implementation review, and verification occur; this skill owns reviewer fanout, packets, and follow-up selection.

After an initial nontrivial readiness review, classify the complete coherent fix group by its effective behavior, proof meaning, and reachable consumers:

- **Tiny mechanical fix:** no observable behavior, contract, reachability, or proof meaning changes. The parent inspects the final effective diff and runs the narrowest focused check; no child reviewer is required. A changed assertion oracle, fixture/input reachability, contract expectation, security/data behavior, public interface, shared abstraction, or production path is never tiny mechanical.
- **Contained correction:** one localized behavioral, correctness, or proof defect changes, with no public contract, security/data boundary, shared abstraction, cross-owner behavior, or additional reachable consumer affected. Run one fresh independent targeted reviewer or validator. It inspects the final effective diff, checks the validated root cause and changed claim, and confirms that fresh focused proof is sufficient.
- **Broad or high-risk correction:** cross-cutting behavior, architecture/ownership, public contracts, security/data boundaries, concurrency, compatibility, shared abstractions, several reachable consumers, or materially changed proof strategy. Run a new full review with at least three fresh reviewers and distinct evidence targets.

When classification is ambiguous or tiers overlap, use the broader tier. A test rerun by the author is proof, not the independent targeted follow-up. Final claim-bound verification remains required for every tier.

Continue a review/fix loop only when a new validated in-scope primary finding produces a material correction to the approved behavior or required proof. Stop clean, incidental-only, rejected, repeated/stalled, blocked, or approval-gated.

## When to Use

- **Complex work orchestration**: use Fable mode as the default parent-agent loop for complex work. Complex means the task has multiple moving parts, unclear acceptance, cross-cutting code, meaningful user-visible impact, expensive or irreversible validation, broad review surface, or the user asks for orchestration. Lightweight one-off delegation can stay lightweight.
- **Advisory review**: use fresh-context `reviewer` agents for adversarial code review, or fork to `oracle` when inherited decisions and drift matter
- **Implementation**: have `oracle` advise when needed, then the parent implements after an approved direction; use write children only under the parent-owned write policy
- **Recon and planning**: use `scout` or `context-builder`, then `planner`
- **Parallel exploration**: run multiple non-conflicting tasks concurrently
- **Manual skill specialists**: when the parent identifies specific skill perspectives that would materially improve the work, launch a fresh-context fanout sized to those distinct useful perspectives and pass each skill explicitly
- **Long-running work**: launch async/background runs and inspect them later; use `timeoutMs` or `maxRuntimeMs` when a foreground or async run needs a hard max runtime, or `toolBudget: { soft?, hard, block? }` to nudge after a tool-call threshold and then block read/search tools so the child can finalize
- **Subagent control**: watch needs-attention signals and soft-interrupt only when a delegated run is genuinely blocked
- **Agent authoring**: create, update, or override agents and chains for a project

## Async Progress Visibility

For async subagents, prefer event-based progress over timer polling.

Use this protocol for long-running async runs:

- For long-running tmux/log/status runs that are not themselves subagent children and are not already covered by native async completion, start a paired fully async `run-monitor` with a specific monitoring intent: exact target/evidence surfaces, the parent decision it supports, minimum useful terminal facts, terminal/stop authority for target timeout or stuck states, and optional explicit milestones, management-relevant conditions, cadence/lifetime overrides, or runtime output capture. When omitted, the monitor uses short separate internal polls, a five-minute heartbeat, and a one-hour lifetime.
- A `run-monitor` sends one compact initial report, then reports only explicit milestones, clear high-level phase transitions, management-relevant events, heartbeats, requested snapshots, and its final result. Any report resets the heartbeat; internal polling and unreported target progress do not. Every interim report gives a concise delta, evidence, and one recommendation: continue waiting, steer the monitor, or stop it.
- Monitor expiry is a successful observer completion through the existing async completion path and must preserve the target's separate last-known state. If observation should continue, the parent may launch another monitor. When the parent sets `timeoutMs` or `maxRuntimeMs`, it must exceed the monitor lifetime so normal expiry can return first. A monitor stays read-only; mutation of the target is a separate parent-controlled action followed by a new monitor.
- Give each long-running child an explicit progress file path under `.scratch/` whenever phase checkpoints materially improve parent visibility or recovery.
- For children other than `run-monitor`, ask for progress after meaningful phases rather than every few seconds, and ask them to contact the parent only when blocked, scope changes, a must-fix/high-risk finding appears, or a meaningful update changes the plan.
- Persistent interactive parents must not duplicate the monitor's polls. They should continue useful work or Reflection, then yield when no qualifying work remains and let monitor reports or completion notifications resume them.
- Before dependent decisions or final completion, inspect relevant async outputs; do not rely on completion notifications alone.

For short reviewer/scout runs expected under a few minutes, a final saved output is enough. For deeper audits, use both `output` and a progress file, and ask the child to write concise phase checkpoints.

## Tool vs Slash Commands

Agents can use the `subagent(...)` tool directly for execution, management, status, and control.
Humans often use the slash-command layer instead:

- `/run` — launch a single agent
- `/chain` — launch a chain of steps
- `/parallel` — launch top-level parallel tasks
- `/run-chain` — launch a saved `.chain.md` or `.chain.json` workflow
- `/subagent-cost` — show parent plus child token usage and cost for the session
- `/subagents-fleet` — show the read-only active foreground/background fleet view
- `/subagents-doctor` — diagnose setup, discovery, async paths, and supervisor coordination state
- `/subagents-models [agent]` — show the live runtime-loaded builtin model mapping
- `/subagents-profiles`, `/subagents-load-profile`, `/subagents-refresh-provider-models`, `/subagents-generate-profiles`, `/subagents-check-profile` — manage model profiles and provider catalogs
- `/prompt-workflow` and `/chain-prompts` — run prompt templates through native subagent single/chain workflows

Prefer the tool when you are writing agent logic. Prefer the slash commands when
you are guiding a human through an interactive flow.

Packaged prompt shortcuts are also available for repeatable workflows. Treat them as reusable orchestration recipes, not just human slash commands. When the user asks for one of these shapes, or when the workflow clearly fits, apply the same pattern directly with `subagent(...)` and other tools:
- `/parallel-review` — fresh-context reviewers with distinct review angles, then synthesis
- `/quality-gate` — review gate over a plan, diff, answer, PR, issue, or target, ending in a parent `PASS` / `FAIL` / `INCONCLUSIVE` verdict
- `/quick-adversarial-check` — lightweight attack on an assumption, plan, claim, or recommendation
- `/adversarial-debate` — competing positions, attacks, optional repair, and parent synthesis by rubric
- `/review-loop` — parent implementation/fixes, canonical initial review and proportionate post-fix follow-up, and parent verification while evidence-backed in-scope progress continues
- `/parallel-research` — combine `researcher` and `scout` for external evidence plus local code context
- `/research-decision` — external evidence, local context, tradeoff critique, and recommendation
- `/generate-filter` — diverse option generation, dedupe/filter, and top-choice synthesis
- `/parallel-context-build` — parallel `context-builder` passes that produce planning handoff context and meta-prompts
- `/parallel-handoff-plan` — external-reference research plus local `context-builder` passes, followed by a synthesis handoff plan and implementation-ready meta-prompt
- `/gather-context-and-clarify` — scout/research first, then ask the user clarifying questions with `ask_user`
- `/parallel-cleanup` — canonical initial review fanout with distinct cleanup angles for an explicitly requested cleanup review

## Applying Prompt Techniques Without Slash Commands

This section is the canonical owner for subagent natural-language recipe routing. Root and manager workflow docs should point here instead of duplicating the full recipe matrix.

The user does not need to name a slash command. Treat ordinary language as workflow intent when the shape is clear, then run the matching pattern directly with `subagent(...)` or a builtin workflow. Do not wait for the user to say `/quality-gate`, `/adversarial-debate`, or another exact shortcut. If a canonical recipe matches, use it directly; if none matches, design a dynamic runtime chain/swarm before launch.

The prompt templates in `prompts/` encode workflows the parent agent can run on demand. If the user provides a URL, issue, PR, plan, local file, screenshot, or freeform target, treat that target as the primary scope: read or fetch it before launching children, then include it explicitly in every child task. Do not depend on the parent conversation history when the recipe calls for fresh context.

### Natural-language routing and constraints

Adapt to the user's actual phrasing, including typos, shorthand, and repetition. Treat these as workflow intent when the request is nontrivial or asks for multiple independent views:

- “review this”, “check this”, “does this look right?” → enter the read-only `review` skill and use the canonical initial-review fanout for nontrivial review.
- “review and fix this”, “apply the review feedback” → use the parent-owned review/fix loop only when the requested fixes stay inside an existing behavioral approval boundary; otherwise present and review the required proposal before mutation.
- “10 review agents”, “different goals”, “validate what the other agents found” → use a large review matrix with distinct first-pass roles, validators/reducer when needed, and parent synthesis.
- “before finalizing”, “is this good enough?”, “quality gate this” → use the quality-gate pattern ending with parent `PASS`, `FAIL`, or `INCONCLUSIVE`.
- “verify your proposal and do it”, “pressure-test this approach, then start”, “if it survives, implement it” → run the proposal-verification gate before implementation scouting, parent implementation, or file hunting.
- “fix, review, fix, review”, “iterate until clean” → use the parent-owned implementation/fix loop with fresh read-only reviewers; qualifying write children remain subject to the parent-owned write policy.
- “think about the architecture”, “is this the right approach?”, “argue both sides” → use an adversarial debate or quick adversarial check according to scope.
- “research and decide”, “what should we use?”, “look at docs/source and recommend” → use the research-decision pattern with researcher, scout, and tradeoff review when those evidence surfaces are material.
- A nontrivial option search where independent candidate generation and ranking materially improve the answer → use the generate-filter shape; diverse generators feed a reviewer/filter fan-in.
- “learn this codebase”, “build context before planning” → use parallel context build.
- “prepare a handoff”, “study this library/reference and make an implementation brief” → use parallel handoff plan.
- “clean this up”, “remove slop”, “make it less verbose” → use parallel cleanup. The phrase itself authorizes trivial behavior-preserving cleanup edits, including one coherent multi-file fix when simple; ask before material behavior, nontrivial refactoring, ownership/API, unrelated cleanup, or broader scope.

Constraints override recipe enthusiasm:
- Strict no-artifact wording such as `do not write artifacts`, `no files`, or `inline only` means no subagents. Child sessions, debug logs, temp output, and runtime state are filesystem artifacts.
- Repo-scoped no-artifact wording still allows advisory subagents, but set top-level `artifacts: false` and child `output: false` / `progress: false`; do not configure chain output paths.
- Review-only, no-edit, no-live-probe, private MCP, cloud, database, destructive, production-affecting, and behavior/security/scope-decision constraints remain active inside children.
- Do not downgrade an unauthorized edit/worker request into child fanout. Block or ask for approval directly.

### Runtime chain vs swarm routing

Use top-level parallel swarms (`tasks: [...]`) when children are independent and the parent only needs parallel evidence collection: review, quality gate, sectioned audit, or broad parallel recon.

Use runtime `chain` when a later step depends on concrete output from an earlier step or parallel group through `{previous}` or `{chain_dir}`. Prefer a chain with an initial `parallel` group for generate → filter, debate → attack → synthesis, research + local recon → recommendation, context-build → handoff, scout/context-builder → planner, and any “first X, then use that to do Y” request.

Answer small or obvious option, idea, test-case, name, comparison, or “strongest few” requests directly. Use generate-filter only when the request is nontrivial and independent candidate generation plus ranking materially improves the answer. When generator/scout fanout is used for that shape, a reducer, filter, or reviewer must see the concrete outputs before the parent recommends, ranks, or claims completion.

### Review fanout, packets, and reduction

For nontrivial review, use the canonical initial-review fanout and select genuinely distinct primary angles from the approved behavior, actual target/effective change, reachable boundaries, and missing proof. Correctness/regression, verification quality, and simplicity/ownership are common candidates, not a mandatory matrix. Add security/privacy, ops, UX, architecture, data, or other specialists only when the affected path reaches that surface.

Every reviewer packet contains the approved behavior, non-goals, relevant decisions, target/effective change, required proof and available evidence, assigned angle/evidence target, and stop condition. Reviewers never edit or become writers.

Reviewer output separates primary in-scope required findings, incidental material adjacent risks, and incidental optional cleanup/polish. Reviewers actively hunt only the primary assigned scope unless the task explicitly makes cleanup or adjacent analysis primary. Incidental partitions cannot block readiness or extend a fix loop by themselves.

Use validators or a reducer when first-pass findings are numerous, materially disputed, high-stakes, or explicitly requested. The reducer must see the concrete findings, deduplicate by root cause, preserve disagreement and uncertainty, and return evidence for parent synthesis. Review/fix/re-review continues only while validated primary findings yield material progress; no arbitrary round cap decides completion.

### Proposal-verification gate

Use this gate for every nontrivial proposal before implementation approval, and whenever the user asks to pressure-test, review, argue both sides, research/decide, or “do it if it survives.” First present the complete decision-ready draft directly so the user can inspect it while asynchronous review runs. The target is the visible parent proposal, not the future code location. After parent synthesis, present the complete revised plan and every material delta before asking approval.

Correct first actions:
- prefer the quality-gate recipe as explicit asynchronous fresh-context reviewer fanout with parent synthesis for a dependent proposal gate that must be decided before implementation;
- prefer the research-decision recipe as explicit researcher/scout/reviewer fanout when local/external evidence is needed before choosing;
- use quick adversarial check for a small proposal or assumption;
- use adversarial debate for architecture/workflow choices with competing viable paths.

Incorrect first actions:
- scouting where to implement the proposal before it has survived review;
- starting implementation before a proposal verdict;
- treating implementation feasibility as a substitute for proposal correctness.

The parent must synthesize `PASS` / `FAIL` / `INCONCLUSIVE` before proceeding. Launch every top-level gate asynchronously, keep doing genuinely independent work when available, then wait and inspect the actual outputs before the dependent claim or implementation step.

### Parallel review technique

Use this for adversarial review of a plan, issue, implementation, or current state. For nontrivial review, use the canonical initial-review fanout with distinct packets generated from the actual target. Common primary angles are correctness/regressions, proof/validation, and simplicity/ownership; adapt to actual risk rather than forcing that matrix. Reviewers inspect the target directly, cite evidence, use relevant semantic groups, and never edit.

The parent validates and synthesizes the three output partitions before any fix. It automatically applies only validated, mechanically local, non-material fixes inside the approved behavior, then uses the canonical post-fix follow-up tier. New material behavior requires an amendment; another implementation file inside the approved behavior does not.

### Manual skill-specialist technique

Use this when a specific available skill would materially improve the user's task and the parent can name the skill perspective explicitly. Local `list` output does not emit proactive skill suggestion blocks; treat skill-specialist fanout as a parent judgment, not an automatic routing rule.

Default guardrails:
- Scale fanout to the number of distinct useful skill perspectives; do not impose a fixed small default, and do not duplicate a perspective merely because another child is pending.
- Prefer `context: "fresh"` and include only the files, diff, plan, URL, or request details each child needs. Use forked context only when private/session history is essential and appropriate to share.
- Use read-only agents for analysis and review. The parent implements; write children are exceptional and must satisfy the parent-owned write policy.
- Skip skill-specialist fanout for tiny questions, direct commands, highly private requests, or when the user asks not to delegate.
- Make cost and concurrency visible by using an ordinary `subagent(...)` call rather than hidden/background automation.

Example shape for a nontrivial specialist review (`selectedSkillPerspectives` satisfies the canonical initial-review fanout):

```typescript
subagent({
  tasks: selectedSkillPerspectives.map((perspective) => ({
    agent: "reviewer",
    task: `Apply ${perspective.skill} to ${perspective.evidenceTarget}. Approved behavior: <behavior>. Non-goals: <non-goals>. Return the three finding partitions; never edit. Stop when ${perspective.stopCondition}.`,
    skill: perspective.skill,
  })),
  context: "fresh",
  concurrency: selectedSkillPerspectives.length,
  async: true,
})
```

### Review-loop technique

Use this when implementation or current-state review should continue until reviewers stop finding validated in-scope fixes worth doing now. Keep the loop in the parent session: the parent implements/fixes, the canonical initial-review fanout inspects the actual target, and the parent validates/synthesizes findings against the behavioral contract. Apply only mechanically local, non-material fixes inside the approved behavior; request an amendment for new material behavior, compatibility, dependency, architecture, security/data, or protected action. Use write children only under the parent-owned concurrent-write policy.

After each fix group, use the canonical post-fix follow-up tier. Continue only while a new validated in-scope primary finding produces a material correction. Stop when clean, only incidental/non-actionable feedback remains, findings repeat or progress stalls, a blocker appears, or a material decision is approval-gated. Do not use an arbitrary round cap as completion logic, loop for optional polish, or let children decide the outcome.

### Parallel research technique

Use this when the question needs both external evidence and local implications. Combine `researcher` for official docs, specs, ecosystem behavior, recent changes, benchmarks, and primary sources with `scout` for repository files, patterns, constraints, tests, and likely integration points. Give each child a distinct angle: external evidence, local code context, and practical tradeoffs. Ask for source links or file ranges, confidence level, gaps, and decision implications. These children are read-only; the parent implements any accepted direction.

### Parallel context-build technique

Use this before planning or implementation when a stronger handoff is needed. Choose a top-level parallel swarm or a chain with a parallel step according to dependency and synthesis needs; do not force one runtime shape. Give every task a distinct material context slice and, when artifacts are useful, a unique output path under the run/chain directory. Require relevant source/import/caller/test/docs/config tracing, tool-available web research only when needed, and a compact synthesis input. The parent synthesizes important context, recommendation, open material questions, assumptions, and evidence; artifacts support rather than replace direct presentation.

Example shape:

```typescript
subagent({
  chain: [{
    parallel: [
      { agent: "context-builder", task: "Build request/scope context for: ...", output: "context-build/request-and-scope.md" },
      { agent: "context-builder", task: "Build codebase/pattern context for: ...", output: "context-build/codebase-and-patterns.md" },
      { agent: "context-builder", task: "Build validation/risk context for: ...", output: "context-build/validation-and-risks.md" }
    ]
  }],
  context: "fresh",
  async: true,
})
```

### Parallel handoff-plan technique

Use this when the user needs a solution brief or implementation-ready handoff from an external reference plus local code context, such as “study this library behavior, inspect our codebase, then produce an implementation packet.” Run a chain with a first parallel group and a second synthesis `context-builder` step. The first group usually includes `researcher` for external projects/docs/prompt guidance and `context-builder` for local code context; add a second `context-builder` for implementation strategy only when the scope is large enough to benefit. Use distinct output paths under `handoff/`, then have the synthesis `context-builder` read those outputs and write `handoff/final-handoff-plan.md` with the recommended approach, likely files, constraints, non-goals, validation, risks, unresolved questions, and final compact implementation-ready meta-prompt.

Example shape:

```typescript
subagent({
  chain: [
    { parallel: [
      { agent: "researcher", task: "Research the external reference and transferable implementation ideas for: ...", output: "handoff/external-reference.md" },
      { agent: "context-builder", task: "Build local codebase context for: ...", output: "handoff/local-context.md" },
      { agent: "context-builder", task: "Compare evidence and propose implementation strategy for: ...", output: "handoff/implementation-strategy.md" }
    ] },
    { agent: "context-builder", task: "Read {previous} and synthesize the final handoff plan and implementation-ready meta-prompt.", output: "handoff/final-handoff-plan.md" }
  ],
  context: "fresh",
  async: true,
})
```

### Gather-context-and-clarify technique

Use this at the start of nontrivial work. Launch `scout` for local context and `researcher` only when external evidence improves understanding. Ask children for concise findings and unresolved material decisions. Then synthesize what is known. For each remaining material question, briefly explain why it matters, recommend an option when useful, and ask in normal language.

### Parallel cleanup technique

Use this only when cleanup/simplification is explicitly requested as a primary review target; ordinary-language “clean this up” is such a request for trivial behavior-preserving cleanup. Use the canonical initial-review fanout with genuinely distinct relevant cleanup angles; deslop and verbosity are candidates, not a mandatory pair. Give each the full reviewer packet. Reviewers report primary in-scope cleanup findings first and keep incidental adjacent risks or polish separate. The parent validates findings, applies only mechanically local, non-material fixes inside the approved behavior—directly or through the narrow quality-worker exception—then uses the canonical post-fix follow-up tier. Ordinary review does not proactively hunt optional cleanup.

### Staged fix orchestration technique

Use this when a broad diff has known reviewer findings across several items and the user wants the parent to orchestrate read-only planning and validation around its own edits. Use three parent-owned phases:

1. Launch a parallel read-only planning fanout, one planner/reviewer per issue cluster. Each child inspects the real diff and returns exact files, line refs, proposed fixes, and focused validation. They must not edit project/source files.
2. The parent synthesizes the findings and applies only fixes authorized by the current task contract. Use write children only when at least two independent fix areas satisfy the parent-owned write policy and the parent owns one area, or use one worker under the narrow quality-worker exception.
3. After all writes finish, launch a parallel fresh-context, read-only validation fanout against the resulting diff.

Do not place ordinary implementation inside a subagent chain because the parent owns the normal write path. Run planning fanout, parent implementation or qualifying concurrent writes, and validation fanout as separate phases. Prefer `async: true`, `context: "fresh"`, and distinct output paths for read-only planners and validators. Do not add a non-blocking suggestion merely because it is small or safe; implement only validated, mechanically local, non-material fixes inside the approved behavior. Defer or amend new material behavior; do not treat another necessary implementation file as a user approval change.

Dynamic fanout may expand structured target lists for read-only planning or validation. Do not use it to create write children unless the resulting targets are independently writable, have exclusive file lists, and each dispatch satisfies the complete write contract.

Example read-only planning phase:

```typescript
subagent({
  tasks: selectedIssueClusters.map((cluster) => ({
    agent: "reviewer",
    task: `Plan fixes for ${cluster.name}. Inspect ${cluster.evidenceTarget} and return exact files, line refs, proposed fixes, and validation. Do not modify project/source files.`,
    output: false,
  })),
  concurrency: selectedIssueClusters.length,
  context: "fresh",
  async: true
})
```

The parent then synthesizes and edits. After writes finish, launch a separate read-only validator fanout against the resulting diff.

## Builtin Agents

Builtin agents load at the lowest priority. Project agents override user agents, and user/project agents override builtins with the same name. Confirm effective behavior with `subagent list/get`; do not assume a packaged definition is active when a root override exists.

- `scout` — fast read-only codebase recon; returns concise context, with an artifact only when explicitly configured.
- `planner` — read-only decision-ready draft; an optional plan artifact supports but never replaces the visible parent presentation.
- `worker` — exceptional concurrent implementation area; exclusive internal file assignment, material-decision escalation, and parent integration.
- `reviewer` — read-only evidence specialist; never writes; the parent validates and applies eligible fixes.
- `context-builder` — requirements/codebase handoff builder; structured context when an artifact is useful.
- `researcher` — evidence-sized external research with a decision-grade summary; artifact only as configured.
- `delegate` — lightweight generic read-only advisory role; no fixed output.
- `oracle` — decision-consistency advisory review with supervisor coordination.

Avoid tables in generated Markdown agent outputs. Direct UI/chat may use one only when materially clearer.

Builtin agents inherit the current Pi default model unless a run, user setting, project setting, or `subagents.defaultModel` overrides `model`. Set `subagents.defaultModel` when subagents should use a different default model than the parent session. Override builtin defaults before copying full agent files when a small tweak is enough.

For one run, use inline config:

```text
/run reviewer[model=anthropic/claude-sonnet-4] "Review this diff" --bg
```

For persistent tweaks, edit `subagents.agentOverrides` in user or project settings. User overrides apply everywhere. Project overrides apply only in that repo and win over user overrides. Use `/subagents-models` or `subagent({ action: "models" })` to inspect the live mapping after settings and overrides load.

Model ids do not have to be exact. Separator variations (`claude-haiku-4.5` vs `claude-haiku-4-5`), case (`Claude-Sonnet-4`), and optional trailing date stamps (`claude-haiku-4-5-20251001`) all resolve to the same registry model. Exact `provider/id` wins; a qualified `provider/model` never switches providers. To constrain subagents to a budget or compliance profile, set `subagents.modelScope: { enforce: true, allow: ["anthropic/*", "openai/gpt-5-*"] }` in user or project settings. Out-of-scope models you pass explicitly error and abort; models inherited from frontmatter, `subagents.defaultModel`, agent frontmatter, or the parent session only warn.

For model fleets, use the profile commands instead of hand-editing repeated overrides: `/subagents-refresh-provider-models <provider>`, `/subagents-generate-profiles <provider>`, `/subagents-load-profile <name>`, and `/subagents-check-profile <name>`. Profiles live under `~/.pi/agent/profiles/pi-subagents/` and replace only `settings.subagents` when loaded.

## Prompting role subagents

Builtin role agents inherit the current Pi default model unless you override them. When launching them, write the task prompt as a compact contract, not a long procedural script. Define the destination and let the role choose the efficient path.

A strong subagent prompt usually includes:
- **Goal**: the concrete outcome the child should produce.
- **Behavioral contract**: current revision, approved behavior, non-goals, protected boundaries, and material decisions the child cannot make.
- **Context/evidence**: relevant plan paths, effective changes, decisions, proof requirements, and current evidence.
- **Role packet**: distinct angle/evidence target and novelty relative to active/recent work; for a write child only, exact exclusive files/symbols and allowed new files as internal collision controls.
- **Success criteria**: what must be true before the child can finish.
- **Hard constraints**: true invariants only, such as no edits for read-only tasks, exclusive ownership for write children, child must not run subagents unless explicitly assigned as a fanout child, or escalation for an unapproved material decision.
- **Validation**: targeted safe checks to run, or the next-best evidence when validation is impossible.
- **Output**: direct summary shape plus optional artifact path; avoid Markdown tables by default.
- **Stop rules**: when to contact the parent, when evidence is sufficient, and when not to keep searching.

Every reviewer packet also states the approved behavior/non-goals, relevant decisions, actual target/effective change, required proof and available evidence, assigned primary angle, and stop condition. Reviewer output uses the three required partitions; reviewers never edit.

Avoid carrying over old prompt habits that over-specify every step. Use `must`, `always`, and `never` for real invariants; for judgment calls, give decision rules. For example, tell a reviewer to inspect the staged diff directly and report only evidence-backed findings, rather than prescribing every file or command. Tell a researcher the retrieval budget: start with broad targeted searches, fetch only the strongest sources, search again only when a required fact is missing, then stop.

For exceptional write-child handoffs, use the complete contract from **Parent-owned write policy**. Good prompts say exactly what files and symbols may change, required behavior, non-goals, where the evidence lives, how to validate, prohibited decisions, and when to stop and escalate. They should not ask the child to create another subagent plan or continue the parent conversation.

### MCP capability routing

Generic MCP is an optional per-task capability, not a base-agent guarantee. When configured MCP evidence can materially advance a delegable task, prefer an MCP-enabled child over keeping that work in the parent.

- Use `subagent({ action: "list" })` to verify the `mcp` bundle and select an allowed agent.
- Pass both `toolExtensions: { add: ["mcp"] }` and `requiresCapabilities: ["mcp"]` on that child.
- If a base-agent capability check fails, do not conclude that children cannot use MCP. First verify that the same child request includes the configured bundle and capability requirement.
- Do not create, eject, update, or write a persistent agent solely to work around MCP access for a one-off task. Correct the dynamic bundle request. If no eligible bundle route exists, report the exact configuration gap instead of inventing another route.
- In the child task, name the target server, the concrete evidence needed, and the allowed effect boundary. For read-only work, include the direct sentence `Do not edit or modify files.` Require cached server and tool metadata inspection before connection. Connect or authenticate only when necessary for the requested evidence and allowed by the external MCP policy. Call only tools whose effects are understood and authorized. Treat generic executors and operations with unclear effects as mutation-capable until verified. Require the child to report the server, tool, evidence, actual effects, authentication state or gaps, and unverified boundaries.

Do not attach the bundle to unrelated work. Catalog visibility or cached metadata does not prove authentication or current behavior. Local versus remote transport does not show whether an action mutates state. Capability routing never grants mutation permission; `AGENTS.md` owns the external-action rule.

Settings locations:
- User scope: `~/.pi/agent/settings.json`
- Project scope: `.pi/settings.json`

Direct settings example:

```json
{
  "subagents": {
    "agentOverrides": {
      "reviewer": {
        "model": "anthropic/claude-sonnet-4",
        "thinking": "high",
        "fallbackModels": ["openai/gpt-5-mini"]
      }
    }
  }
}
```

Useful override fields: `model`, `fallbackModels`, `thinking`,
`systemPromptMode`, `inheritProjectContext`, `inheritSkills`, `defaultContext`,
`disabled`, `skills`, and `systemPrompt`. Tool capabilities and
`subagentOnlyExtensions` belong in the selected agent Markdown; settings overrides
for those fields are rejected. Create a user or project agent with the same name
when you want different capabilities or a substantially different agent.

If a provider rejects model IDs with thinking suffixes, use
`subagents.disableThinking: true` in user or project settings to clear bundled
builtin thinking defaults globally. A higher-precedence per-agent `thinking`
override can opt one builtin back in.

Tool description modes live in `~/.pi/agent/extensions/subagent/config.json`, not `subagents` settings. Set `toolDescriptionMode` to `compact` to reduce tool-description prompt cost while keeping the execution, async-lifecycle, child-safety, one-writer, management/action, and artifact/status guardrails. Set it to `custom` to read `subagent-tool-description.md` from the project config dir or agent dir; invalid custom files fall back to full mode and the safety guidance is still appended.

## Discovery and Scope Rules

Agent files can live in:
- `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/agents/**/*.md` — configured user scope
- `$HOME/.agents/**/*.md` — additional user scope
- `.pi/agents/**/*.md` — canonical project scope
- legacy `.agents/**/*.md` — project compatibility scope; `.pi/agents/` wins on conflicts
- active Pi packages — package fallback scope

Chains live in:
- `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/chains/**/*.chain.md` and `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/chains/**/*.chain.json` — configured user scope
- `.pi/chains/**/*.chain.md` and `.pi/chains/**/*.chain.json` — project scope

Discovery is recursive. `.chain.md` files do not define agents. Use `.chain.md` for simple saved chains and `.chain.json` for dynamic fanout or inline schema objects. Agents and chains can set optional frontmatter/package metadata; `name: scout` plus `package: code-analysis` registers as runtime name `code-analysis.scout` while serialization keeps `name` and `package` separate.

Precedence is by parsed runtime name:
1. project scope
2. user scope, including `PI_CODING_AGENT_DIR`
3. package agents
4. builtin agents

## Running Subagents

### Single agent

```typescript
subagent({
  agent: "oracle",
  task: "Review my current direction and challenge assumptions.",
  async: true,
})
```

### Forked context

```typescript
subagent({
  agent: "oracle",
  task: "Review my current direction and challenge assumptions.",
  context: "fork",
  async: true,
})
```

`context: "fork"` creates a branched child session from the current persisted
parent session. It does **not** create a fresh minimal review context or filter
history down to only the relevant parts. Use it when you want a separate review
or execution thread that can still reference the parent session history.

### Parallel execution

```typescript
subagent({
  tasks: [
    { agent: "scout", task: "Explore the auth module" },
    { agent: "reviewer", task: "Review the API client" }
  ],
  async: true,
})
```

Top-level parallel tasks can override per-task behavior:

```typescript
subagent({
  tasks: [
    { agent: "scout", task: "Map auth", output: "auth-context.md", progress: true },
    { agent: "researcher", task: "Research OAuth best practices", output: "oauth-research.md" },
    { agent: "reviewer", task: "Review auth tests", model: "anthropic/claude-sonnet-4" }
  ],
  concurrency: 3,
  async: true,
})
```

Avoid duplicate output paths in parallel tasks. Concurrent children should not write to the same file. For large saved outputs, set `outputMode: "file-only"` together with an `output` path. The parent result then contains only a compact reference like `Output saved to: /abs/report.md (48.2 KB, 2847 lines). Read this file if needed.` instead of the full saved content. Do not use `output: false` for this; `output: false` means no file output. When a task is review-only, say “do not modify project/source files” rather than “do not write files” if you also configured `output`; otherwise the child may treat the output artifact as forbidden. Failed runs and save errors still return inline details for debugging.

### Chain execution

```typescript
subagent({
  chain: [
    { agent: "scout", task: "Map the auth flow and summarize key files" },
    { agent: "planner", task: "Create an implementation plan from {previous}" }
  ],
  async: true,
})
// The parent inspects the plan and implements approved changes.
```

Chain steps can use templated variables such as `{task}`, `{previous}`,
`{chain_dir}`, and `{outputs.name}`. Use `as: "name"` on a successful step or
parallel task to make that output available to later steps. Prefer named outputs
when a later step needs one specific result; keep `{previous}` for simple linear
handoffs or full fan-in summaries. Use `phase` and `label` for status readability.
Use `outputSchema` when later steps need reliable structured data; the child must
call `structured_output` with schema-valid JSON, or the step fails.

### Async/background

Every top-level parent launch is asynchronous and notification-driven: set `async: true` for scouts, researchers, reviewers, validators, oracle checks, one-off delegates, chains, parallel groups, and qualifying write children. The only foreground exception is a nested run-to-completion child with an immediate dependency.

Async does not authorize ordinary write delegation. The parent is the normal editor. While qualifying write children run, the parent may edit only its own exclusive file list; otherwise parent-side overlap should be reading, validation preparation, synthesis, command planning, or review of unaffected context. Do not run repository-wide mutating commands until all writers finish.

After every async launch and before every intended yield, follow the required scan below rather than stopping after one convenient task or checking healthy status.

### Required pre-yield reflection scan

Before every intended yield, a persistent interactive parent actively searches for useful work; reflection is not merely permitted after a candidate is already obvious. After continuation or compaction, first recover the active TODO, current approved plan, relevant scratch state, unresolved child state, and latest user correction.

1. Handle unresolved child asks, needs-attention events, actionable failures, and completed outputs not yet inspected.
2. Continue already-identified parent work only when safe alongside active children and unable to delay a required response.
3. Look for concrete unresolved evidence gaps, risks, decisions, simplifications, architecture/ownership issues, prior or compaction context, forgotten constraints, verification needs, or permitted TODO/memory/scratch maintenance.
4. Check whether new evidence can materially correct or unblock a running child; communicate only a real delta, not a routine status request.

Admit reflection work only when all are concrete:

- **Value:** advances the goal or reduces a named risk/uncertainty.
- **Novelty:** does not duplicate active or recently completed work.
- **Evidence target:** names what will be inspected or produced.
- **Stop condition:** returns a bounded finding or decision.
- **Non-interference:** is interruptible and cannot delay the user/dependency or conflict with an active writer.
- **Authority:** stays inside approved behavior and mutation boundaries.

Once a candidate is admitted, immediately execute the smallest bounded tool, subagent, inspection, synthesis, or permitted maintenance action that can produce its evidence. Merely listing future questions, saying reflection is underway, or polling a healthy child is not Reflection. A child status check qualifies only when current state is needed for a concrete decision, blocker, ask, failure, or completion event.

Report Reflection only after an action produced evidence or a completed maintenance result; distinguish completed work from next candidates. Never invent nits, repeat an active audit, launch a child merely because another is pending, or keep working to avoid yielding. Yield only when no candidate qualifies and no child needs a meaningful reply. Completion notifications resume the parent. Inspect all readiness-relevant outputs before dependent decisions or final claims.

Nested run-to-completion children may use a foreground run for an immediate dependency.

```typescript
subagent({
  agent: "delegate",
  task: "Run the full test suite and report results without modifying project/source files.",
  async: true
})
```

File-only output mode also works for async single runs, top-level parallel task items, sequential chain steps, and chain parallel task items. In chains, `{previous}` receives the compact saved-file reference when the prior step used file-only mode.

For review fanout where the parent continues a local audit:

```typescript
const run = subagent({
  agent: "reviewer",
  task: "Review the current diff for correctness issues. Do not edit files.",
  async: true,
  context: "fresh"
})
// Continue local inspection, then later call status with the returned id.
```

Inspect async runs with `subagent({ action: "status", id: "..." })` or `subagent({ action: "status" })` for active runs. Use `subagent({ action: "status", view: "fleet" })` when supervising several active foreground/background runs and `subagent({ action: "status", id: "...", view: "transcript", index: 0 })` when you need the latest child output without digging through artifacts. If a delegated fanout child launches nested runs, the parent status view shows them as a tree and you can target a nested run directly with its nested id.

Use `resume` for follow-up work after a delegated run:

```typescript
subagent({ action: "resume", id: "run-id", message: "Follow up on this point." })
subagent({ action: "resume", id: "run-id", index: 1, message: "Continue reviewer 2." })
subagent({ action: "resume", id: "nested-run-id", message: "Continue this nested reviewer." })
```

Resume behavior:
- If an async child is still running and reachable, `resume` sends the follow-up to that live child through the native control channel.
- If an async child has completed, `resume` revives it by starting a new async child from the persisted child session file.
- Multi-child async runs require `index` unless only one running child is selectable.
- Completed foreground single, parallel, and chain runs can also be revived by `index` while their run metadata remains in extension state.
- Nested runs can be resumed by nested id when a live route or persisted nested session metadata is available.
- Revive starts a new child process from the old session context; it does not restart the same OS process.
- If the chosen child has no persisted `.jsonl` session file, resume fails and reports that directly.

Use diagnostics when setup or child startup looks wrong:

```typescript
subagent({ action: "doctor" })
```

### Scheduled subagent runs

Scheduled runs defer a subagent launch until a future time. They are opt-in and require `{ "scheduledRuns": { "enabled": true } }` in `~/.pi/agent/extensions/subagent/config.json`. Only schedule explicit delayed runs the user asked for; do not schedule runs speculatively.

```typescript
// Launch a reviewer in 30 minutes
subagent({ action: "schedule", agent: "reviewer", task: "Review the diff for correctness issues.", schedule: "+30m", scheduleName: "evening review" })

// Schedule a parallel fanout
subagent({ action: "schedule", tasks: [{ agent: "scout", task: "Map the auth module" }, { agent: "scout", task: "Map the billing module" }], schedule: "+1h" })

// Inspect, list, and cancel
subagent({ action: "schedule-list" })
subagent({ action: "schedule-status", id: "ab12" })
subagent({ action: "schedule-cancel", id: "ab12" })
```

`schedule` accepts the same execution fields as a normal async run (`agent`/`tasks`/`chain`, `cwd`, `model`, `output`, `reads`, `progress`, `acceptance`, `timeoutMs`) plus `schedule` (a relative delay like `+10m`/`+2h`/`+1d` or a future ISO timestamp with a timezone such as `2030-01-01T09:00:00Z`) and an optional `scheduleName`. Scheduled runs always launch async with fresh context; `context: "fork"`, `async: false`, and `clarify: true` are rejected. Once the timer fires, the run becomes a normal tracked async run: it appears in the async widget, is inspectable with `subagent({ action: "status" })`, delivers the normal completion notification.

Schedules are persisted per session and restored after a Pi restart. A job whose scheduled time passed by more than `scheduledRuns.maxLatenessMs` (default 5 minutes) while Pi was unavailable is marked `missed` instead of firing late. `scheduledRuns.maxPending` (default 20) caps pending or running scheduled jobs per session.

Humans can use `/subagents-doctor` for the same read-only report. It checks runtime paths, discovery counts, async support, current session context, and supervisor coordination state.

### Subagent control

Subagent control is the runtime visibility and intervention layer for delegated runs. It is separate from lifecycle status. Lifecycle status says whether a child is `queued`, `running`, `paused`, `complete`, or `failed`. Activity reporting is factual: it tracks the last observed activity time and the current tool when known. It does not pretend to know that a child is truly stuck.

Default behavior is intentionally conservative. When no activity has been observed past the configured threshold, the run emits a `needs_attention` control event. Foreground runs can push this as a `subagent:control-event` event, and async runs persist it to `events.jsonl` so the parent tracker can surface it without constant manual polling. Notification-worthy control events are also inserted into the visible transcript so both the user and the parent agent can see them, with a proactive hint plus concrete `nudge`, `status`, and `interrupt` options. Visible notifications fire once per child run and attention state.

Use soft interrupt when a child is clearly blocked or drifting and the parent needs to regain control:

```typescript
subagent({ action: "interrupt" })
```

Pass `id` when targeting a specific controllable run, including a nested run shown in the parent status tree:

```typescript
subagent({ action: "interrupt", id: "abc123" })
subagent({ action: "interrupt", id: "nested-run-id" })
```

A soft interrupt cancels the current child turn and leaves the run paused. It does not mean the delegated task succeeded or failed. Bare `interrupt` does not target hidden nested descendants; use the explicit nested id. After an interrupt, decide the next explicit action: resume with clearer instructions, replace the task, ask the user, or stop the workflow.

Per-run control thresholds can be overridden when a task legitimately runs without observable output for longer than usual:

```typescript
subagent({
  agent: "delegate",
  task: "Run the slow migration test suite and report results without modifying project/source files.",
  control: {
    needsAttentionAfterMs: 300000,
    notifyOn: ["needs_attention"]
  },
  async: true,
})
```

Needs-attention notifications surface through status/events with concrete next actions. When a child needs input, prefer the native supervisor path described below; do not invent cross-session targets or ask a child to self-report through unrelated channels.

## Clarify TUI

The runtime supports a clarification TUI for single, parallel, or chain runs when `forceTopLevelAsync` is disabled. In that configuration, set `clarify: true` to preview or edit parameters for the next foreground launch; use management actions, settings, or Markdown files for persistent changes.

When `forceTopLevelAsync` is enabled, every depth-0 request is forced to `async: true, clarify: false`. The clarify UI is unavailable to top-level parents and is not a foreground exception. Nested calls retain their own settings; a nested run-to-completion child may use `clarify: true` only when foreground clarification is the immediate dependency.


## Worktree Isolation

`worktree: true` remains available when the user explicitly requests isolated workspaces. It creates one git worktree per parallel task and requires a clean git state. Worktree availability does not make a single worker the normal implementation path and does not relax the parent-owned write policy. Concurrent implementation uses exclusive, non-overlapping file lists in the shared checkout with the parent owning one area; the only single-worker path is the narrow quality-worker exception.

## The Oracle Workflow

The intended oracle loop is:
1. the main agent forks to `oracle`
2. `oracle` reviews direction, drift, assumptions, and risks
3. `oracle` can coordinate back through `contact_supervisor` when native supervisor coordination is available
4. the main agent decides what direction to approve
5. only then does the parent implement; qualifying write children remain subject to the parent-owned write policy

```typescript
// Advisory review in a branched thread. Oracle defaults to forked context.
subagent({
  agent: "oracle",
  task: "Review my current direction, challenge assumptions, and propose the best next move.",
  async: true,
})
```

`oracle` is not a fresh-context reviewer in the Cognition article sense. It is
a forked advisory thread that inherits the parent session history and uses that
history as a baseline contract.

Use `oracle` as a smart-friend escalation when the parent needs help with trajectory rather than diff inspection: architectural boundaries, model capability routing, merge conflicts, reviewer disagreement, context drift after long work, an implementation approach about to invent a pattern, or fixes that require product/scope tradeoffs. Ask broad questions when the right concern is unclear, and let `oracle` point out missing context or files the parent should inspect before asking again. Keep `oracle` advisory; write children must satisfy the parent-owned write policy.

## Native Supervisor Coordination

`pi-subagents` includes native supervisor coordination. Child agents can use `contact_supervisor` to ask the exact parent session that spawned them; messages are scoped by parent session id and should not appear in other Pi sessions.

A parent agent never calls `intercom`. Use `subagent(...)` for delegation and `subagent_supervisor(...)` for parent-child communication. Do not invent cross-session targets or use cross-session coordination as a substitute for the native supervisor path.

Use `contact_supervisor` with `reason: "need_decision"` when:
- a subagent is blocked on a decision
- a child needs clarification instead of guessing
- an approval, product, API, or scope choice is required before continuing safely

Use `contact_supervisor` with `reason: "interview_request"` when the child needs structured supervisor input rather than a freeform answer. The request waits for a parent reply, so the child should stay alive and continue only after the reply arrives.

Do not use `contact_supervisor` just to resolve review-only/no-project-edit versus progress-writing or output-artifact instructions. The child must not modify project/source files, but returning findings through its normal response or configured output artifact is allowed unless the parent explicitly set `output: false`.

Use `contact_supervisor` with `reason: "progress_update"` when:
- a child is explicitly asked for progress
- a meaningful discovery changes the plan
- a long-running child needs to report a blocked/progress checkpoint without waiting for normal tool return flow
- a `run-monitor` reaches one of its contracted initial, milestone, phase-change, management-event, heartbeat, or requested-snapshot report gates

Message conventions:
- `reason: "need_decision"` and `reason: "interview_request"` wait for the parent reply and return it to the child.
- `reason: "progress_update"` is non-blocking and should stay concise.
- Child-side routine completion handoffs are not expected. Native supervisor messages are for decisions, structured input, and meaningful progress updates while a child is still running.

A child can ask:

```typescript
contact_supervisor({
  reason: "need_decision",
  message: "Should I optimize for readability or performance here?"
})
```

The parent replies with the native supervisor tool:

```typescript
subagent_supervisor({ action: "reply", message: "Optimize for readability." })
```

Or inspects unresolved asks first:

```typescript
subagent_supervisor({ action: "pending" })
```

If supervisor messages do not show up, run `subagent({ action: "doctor" })` or `/subagents-doctor`.

## Management Mode

The `subagent(...)` tool also supports management actions.

### List available agents and chains

```typescript
subagent({ action: "list" })
```

### Create an agent

```typescript
subagent({
  action: "create",
  config: {
    name: "my-agent",
    package: "code-analysis",
    description: "Project-specific implementation helper",
    systemPrompt: "Your system prompt here.",
    systemPromptMode: "replace",
    model: "openai-codex/gpt-5.4",
    tools: "read,grep,find,ls,bash"
  }
})
```

### Update an agent

```typescript
subagent({
  action: "update",
  agent: "code-analysis.my-agent",
  config: {
    thinking: "high"
  }
})
```

### Delete an agent

```typescript
subagent({ action: "delete", agent: "code-analysis.my-agent" })
```

### Eject, disable, enable, and reset

```typescript
// Copy a bundled builtin/package agent to user scope as an editable custom file.
subagent({ action: "eject", agent: "reviewer" })
subagent({ action: "eject", agent: "reviewer", agentScope: "project" })

// Hide an agent from runtime discovery without deleting it (reversible).
subagent({ action: "disable", agent: "reviewer" })
subagent({ action: "enable", agent: "reviewer", agentScope: "project" })

// Delete the scope's custom agent file and/or settings override, restoring the bundled default.
subagent({ action: "reset", agent: "reviewer" })
```

`eject` copies a builtin or package agent verbatim into the user (default) or project agent dir so it can be customized without hunting package files; the copy shadows the original by runtime name. `disable` writes a reversible `agentOverrides.<name>.disabled: true` entry to the user or project settings file. `enable` removes that `disabled` field while keeping any other override fields. `reset` removes the scope's custom file and settings override to restore the bundled default, and refuses if no bundled default exists (use `delete` for purely custom agents). All four take optional `agentScope: "user" | "project"`; project overrides win over user ones, so target the project scope to undo a project-scope disable.

Use management actions when the system needs to create or edit subagents on
demand without dropping into raw file editing.

Management actions create or update user/project agent files. `config.name` is the local frontmatter name; optional `config.package` registers and looks up the runtime name as `{package}.{name}`. Use the dotted runtime name for `get`, `update`, `delete`, slash commands, and chain steps. For small builtin changes such as a model swap, prefer `subagents.agentOverrides` in settings.

## Creating and Editing Agents by File

A minimal agent file looks like this:

```markdown
---
name: my-agent
package: code-analysis
description: What this agent does
model: openai-codex/gpt-5.4
thinking: high
tools: read, grep, find, ls, bash
systemPromptMode: replace
inheritProjectContext: true
inheritSkills: false
---

Your system prompt here.
```

That is only a starting point. Omit `package` for the traditional unqualified runtime name. Common optional fields include:
- `defaultProgress`
- `defaultReads`
- `output`
- `fallbackModels`
- `subagentOnlyExtensions`
- `memory`
- `maxSubagentDepth`

Use `subagentOnlyExtensions` when a custom tool should exist only inside child sessions for that agent. Use `memory: { scope: "project" | "user", path: "<name>" }` for opt-in role-specific durable memory under the dedicated `agent-memory/` namespace; it is separate from parent/session project memory.

For many customizations, builtin overrides in settings are lower-friction than
copying a full builtin file.

## Prompt Template Integration

The package includes prompt shortcuts for common workflows: `/parallel-review`,
`/review-loop`, `/parallel-research`, `/parallel-context-build`,
`/parallel-handoff-plan`, `/gather-context-and-clarify`, and
`/parallel-cleanup`. Use them when the user wants repeatable review,
review/fix loops, research, context handoff, implementation handoff,
clarification, or cleanup-review patterns. `/parallel-review autofix` and
`/parallel-cleanup autofix` synthesize reviewer feedback; the parent then applies
only fixes worth doing now that the current approved contract already authorizes. Parent agents can also apply the same recipes directly
with `subagent(...)` when the user describes the workflow in natural language
instead of invoking a slash command.

Additional user prompt templates can delegate into `pi-subagents` through the native `/prompt-workflow` and `/chain-prompts` commands. This is useful when a slash command should always run through a particular agent or with forked context. Prompt frontmatter can set `subagent`, `model`, `skill`, `cwd`, `worktree`, `fresh`, `fork`, or `inheritContext` for the native adapter.

## Extension RPC

Other Pi extensions can call `pi-subagents` through the in-process event bus. The stable v1 channels are `subagents:rpc:v1:ready`, `subagents:rpc:v1:request`, and per-request replies at `subagents:rpc:v1:reply:<requestId>`. Envelopes use `{ version: 1, requestId, method, params }`, and replies use `{ version: 1, requestId, success, data | error }`.

Methods: `ping`, `status`, `spawn`, `interrupt`, and `stop`. `spawn` is async-only and rejects management actions, `async: false`, or `clarify: true`; it reuses the normal executor, so discovery, validation, session attribution, spawn limits, child-safety depth, artifacts, and async status are shared with the `subagent` tool. `status` and `interrupt` map to the normal control actions. `stop` targets running async runs through the existing timeout control channel. `pi.events` is process-local, so separate Pi processes and child subagents need lifecycle artifact files or native supervisor coordination instead.

## Important Constraints

- **Forking requires a persisted parent session.** If the current session does not
  have a persisted session file, forked runs fail. Packaged `planner`, `worker`,
  and `oracle` default to forked context, so use `context: "fresh"` explicitly
  when that is not available or not wanted.
- **Forked runs inherit parent history.** They are branched threads, not fresh
  filtered contexts. Use fresh context for adversarial reviewers unless the user explicitly asks for forked context.
- **Default subagent nesting depth is 2.** Deeper recursive delegation is blocked
  unless configured otherwise.
- **Attention signals are not lifecycle state.** `needs_attention` means no activity has been observed past the configured threshold. `paused` means the child turn was intentionally interrupted or is awaiting direction; it is not the same as `failed`.
- **Supervisor/interview asks are blocking.** A session can only maintain one pending outbound
  ask wait state at a time.
- **Keep conversational authority clear.** Advisory subagents should not silently
  become second decision-makers.

Runtime config can change orchestration behavior. `asyncByDefault` and `forceTopLevelAsync` affect whether launches detach; `globalConcurrencyLimit` and `maxSubagentSpawnsPerSession` bound fanout; `singleRunOutputBaseDir` and `worktreeBaseDir` route outputs and worktrees; `completionBatch` groups async notifications. Per-run `artifacts: false` disables artifact capture for that launch. Async status and result artifacts are versioned with fields such as `lifecycleArtifactVersion`, `workflowGraph`, `steps`, `results`, `totalTokens`, `totalCost`, `turnCount`, `toolCount`, and nested `children`. Prefer these artifacts and `status` views over scraping terminal output.

## Best Practices

### Prefer async orchestration

Launch every top-level parent subagent asynchronously and notification-driven. Use `async: true` for scouts, researchers, reviewers, validators, oracle checks, one-off delegates, chains, parallel groups, and qualifying write children. The parent should keep moving: inspect precise edit targets while scouts cover broad context, implement while read-only advisors run on unaffected evidence, and do a local diff pass while reviewers review. Only a nested run-to-completion child may use foreground execution for an immediate dependency.

### Let notifications resume persistent parents

Do not replace event-driven completion with sleep or status-polling loops. Continue useful work, then yield when no independent work remains.

### Keep the parent as the default writer

A strong pattern is one parent editor plus advisory/research/review/validation subagents around it. Use `oracle` for advice; the parent owns the normal write path. Use write children only for at least two independent concurrent areas under the parent-owned write policy or for one validated simple fix under the narrow quality-worker exception. A child that writes must report what changed, what was left undone, commands run with exit codes, validation evidence, surprises, and any unapproved product/API/compatibility/scope decision.

### Use fork for branched advisory or execution threads

Forked runs are useful when the child should reason in a separate thread while
still inheriting the parent’s accumulated context. They are especially useful for
`oracle`, which audits inherited decisions and drift. For adversarial code review,
prefer fresh-context reviewers that inspect the repo and diff directly unless the
user explicitly requests forked context.

### Prefer narrow tasks

Give subagents specific tasks rather than vague mandates.
`Review auth.ts for null-check gaps` works better than `Review everything`.

### Escalate decisions upward

If a subagent encounters an unapproved product, architecture, or scope choice,
it should use `contact_supervisor` and wait for the reply instead of deciding alone.

### Intervene only on clear control signals

Use subagent control proactively when a delegated run emits `needs_attention`, or when a human asks you to regain control. Do not interrupt just because a child has briefly produced no output. Silence can be normal during long tool calls, test runs, or model reasoning.

### Name sessions meaningfully

Use `/name` so status, artifacts, and supervisor-visible context remain easy to identify.

## Common Workflows

### Recon → Plan → Parent implementation

```typescript
subagent({
  chain: [
    { agent: "scout", task: "Map the auth flow and summarize relevant files" },
    { agent: "planner", task: "Plan the migration from {previous}" }
  ],
  async: true,
})
// The parent inspects the plan and implements approved changes.
```

### Fable mode for complex work

Fable mode is the default orchestration posture for complex work. It is not a separate runtime mode; it is how the parent session uses `subagent`, `ask_user`, completion notifications, acceptance contracts, artifacts, and fresh-context review when the work has real complexity. Use it for complex features, broad refactors, migrations, ambiguous goals, multi-system changes, expensive validation, user-visible behavior changes, or any request to plan/orchestrate end to end. Do not force it onto tiny one-shot delegation.

Run the work through seven phases:

1. **Understand** — use evidence-sized `scout`/`context-builder` fanout, while the parent personally reads load-bearing sources. Gate: the parent can state previous behavior, the observable contract, canonical owner, non-goals, and verification harness.
2. **Decide** — separate material user-owned decisions from routine engineering judgment. For each unresolved material decision, briefly explain why it matters, recommend an option when useful, and ask one clear question. Gate: no material design decision remains silent.
3. **Design** — present the complete draft before launching the canonical initial-review fanout for the plan; keep it inspectable, validate/synthesize findings, then present the complete revised plan and every material delta before approval on the behavioral boundary. Gate: one reviewed parent-synthesized plan, assumptions, alternatives, risks, proof/review strategy, and seams.
4. **Implement** — capture a baseline only when it proves the changed claim, then the parent implements. Use write children only for at least two independent concurrent areas under exclusive ownership with the parent owning one, or use one worker under the narrow quality-worker exception. Gate: applicable focused/static checks are green or explicitly unavailable, and every effective change is intended or fixed.
5. **Review** — run the canonical initial-review fanout outside the implementation path. Validate and disposition every finding partition against the approved behavior, non-goals, and proof contract. Gate: every primary finding is validated, rejected with evidence, or identified as approval-gated.
6. **Iterate** — when a validated primary finding exposes a defect, the parent names the failure class, searches relevant siblings, applies eligible in-behavior fixes, and uses the canonical post-fix follow-up tier. Continue only while each new validated in-scope primary finding produces a material correction; stop clean, incidental-only, rejected, stalled/repeated, blocked, or approval-gated. For LLM judges, trigger on concrete findings rather than scores and preserve reproducible verdict evidence.
7. **Verify and ship** — after the last relevant edit and clean review disposition, run all relevant read-only proof automatically, rerun affected gates, assess every relevant completion category, and have the parent inspect the final change. Put temporary project files under `.scratch/`. Mutating validation, deployment, commit, push, release, destruction, or other external mutation remains separately authorized. Gate: reviewers and final post-edit evidence support `PASS`; otherwise return `FAIL` or `INCONCLUSIVE`.

### Clarify → Plan → Implement → Review (self-orchestrated workflow)

For straightforward non-trivial work, this sequence is the lightweight version of the parent-owned loop. When the task is complex, use Fable mode above. In either case, factor in the packaged prompt workflows without literally invoking slash commands. Use the same patterns through tools and subagents.

Keep builtin agent defaults unless the user explicitly asks for a different model, thinking level, skills, output behavior, context mode, or other override. Do not add overrides just because you are orchestrating; the defaults encode the intended role behavior. In particular, packaged `planner`, `worker`, and `oracle` default to forked context.

When launching a subagent for an approved plan or workflow, generate a proper role-specific prompt. Include the approved plan path or summary, clarified requirements, non-goals, relevant context, role boundaries, files or areas to inspect, acceptance criteria, expected output, and validation expectations. A write-child prompt must also satisfy the complete parent-owned write policy; approval to use subagents does not by itself authorize a write child. Do not pass vague instructions like “implement the plan fully” or “review this” by themselves.

- `/gather-context-and-clarify` maps to: launch `scout` and, when needed, `researcher`; synthesize findings; briefly explain each remaining material choice, recommend when useful, and ask one clear question.
- `/parallel-review` maps to: launch the canonical initial-review fanout with distinct complete packets; validate and synthesize the three finding partitions before any fix.
- `/review-loop` maps to: keep the parent in charge of implementation/fixes → canonical initial review → validated synthesis → proportionate post-fix follow-up while new validated in-scope primary findings produce material corrections; stop clean/incidental-only/rejected/stalled/blocked/approval-gated, not at an arbitrary cap.
- `/parallel-research` maps to: combine evidence-sized local and external roles when current docs, ecosystem behavior, or API details matter.
- `/parallel-context-build` maps to: choose top-level parallel or chain-mode context builders according to dependencies, with distinct slices and optional unique artifacts, then synthesize direct context.
- `/parallel-handoff-plan` maps to: run external `researcher` plus local/strategy `context-builder` passes, then a synthesis `context-builder` that writes an implementation handoff plan and implementation-ready meta-prompt.
- `/parallel-cleanup` maps to: use review-only cleanup passes after implementation, especially for simplicity, verbosity, and redundant tests.

For feature work, use this sequence as scaffolding for parent-agent behavior:

```text
clarify → validation contract → read-only planning/context → parent implementation → parallel async fresh-context reviewers/validators → parent fixes → follow-up review when warranted → parent verification
```

The validation contract defines acceptance before code is written: expected behavior, acceptance checks, commands or user flows to exercise, and evidence the implementation must produce. Keep it lightweight for small tasks, but make it explicit enough that reviewers and validators check the intended outcome rather than the implementation author’s assumptions.

Use the structured `acceptance` field when the run should carry an explicit acceptance contract. If omitted, subagents infer an effective acceptance policy from role, mode, and risk. Use `level: "checked"` for ordinary writer evidence gates, `level: "verified"` when the runtime should run explicit validation commands, and `level: "reviewed"` only when an independent reviewer result is expected. Do not call a run reviewed just because the worker says it is done; reviewed means a reviewer gate returned a result. Child-reported command success is evidence, not runtime verification.

The parent implements the approved behavior and reads the precise sources it edits. Qualifying write children may edit additional independent areas concurrently under exclusive internal ownership. After writes, the canonical initial-review fanout inspects the final target and validators check behavior with the best available evidence. The parent validates findings, applies only mechanically local/non-material fixes inside the approved behavior, uses the canonical post-fix follow-up tier while material progress continues, and inspects the final effective change before completing.

Every nontrivial initial review uses distinct primary angles. Increase review/validation fanout for additional concrete risk surfaces rather than trusting the minimum alone. Security/privacy, performance, docs/API, or user-flow specialists are added only when the affected path reaches those surfaces.

When review has concrete findings across several areas, use staged fix orchestration: parallel read-only planners for issue clusters, parent synthesis/fixes, then the canonical post-fix follow-up tier. Use write children only when at least two accepted clusters are independently writable or one fix qualifies for the narrow quality-worker exception. Implement only validated, mechanically local, non-material fixes inside the approved behavior; new material behavior requires an amendment, not another-file bookkeeping.

For very large work, split implementation into serial milestones. The parent implements and fixes each milestone, with a validation contract, fresh-context review/validation, and parent acceptance before the next milestone. Use write children only for qualifying independent areas inside a milestone or the narrow quality-worker exception.

Keep orchestration authority in the parent session. Child subagents should not launch more subagents, read this skill, or run their own orchestration loops unless the parent intentionally selected a fanout agent whose builtin `tools` includes `subagent`. Spawned subagents do not receive the `pi-subagents` skill, parent-only status/control/slash messages, or prior parent `subagent` tool-call/tool-result artifacts. Ordinary children also do not receive the `subagent` extension tool. Child context filtering strips old hidden orchestration-instruction messages when they appear in inherited history. Every child receives a boundary instruction: ordinary children are told the parent owns orchestration and they must not propose or run subagents; explicit fanout children are told to use `subagent` only for the assigned fanout work, with `maxSubagentDepth` still enforced. Implementation children must call real edit/write tools instead of printing pseudo tool calls. Pass children concrete role-specific work instead.

Example exceptional concurrent write dispatch while the parent edits a separate area:

```typescript
subagent({
  agent: "worker",
  task: "Implement concurrent area B only.\n\nParent-owned concurrent area:\n- Files: src/area-a.ts, test/area-a.test.ts\n\nYour exclusive file list:\n- src/area-b.ts\n- test/area-b.test.ts\n\nAllowed symbols:\n- buildAreaB\n- area B tests\n\nRequired behavior:\n- Implement the approved area B behavior from the attached plan.\n\nNon-goals:\n- Do not modify area A, shared interfaces, dependencies, or configuration.\n\nValidation:\n- Run the focused area B test command from the plan and report its exit code and evidence.\n\nProhibited decisions:\n- Do not decide product, API, compatibility, or scope changes.\n\nStop rules:\n- Stop before touching any unassigned file. Contact the parent only for a real blocker, discovered file overlap, or an unapproved product/API/compatibility/scope decision.\n\nReturn changed files, completed and omitted work, commands with exit codes, validation evidence, surprises, and any unapproved product/API/compatibility/scope decision.",
  acceptance: {
    level: "checked",
    evidence: ["changed-files", "commands-run", "validation", "residual-risks"]
  },
  async: true
})
```

Example nontrivial read-only review pass after implementation:

```typescript
subagent({
  tasks: selectedReviewAngles.map((angle) => ({
    agent: "reviewer",
    task: `Review ${target} for ${angle.name}. Approved behavior: ${behavior}. Non-goals: ${nonGoals}. Relevant decisions: ${decisions}. Proof/evidence: ${evidence}. Inspect ${angle.evidenceTarget}; use the required three finding partitions; never edit. Stop when ${angle.stopCondition}.`,
    output: false,
  })),
  concurrency: selectedReviewAngles.length,
  context: "fresh",
  async: true
})
```

`selectedReviewAngles` satisfies the canonical initial-review fanout. The parent validates and applies only mechanically local/non-material fixes inside the approved behavior. Use fix children only under the exceptional exclusive-write policy or the narrow quality-worker exception.

### Review loop

Do not treat review as the final step for implementation work. Run the canonical initial-review fanout, validate and partition findings against the behavioral/proof contract, then have the parent apply only eligible fixes.

After a parent fix, use the canonical post-fix follow-up tier and parent validation/synthesis while a new validated in-scope primary finding produces a material correction. Stop when clean, only incidental/non-actionable findings remain, findings are rejected or repeat, progress stalls, a blocker appears, or a material decision/protected action is approval-gated. Do not stop merely because of a fixed round count or loop for optional polish. Use write children only for qualifying independent areas or the narrow quality-worker exception.

### Parallel non-conflicting analysis

```typescript
subagent({
  tasks: [
    { agent: "scout", task: "Audit frontend auth flow" },
    { agent: "researcher", task: "Research current retry/backoff best practices" }
  ],
  async: true,
})
```

### Saved chain

```text
/run-chain review-chain -- review this branch --bg
```

Use saved `.chain.md` or `.chain.json` workflows when the user wants a repeatable multi-agent flow without rewriting the chain each time. Prefer `.chain.json` for dynamic fanout or inline `outputSchema` objects; `.chain.md` remains the simple sequential/static authoring format.

## Error Handling

**"Unknown agent"**
```typescript
subagent({ action: "list" })
// Check available agents and chains, then confirm scope/precedence.
```

**Setup, discovery, or supervisor-coordination confusion**
```typescript
subagent({ action: "doctor" })
// Check runtime paths, async support, discovery counts, current session, and supervisor coordination state.
```

**"Max subagent depth exceeded"**
```typescript
// Flatten the workflow or raise maxSubagentDepth in config.
```

**"Session manager did not return a session file"**
```typescript
// Persist the current session before using context: "fork".
```

**Supervisor/interview "Already waiting for a reply"**
```typescript
// Resolve the current outbound ask before starting another one.
```

**Parallel output-path conflict**
```typescript
// Give each parallel task a distinct output path, or disable output for tasks that do not need it.
```

**Worktree launch fails**
```typescript
// Ensure the git working tree is clean and task cwd overrides match the shared cwd.
```

**Child fails before starting**
```typescript
// Inspect `subagent({ action: "status", id: "..." })`, artifact metadata/output logs, and run doctor. Extension loader errors usually appear in child output logs.
```
