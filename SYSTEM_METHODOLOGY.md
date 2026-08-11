# System Methodology

This document explains what I want from this Pi configuration and how its general workflow and ownership model currently work. Agents that explicitly change this configuration must read it before proposing or making changes.

This is not an executable instruction file and it is not a decision history. `AGENTS.md`, skills, agent prompts, settings, extensions, and packages remain the executable owners of behavior.

Read the document in two ways:

- **What I want** states my durable intent for the system
- **How it works** states current behavior verified from the canonical executable owners

My current instruction is the authority for what I want. Current source and settings are the authority for what actually runs. If they disagree, surface the conflict instead of silently changing either meaning.

## What I want

### User authority with useful advice

I am the source of truth for behavior. I want the agent to advise me, challenge weak premises, show evidence, and recommend the best option, but not choose a material preference or trade-off for me.

Ask me only about material choices that remain unresolved. Resolve facts, ownership, current behavior, and routine implementation mechanics with tools. Once I make an informed decision, do not relitigate it unless new evidence changes the decision or a protected boundary appears.

### Complete approval without approval loops

I want trivial, clear, contained work to proceed directly with proportionate verification. I do not want subagents or reviewers added to simple work only because it has several mechanical steps.

For nontrivial or material work, I want one complete, decision-ready proposal before editing. Show the recommendation, assumptions, alternatives, risks, proof, boundaries, and what I am approving in the conversation; do not point me only to a plan file. Review that proposal independently, present the revised whole, and ask once for implementation approval.

After approval, keep working through implementation, review, fixes, and verification. Ask again only when a new material choice, scope change, or protected action appears.

### Accuracy first, speed through focus and parallelism

I want accurate, decision-grade work. Do not weaken investigation, review, or proof only to save time, tool calls, tokens, or assumed cost.

I also want the system to be fast. Investigate the smallest useful surface, run independent work in parallel, and do not make the parent wait when it can do useful non-conflicting work. Wait only when an output is a real dependency for the next decision, action, or readiness claim.

### Simple, clean, canonical changes

I want elegant, simple, clean implementation at the real owner. Prefer the smallest coherent solution, not the smallest line count.

Follow least diff: do not touch unrelated code, comments, behavior, or artifacts. Necessary refactoring is appropriate when it makes the approved change cleaner or simpler. Do not add speculative abstractions, compatibility paths, fallback behavior, validation, or duplicate policy without a demonstrated consumer or boundary.

Keep each behavior at one canonical owner. Other surfaces should route to that owner instead of restating its detailed rules.

### Evidence tied to the real claim

I want evidence that can show the implementation is wrong at the boundary being claimed. Use source, types, runtime paths, current documentation, focused checks, integration or live evidence, and tests according to the actual risk. Do not force tests or live probes when no meaningful behavioral boundary exists.

Treat tools, tests, reviewers, benchmarks, memories, and historical sessions as evidence, not authority. Re-verify important historical claims against current source or fresh evidence.

Do not call work done because an agent is confident or one narrow check passed. Completion claims must use fresh evidence captured after the latest relevant edit and must state any unavailable boundary.

### Independent review that improves the work

I want nontrivial plans and implementations reviewed independently across the complete risk surface. Review should cover the approved contract, reachable correctness and real boundaries, architecture and consumers, simplicity and local fit, and claim-bound proof.

Reviewers gather evidence; they do not vote, authorize scope, or replace my decisions. Validate findings before acting on them. Fix supported in-scope findings and re-review in proportion to the effective risk instead of restarting a full review after every small correction.

### Active, visible, bounded work

I want meaningful progress updates at approval boundaries, material work stages, discoveries, blockers, and completion—not narration of every tool call.

Before yielding, look for concrete useful work such as a missing risk, stronger evidence, a simpler path, or necessary task-state maintenance. Dispatch substantive Reflection work to the fitting read-only specialist. Do not poll healthy children, repeat work, invent nits, or create activity only to avoid yielding.

Keep continuity proportional. Use ignored `.scratch/` artifacts only when deeper temporary research, plans, reviews, logs, or session state are useful. Do not create tracked progress files unless the project requires them.

### Autonomous reads, explicit protected effects

I want genuine read-only work to run without approval, including authenticated or private reads. Treat unclear effects as mutation until verified.

Mutations, destructive actions, disclosure or export, deployment, and other protected effects require the exact authorization defined by the active policy. State the target, action, expected effect, and relevant boundary before asking. Authorization for one effect does not silently authorize another.

### Direct communication

Use plain, natural language. Lead with the answer, explain what changes in practice, and add detail only when it affects understanding or a decision. Be concise, precise, and direct. Do not add praise, filler, bureaucratic language, or unsupported certainty.

## How the general lifecycle works

### 1. Classify and frame the task

`AGENTS.md` owns the global definitions of trivial, nontrivial, material, useful, and protected work.

- Trivial and unambiguous work stays with the parent
- Nontrivial or material implementation, refactor, migration, or service work enters `manager-workflow`
- Standalone nontrivial review enters `review`; unexpected failures enter `systematic-debugging` and then `behavioral-proof`
- A material unresolved preference returns to me as one focused question
- Facts and routine mechanics are investigated instead of delegated back to me

Before mutation, the parent makes the observable outcome, non-goals, owners, proof, approval boundary, and stop conditions explicit.

### 2. Discover the current state and resolve intent

The agent reads the relevant source before editing and uses the workflow that owns the evidence it needs.

