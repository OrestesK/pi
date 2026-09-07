# System Methodology

## Purpose and authority

This document explains what I want from this Pi configuration and the general model used to produce it. Agents that explicitly maintain this configuration must read it before proposing or making changes

This document owns durable design intent. It does not execute, replace current instructions, or preserve decision history

Current user direction is authoritative for desired behavior. Current source, settings, and effective discovery are authoritative for what runs. When they disagree, surface the conflict instead of silently changing either meaning

Use this document as:
- a design charter for cross-cutting behavior
- a compact map to the canonical executable owners
- a maintenance boundary for deciding what belongs here

Use `README.md` for the concrete repository file map. Use session history, Git, and `.scratch/` for evidence and history, not current policy

## Design principles

### User authority with useful advice

I own material decisions about behavior, scope, architecture, proof, compatibility, security, and protected effects

I want the agent to investigate first, challenge weak premises, explain the relevant facts, recommend the best option, give material pros and cons, and then ask one focused question only when a real decision remains

Reuse my prior answers and established decisions instead of asking the same question again. Reopen a settled decision only when new evidence changes it or a protected boundary appears

Do not turn reviewer, diagnostic, test, historical, or tool output into authority. Validate it against the current source and approved outcome. Only a required defect inside the approved contract may drive automatic correction

A concrete supported material addition is a user choice. A small concrete observation encountered incidentally may be reported as a nonblocking extra. Unsupported, speculative, generic, or conflicting suggestions do not become work

### Simple, canonical, fail-fast implementation

I want the smallest coherent solution at the real owner, not the smallest line count and not the most elaborate design

Prefer, in order:
- no code or configuration change when current behavior already satisfies the contract
- the existing canonical owner
- standard platform or installed dependency behavior
- the minimum coherent new code or policy

Default to no new abstraction, compatibility path, fallback, recovery, normalization, sanitization, hardening, or custom error wrapping unless the approved contract requires it. Preserve raw errors and let owned invariant violations fail directly

Do not remove existing approved behavior under the label of simplification, cleanup, or defensive-code removal. Ask before creating or broadening an abstraction, moving responsibility, or choosing between materially different owners. Perform cleanup automatically only when it is required by the approved contract. Present any optional cleanup as a user choice before implementation

### Evidence and independent review

I want evidence that could show the implementation is wrong at the boundary being claimed. Use current source, types, real producers and consumers, runtime paths, version-matched documentation, focused checks, and behavioral tests according to the claim and risk

A writer may add and run the exact focused local test that directly proves approved changed behavior when it is safe to repeat and has no external effect. Broader, unrelated, credentialed, external, expensive, or effectful validation needs the applicable approval

Nontrivial plans and changes receive independent coverage of six distinct angles:
- approved contract, user impact, and scope
- reachable correctness
- fail-fast and defensive code
- architecture, ownership, integration, and consumers
- simplicity, maintainability, and local fit
- claim-bound tests and proof

Each reviewer owns one supplied angle and returns evidence, not a final system decision. The parent validates and synthesizes the findings. A contained correction invalidates only affected coverage. A broad correction receives proportionate fresh coverage

Comparative agent, prompt, workflow, model, or skill evaluation is opt-in. It produces evidence and a recommendation, never automatic promotion or configuration mutation. When I ask to compare wording, behavior, or aggressiveness, show me concrete alternatives rather than substituting an autonomous model-versus-model experiment

### Focused parallel work

I want all useful independent work to move in parallel. Do not reduce useful work merely to reduce concurrency, and do not make the parent wait when non-conflicting work can continue

Parallelism must remain bounded by real ownership and dependencies. Main owns coordination, integration, user decisions, and final claims. Worker executes fully specified dependency-ready leaves. Clone owns one bounded coherent task that still needs implementation judgment. Read-only specialists and reviewers answer their assigned question without becoming writers or decision authorities

Child completion is evidence, not acceptance. The parent inspects the effective result and proof in proportion to the child role and the risk

### Explicit protected effects

Genuine read-only investigation may proceed without approval. Mutation with external, destructive, deployment, disclosure, credential, Git, or otherwise protected effects requires the exact authorization owned by `AGENTS.md`

