---
name: delegation
description: Use for subagent role selection, topology, task packets, parallelism, async handling, tool routing, and supervisor coordination after the active global delegation trigger applies and within the active global parent-child authority boundary.
---

# Delegation

This skill owns this setup's delegation procedure after the active global delegation trigger applies.

The Pi Subagents package owns dispatch, chains, async execution, supervisor messaging, and agent discovery. The active global instructions already in context own the relevant boundaries, specifically parent-child authority, global progress/continuity, authorization, and artifact permission.

## Workflow routing

Use this flow only to select delegation topology. Follow `manager-workflow` for stages and approval, and `review` for review fanout and method.

```text
Request
├─ Root-parent admitted substantive Reflection candidate
│  └─ Launch matching read-only specialist(s) directly; never `clone`.
├─ Direct answer or trivial mechanically obvious edit
│  └─ Parent handles it.
├─ Approved nontrivial implementation
│  └─ clone owns every implementation slice.
└─ Delegated read-only or advisory work
   ├─ One atomic focused deliverable
   │  └─ Launch the matching specialist directly.
   └─ Any other bounded coherent task
      └─ clone owns the task.

Clone task
├─ Later work needs concrete output from earlier work
│  └─ Chain
├─ Work is independent
│  └─ Parallel fanout
└─ One focused specialist output is sufficient
   └─ Single child

Clone fanout
├─ Needs repository reconnaissance
│  └─ scout
├─ Needs current external evidence
│  └─ researcher
├─ Needs implementation or handoff context
│  └─ context-builder
├─ Needs a plan after requirements are clear
│  └─ planner
├─ Needs inherited-context direction or consistency review
│  └─ oracle
├─ Needs independent review evidence
│  └─ reviewer
└─ Needs non-subagent long-command monitoring
   └─ run-monitor

Fanout output
├─ Informs a recommendation, plan, approval decision, or completion claim
│  └─ Synthesize the concrete outputs first.
│     Use a reducer only when it materially helps with a bounded comparison.
│     It does not make decisions or claims.
└─ Does not inform a decision
   └─ Inspect the output only when it becomes relevant.
```

### Reflection routing

Root-parent Reflection overrides the general read-only/advisory fallback: route every admitted substantive candidate directly to matching read-only specialists, even when non-atomic; never `clone`. Ordinary children remain non-orchestrators.

Admit only a useful, new, bounded, authorized, interruptible, non-interfering candidate that is dispatchable to an eligible read-only specialist and names a distinct task-advancing evidence target. If dispatch is unavailable or prohibited, including by a strict no-artifact instruction, do not admit it or substitute parent investigation.

Every packet forbids file, Git, external, and other mutation and requires concrete evidence, a bounded stop condition, and an actual-effects report.

The parent selects roles and targets, coordinates children, and synthesizes returned evidence against the approved task and known state. It dispositions findings but does not independently investigate an angle; dispatch each new substantive angle.

The general delegation, async, and review rules remain authoritative for parallelism, duplicate prevention, reducers, and formal review.

Route every approved nontrivial implementation slice to `clone`, including a lone slice. The parent may implement only trivial mechanically obvious edits or corrections. When two or more approved implementation slices are genuinely independent, dispatch them in the same parallel wave when their active write sets are disjoint and their dependencies permit it. Consolidate shared-file changes under one owner when practical; otherwise schedule the shared file in a later accepted wave.

Before each write wave involving a clone, the parent creates one allocation map containing its own and every active clone’s write set as exact paths or unambiguous globs. Include the complete map in every clone packet. All participants may read shared files. A clone stops through `contact_supervisor` before writing outside its assigned set, including an apparently unowned file. Ownership never changes mid-wave. For a normal handoff, the parent accepts the current wave before starting the next map. If missing ownership blocks the slice, the parent instructs the clone to end the current wave and return partial evidence, inspects it, releases the allocation, and starts a fresh wave whose map includes the required files. Dependent work waits until the new wave’s prerequisite evidence is green. Never launch a nested clone.

Use only distinct roles or evidence targets that can change the decision, implementation, risk, or proof. Size parallelism from concrete independent evidence gaps, risk surfaces, and useful roles. Stop when evidence is sufficient; pending work or cost alone does not justify another wave. Do not launch duplicate children only to satisfy a number.

Honor a feasible explicit number requested by the user when the work can be split into distinct safe scopes with fan-in. If it cannot, explain the concrete limit and ask for a revised scope.