- `brainstorming` turns ambiguous product, behavior, UI, API, or architecture intent into a concrete design; it researches first and asks one material decision at a time
- `code-intelligence` owns semantic evidence about code structure, symbols, types, references, call paths, and diagnostics
- `learn-codebase` owns first-session repository orientation
- `context-mode` owns processing for large logs, commands, documents, API results, and datasets
- Current version-matched documentation and the local integration are checked when external behavior matters

These mechanisms return evidence to the active workflow. They do not create competing approval or implementation flows.

### 3. Build and approve the proposal

`manager-workflow` owns the nontrivial stage sequence. It keeps the complete proposal visible in the conversation, sends the draft through independent plan review, integrates supported findings, presents the complete revision, and obtains one implementation approval.

`behavioral-proof` selects the smallest evidence strategy that could disprove the changed claim. A separate technical specification or durable plan is added only when the architecture or continuity need justifies it; it does not create a second approval path.

### 4. Execute without idle coordination

After approval, `delegation` owns role selection, topology, packets, parallelism, tool routing, and waiting behavior. The Pi Subagents runtime executes that routing.

Every nontrivial implementation slice belongs to `clone`. The parent owns task selection, user communication, decisions, write allocation, fan-in, integration, and the final conclusion. Concurrent writers receive disjoint active write sets. A clone may coordinate read-only specialists for its bounded slice, but it may not launch another clone or expand its write set.

Independent work runs in parallel. The parent continues useful non-overlapping work and waits only when a child result is a dependency. Child claims are checked against their actual output, effective change, and verification.

### 5. Maintain continuity and use Reflection

`.scratch/` holds useful ignored temporary artifacts. Session history, compaction summaries, memory, and scratch artifacts are discovery pointers; current source and later user corrections remain authoritative.

Before an intended yield, the root parent performs the Reflection check owned by `AGENTS.md` and routed by `delegation`. A progress report, stage transition, child event, completed check, or asynchronous launch result does not decide that the parent turn should end; apply the same check after it. Do not poll healthy children, repeat work, invent nits, or create activity only to avoid yielding. Reflection does not replace required task work or formal review.

Yield only when no substantive candidate can be dispatched, no required parent work or permitted maintenance remains, and no child needs meaningful interaction.

### 6. Review and fix

`manager-workflow` moves the completed implementation into the review/fix stage. `review` owns independent review method and current coverage of five base angles:

1. Contract, user impact, and approved scope
2. Reachable correctness, producers, and boundaries
3. Architecture, ownership, integration, and consumers
4. Simplicity, maintainability, and local fit
5. Claim-bound proof and validation

Review findings are classified and validated. Only in-scope required findings can block readiness or drive automatic fixes. Follow-up review is proportionate to the effective risk of each correction.

### 7. Verify and report completion

After the last edit and completed review, `verification-before-completion` owns the final evidence gate. It checks only completion categories that can materially affect the claim, binds evidence to the exact current work, and reports `PASS`, `FAIL`, or `INCONCLUSIVE`.

The parent inspects the final effective change, readiness-relevant child output, finding disposition, and fresh proof before making the final claim. Unavailable verification is reported as an unavailable boundary, never converted into confidence.

## How the configuration is organized

### Intent, policy, and environment

- `SYSTEM_METHODOLOGY.md` owns this high-level design intent and current general-flow explanation for config maintainers; it does not execute
- `AGENTS.md` owns always-loaded behavior, global invariants, authorization boundaries, workflow routing, parent authority, Reflection, progress, continuity, and implementation rules
- `APPEND_SYSTEM.md` owns host toolchain and language preferences added to the system prompt
- `README.md` owns the repository map and operational setup overview

### Activation and runtime implementation

- `settings.json` owns model selection, package activation, and resource wiring
- `skills/` owns progressively disclosed workflows and domain guidance
- `.agents/skills/` contains project-scoped maintenance workflows discovered only in this repository
- `agents/` owns role-specific child prompts; an effective root role can replace a packaged role with the same name
- `extensions/` and `packages/` own runtime implementations and packaged fallbacks

A workflow name in this document describes the current general method. Its detailed procedure remains in its skill, agent, setting, extension, or package owner.

### Durable and temporary context

Hermes owns automatic durable-memory maintenance and searchable session history. The main session retrieves relevant durable context on demand and treats it as non-authoritative evidence.

`.scratch/` owns temporary project-local research, plans, reviews, session notes, and run logs. Canonical project knowledge belongs in source or repository documentation rather than memory or task artifacts.

### Authority between agents

The parent owns the task, communication with me, decisions, active write allocation, integration, and final claims.

`clone` owns one approved bounded nontrivial implementation slice. Read-only specialists and reviewers own only the evidence target assigned to them. They return evidence to the parent and cannot expand scope, approve protected effects, or become decision authority.

## Maintaining this document

Read this document before changing the Pi configuration. Then verify every relevant current fact against its canonical executable owner.

Update this document when:

- behavioral reach changes a cross-cutting principle or the normal system lifecycle
- global ownership architecture changes
- a named general-flow mechanism is renamed, replaced, moved, or materially changes its stable contract

Do not update this document for:

- behavior confined to one specialized skill, agent, package, extension, integration, command, or UI component
- routine implementation detail, package pins, model versions, or generated inventories
- ordinary task decisions, debugging findings, session state, or per-change provenance

Behavioral reach, not file count or implementation effort, decides whether an update belongs here.

Keep the document current, concise, and free of historical entries. Use direct user intent for what I want and current canonical source for how the system works. If they conflict materially, ask instead of documenting the conflict as accepted behavior.
