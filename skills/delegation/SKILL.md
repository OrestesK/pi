---
name: delegation
description: Use subagents for nontrivial work, review support, research, reconnaissance, validation, and exceptional isolated implementation. Owns local role selection, parent-child boundaries, async handling, and supervisor coordination; the Pi Subagents package owns execution.
---

# Delegation

This skill describes how and when to use subagents

The Pi Subagents package owns dispatch, chains, async execution, supervisor messaging, and agent discovery. .

Use subagents for nontrivial work unless delegation is unavailable, prohibited, or a strict no-artifact instruction forbids child-session artifacts. The parent owns user communication, decisions, integration, and final verification.

## Workflow routing

Use this flow only to select delegation topology. Follow `manager-workflow` for stages and approval, and `review` for review fanout and method.

```text
Request
├─ Direct answer or one simple bounded task you can complete
│  └─ Handle it yourself; do not delegate.
└─ Delegation can materially improve the result
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
│     Use a reducer only when it materially helps with a bounded comparison;
│     it does not make decisions or claims.
└─ Does not inform a decision
   └─ Inspect the output only when it becomes relevant.
```

Run independent top-level clones and direct specialists in parallel. Use clone by default for every bounded coherent task that is not one atomic specialist deliverable. A clone owns its task-level implementation area and may use every required file in the shared project. The parent and other active task owners must avoid that task area. The clone stops and asks its immediate parent before touching a file owned by another active task, making a decision, handling a contradiction, or changing scope. Never launch a nested clone.

Use only distinct roles or evidence targets that can change the decision, implementation, risk, or proof. Do not launch duplicate children to satisfy a number. Honor a feasible explicit number requested by the user when the work can be divided safely.

For code-capable child tasks, pass `skill: "code-intelligence"` when code structure, types, relationships, or diagnostics are material. Clone inherits the skill catalog; specialists receive only explicitly supplied skills.

Use the smallest topology that preserves dependencies and synthesis.

## Parent and child ownership

Assign clone one bounded coherent task. Continue useful non-overlapping work while it runs; do not duplicate its implementation or poll it. Read every file you edit and every completed clone diff before integration.

Clone runs the applicable verification and independent review policy before completion. It returns changed files, child evidence, verification and review results, open risks, and the next integration step. The parent makes the final decision and performs the proportionate integration check.

## Child task contract

Give each child:

- the concrete outcome;
- approved behavior and non-goals when relevant;
- the exact evidence target and why it is distinct;
- required proof or available evidence;
- effect and mutation boundaries;
- a bounded stop condition;
- the expected response shape;
- an output path only when an artifact is useful and allowed.

For review tasks, follow the packet and output contract in `review`. Treat reviewer findings as evidence, not edit or approval authority.

## Async work

Launch top-level subagent work asynchronously. Use fresh context for independent review and reconnaissance. Use forked context only when the child needs the parent session history.

After launch:

- continue only useful, non-overlapping parent work;
- do not sleep-poll a healthy child;
- inspect actual child output before a dependent decision or claim;
- use status or transcript inspection for a concrete blocker, failure, completion event, or decision;
- steer or interrupt only when the child is blocked, drifting, or needs corrected evidence;
- answer child decision requests through the native supervisor channel.

Use a `run-monitor` for long tmux, log, server, build, or test commands when monitoring is useful and native async completion does not already cover the run. The monitor stays read-only.

## MCP capability routing

When a delegable task needs a configured MCP server and an eligible child can use it:

1. Confirm the `mcp` bundle and allowed role with `subagent({ action: "list" })`.
2. Add `toolExtensions: { add: ["mcp"] }` and `requiresCapabilities: ["mcp"]`.
3. Name the server, required evidence, allowed effects, and authentication boundary in the task.
4. For read-only work, say directly that the child must not edit or modify files.
5. Require the child to report the tool used, evidence, actual effects, and unverified boundaries.

Never treat capability routing as mutation authorization. Do not create a persistent agent to obtain one-off MCP access.

## Review fanout

For implementation reviews, follow `manager-workflow`; for standalone reviews, follow `review`. Dispatch only the roles those skills select and preserve the parent-child boundary.

## Artifacts

Put allowed project artifacts under `.scratch/`; use `.scratch/pi-subagents/` for Pi Subagents runtime artifacts. A strict no-file or no-artifact instruction forbids subagent runs because child sessions and logs are artifacts. A repository-only no-artifact instruction may still allow child runs with repository output and progress artifacts disabled.

## Before yielding

Before yielding:

1. Handle child asks, actionable failures, and completed outputs that affect the current decision.
2. Continue identified safe parent work that cannot conflict or delay the user.
3. Look once for a concrete unresolved evidence gap, risk, decision, simplification, verification need, or permitted task-state update.
4. Act only when the work is useful, new, bounded, authorized, and non-interfering.

Do not invent cleanup, repeat an active audit, poll a healthy child, or work only to avoid yielding. Yield when no useful work or meaningful child interaction remains. Completion notifications resume the parent.
