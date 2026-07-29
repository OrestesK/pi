---
name: delegation
description: Use subagents for nontrivial work, review support, research, reconnaissance, validation, and exceptional isolated implementation. Owns local role selection, parent-child boundaries, async handling, and supervisor coordination; the Pi Subagents package owns execution.
---

# Delegation

The Pi Subagents package owns dispatch, chains, async execution, supervisor messaging, and agent discovery. This skill owns how this setup uses those capabilities.

Use subagents for nontrivial work unless delegation is unavailable, prohibited, or a strict no-artifact instruction forbids child-session artifacts. The parent remains the decision maker and normally implements, integrates, fixes, and verifies.

## Choose a role

- `scout`: fast repository reconnaissance
- `researcher`: current external evidence
- `context-builder`: focused implementation or handoff context
- `planner`: a plan after requirements are clear
- `reviewer`: independent evidence and findings
- `oracle`: high-context consistency and direction checks
- `run-monitor`: read-only monitoring of long commands and logs
- `delegate`: small read-only tasks without a specialist contract
- `worker`: exceptional approved implementation with exclusive ownership

Use only distinct roles or evidence targets that can change the decision, implementation, risk, or proof. Do not launch duplicate children to satisfy a number. Honor a feasible explicit number requested by the user when the work can be divided safely.

For code-capable child tasks, pass `skill: "code-intelligence"` when code structure, types, relationships, or diagnostics are material. Children do not inherit the skill catalog automatically.

## Parent and child ownership

The parent normally writes. It directly reads every file it edits and every delegated diff.

A worker may write only when:

- at least two independent implementation areas can proceed concurrently and the parent owns one area; or
- the parent has validated one simple, behavior-preserving, non-material cleanup inside the approved boundary and continues independent non-overlapping work.

Give each writer one exclusive file or symbol area. State the approved behavior, non-goals, proof, prohibited decisions, and stop conditions. A file assignment prevents collisions; it is not the user's approval boundary.

The worker stops for overlap, a stale contract, a real blocker, or an unapproved behavior, API, compatibility, security, data, dependency, architecture, or scope decision. The parent inspects and verifies the combined result. Do not run repository-wide mutating formatters, generators, or migrations while writers are active.

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

Review tasks also follow the packet and output contract in `review`. Reviewer findings are evidence, not edit or approval authority.

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

Capability routing never authorizes a mutation. Do not create a persistent agent to obtain one-off MCP access.

## Review fanout

`manager-workflow` decides when review occurs. `review` owns reviewer count, packets, finding partitions, and post-fix follow-up. This skill only dispatches the selected roles and preserves the parent-child boundary.

## Artifacts

Use `.scratch/` for allowed project artifacts. Project-scoped Pi Subagents runtime files use `.scratch/pi-subagents/`; package code owns that path. A strict no-file or no-artifact instruction forbids subagent runs because child sessions and logs are artifacts. A repository-only no-artifact instruction may still allow child runs with repository output and progress artifacts disabled.

## Before yielding

Before yielding:

1. Handle child asks, actionable failures, and completed outputs that affect the current decision.
2. Continue identified safe parent work that cannot conflict or delay the user.
3. Look once for a concrete unresolved evidence gap, risk, decision, simplification, verification need, or permitted task-state update.
4. Act only when the work is useful, new, bounded, authorized, and non-interfering.

Do not invent cleanup, repeat an active audit, poll a healthy child, or work only to avoid yielding. Yield when no useful work or meaningful child interaction remains. Completion notifications resume the parent.