Treat unclear effects as mutation until verified. Authorization for one effect does not silently authorize another

### Direct communication and configuration prose

Use direct, concise, human-to-human language. Lead with the shortest correct working model, then add detail only when it changes understanding, a decision, or safe execution

First-party configuration prose should be simple, structured, and written to the agent. The exact maintenance conventions are owned by `.agents/skills/runtime-maintenance/SKILL.md`

Progress reports name the objective, material evidence or change, current risk or decision, and next action. They do not narrate every tool call

## General lifecycle

### 1. Resolve the task and intent

The parent establishes the observable outcome, non-goals, current behavior, real owner, proof need, approval boundary, and stop conditions. It uses tools for facts and returns only unresolved material choices to me

Trivial contained work proceeds directly. Ambiguous or material design work enters the fitting design workflow before implementation

### 2. Prepare and approve the change

`manager-workflow` owns the proposal, approval, implementation, review, and completion stages for nontrivial implementation work. `brainstorming` resolves open design choices. `writing-plans` records architecture or execution detail when it is useful

The complete proposal is reviewed before implementation. I receive the recommendation, evidence, material trade-offs, changed and unchanged behavior, risks, checks, and exact approval boundary

### 3. Implement through the canonical owner

After approval, Main selects direct work, Worker, or Clone from the judgment and dependency boundary, allocates non-overlapping writes, and keeps independent work moving

Detailed routing, packets, coordination, and tool rules remain in `AGENTS.md` and the effective role prompts. Runtime packages execute launches and enforce only the behavior they actually own

### 4. Review and correct

`review` owns independent coverage, angle definitions, finding groups, and proportionate follow-up. `manager-workflow` owns the transition into review and the final gate

### 5. Verify and report

After the last edit and completed review, Main compares fresh evidence with every material part of the approved outcome, inspects the total effective change, and states unavailable boundaries

A completion claim must follow the current evidence. Agent confidence, stale output, launch receipts, or one narrow check are not proof

## Ownership model

### Intent and project policy

- `SYSTEM_METHODOLOGY.md` owns this durable design intent and compact general model
- `AGENTS.md` owns always-loaded project policy, global invariants, workflow routing, authorization, parent authority, progress, continuity, and implementation rules
- `APPEND_SYSTEM.md` owns the host toolchain and language overlay
- `README.md` owns the concrete repository map and operational setup overview

### Workflows and roles

- `skills/` owns progressively disclosed workflow and domain procedures
- `.agents/skills/` owns project-scoped maintenance workflows
- `agents/` owns role-specific child prompts
- `manager-workflow` owns the material implementation lifecycle
- `review` owns review method and coverage
- `behavioral-proof` owns evidence selection
- `writing-tests` owns test quality and placement

A workflow or role named here remains governed by its current canonical file. This document does not restate its detailed procedure

### Runtime implementation

- `settings.json` owns model selection, package activation, and resource wiring
- `models.json`, `mcp.json`, keybindings, and themes own their named runtime configuration
- `extensions/` and `packages/` own runtime implementation and packaged fallbacks
- effective discovery and precedence decide which resource runs

Prompt policy directs model behavior. It does not imply host enforcement that the runtime does not implement

### Continuity and history

- current conversation and visible progress own active task state
- `.scratch/` owns useful temporary research, plans, reviews, logs, and session continuity
- session history and Tape provide bounded discovery evidence
- Git preserves source history
- approved durable memory stores cross-session context that has no better repository owner

Do not copy repository documentation, raw chat chronology, temporary decisions, or per-change provenance into durable memory or this methodology

## Maintaining this document

Before changing this configuration, read this document and verify every relevant current fact against its canonical executable owner

Update this document when:
- a cross-cutting design principle changes
- the normal lifecycle changes materially
- global ownership changes
- a named general mechanism becomes inaccurate

Do not update this document for:
- behavior confined to one specialized skill, agent, package, extension, command, or UI component
- routine implementation details, model versions, package pins, or generated inventories
- temporary task decisions, exact prior approvals, debugging findings, rejected alternatives, or session chronology

Keep the document current, concise, and free of historical entries. Preserve enough rationale to prevent a repeatedly rejected behavior from being reintroduced, but do not turn rationale into a decision ledger