For code-capable child tasks, pass `skill: "code-intelligence"` when code structure, types, relationships, or diagnostics are material. Clone inherits the skill catalog; specialists receive only explicitly supplied skills.

Use the smallest topology that preserves dependencies, exclusive active write ownership, and synthesis.

## Parent and child execution

Follow the active global instructions already in context, specifically the parent-child authority and integration rules in the `Orchestration boundary` section. Assign each clone one bounded coherent task and require the canonical event protocol in `agents/clone.md` without duplicating it here. Progress reports are non-blocking; use `need_decision` and wait only when parent input is required. The parent inspects or steers only for concrete drift, conflict, blockers, runtime control notices, or useful new evidence. Continue useful non-overlapping work while clones run; do not duplicate implementation or routinely poll.

Each clone runs complete but proportionate verification for its slice and returns actual changed files plus named commands and results. Dependent phases wait until the parent accepts prerequisite evidence as green; independent phases continue concurrently.

At fan-in, the parent inspects every clone result and the complete effective diff for scope, unexpected files, ownership violations, and combined contracts. It verifies integration and key combined risks without routinely rerunning sufficient current slice checks, then follows `manager-workflow` and `review` for the integrated readiness review. The parent may repair a trivial mechanically obvious defect; substantive, uncertain, behavioral, or multi-file corrections return to a clone with exact failure evidence.

## Child task contract

Give each child:

- the concrete outcome
- approved behavior and non-goals when relevant
- the exact evidence target and why it is distinct
- required proof or available evidence, including named slice checks
- effect and mutation boundaries
- for a writing clone, the complete per-wave allocation map and its assigned active write set
- ownership-conflict and scope-expansion stop conditions
- the canonical clone progress protocol when applicable
- a bounded stop condition
- the expected response shape
- an output path only when an artifact is useful and allowed

For review tasks, follow the packet and output contract in `review`. Treat reviewer findings as evidence, not edit or approval authority.

## Async work

Launch top-level subagent work asynchronously. Use fresh context for independent review and reconnaissance. Use forked context only when the child needs the parent session history.

After launch:

- continue only useful, non-overlapping parent work
- do not sleep-poll a healthy child
- inspect actual child output before a dependent decision or claim
- use status or transcript inspection for a concrete blocker, failure, completion event, or decision
- steer or interrupt only when the child is blocked, drifting, or needs corrected evidence
- answer child decision requests through the native supervisor channel

Use a `run-monitor` for long tmux, log, server, build, or test commands when monitoring is useful and native async completion does not already cover the run. The monitor stays read-only.

## MCP capability routing

When a delegable task needs a configured MCP server and an eligible child can use it:

1. Confirm the `mcp` bundle and allowed role with `subagent({ action: "list" })`
2. Add `toolExtensions: { add: ["mcp"] }` and `requiresCapabilities: ["mcp"]`
3. Name the server, required evidence, allowed effects, and authentication boundary in the task
4. For read-only work, say directly that the child must not edit or modify files
5. Require the child to report the tool used, evidence, actual effects, and unverified boundaries

Never treat capability routing as mutation authorization. Do not create a persistent agent to obtain one-off MCP access.

## Review fanout

For implementation reviews, follow `manager-workflow`; for standalone reviews, follow `review`. Dispatch only the roles those skills select and preserve the parent-child boundary.

## Artifacts

Follow the active global instructions already in context, specifically the permission and override policy in the `.scratch/ workspace` section. When artifacts are allowed, use `.scratch/pi-subagents/` for project-scoped Pi Subagents runtime artifacts. A strict no-file or no-artifact instruction forbids subagent runs because child sessions and logs are artifacts. A repository-only no-artifact instruction may still allow child runs with repository output and progress artifacts disabled.

## Before yielding

This procedure applies to the root parent. Before yielding:

1. Handle decision-relevant child asks, actionable failures, completed outputs, and material corrections; send new evidence to a running child only when a real delta can correct or unblock it
2. Continue required nonconflicting, nonduplicate parent work and concrete parent-owned TODO or session-state maintenance
3. Scan the Reflection goals in `AGENTS.md` and immediately send every qualifying candidate through Reflection routing

While children run, do not poll them, repeat their analysis, or develop their angles. Inspect outputs before dependent synthesis, decisions, or claims; route a new substantive synthesis angle as a new candidate. Otherwise apply the final yield condition in `AGENTS.md`.
