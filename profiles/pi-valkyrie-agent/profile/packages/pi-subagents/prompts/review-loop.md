---
description: Review/fix loop until clean
---

Run a parent-orchestrated review loop for the requested work. The parent session normally owns implementation, fixes, integration, and final verification.

Use the `subagent` tool for broad read-only reconnaissance, research, planning advice, review, and validation. Child subagents must receive concrete role-specific tasks; they must not run subagents or manage the loop themselves unless the parent intentionally selected an explicit fanout agent whose builtin `tools` includes `subagent` for that assigned fanout.

If the invocation includes an implementation request, the parent implements the current approved task contract. Bind every write pass to its revision, behavior, non-goals, root/worktree, exact files and baseline symbols/ranges, allowed new files, changed-line budget, and approval boundaries. If the current diff is already the target, start with review. The parent directly reads the precise files and symbols it edits and every delegated diff.

Use a write-capable child only when at least two independent implementation or fix areas can proceed concurrently in the shared checkout. The parent must own at least one area, and every writer must receive an exclusive, non-overlapping file list. Every write-child dispatch must name the current contract revision, exact files and baseline symbols/ranges, required behavior, non-goals, changed-line budget, validation commands and evidence, and prohibited product/API/compatibility/scope decisions. The child stops before touching an unassigned file and contacts the parent only for a real blocker, discovered file overlap, stale revision, or an unapproved product/API/compatibility/scope decision.

Do not run repository-wide mutating formatters, code generators, migrations, or equivalent commands while concurrent writes are active. The parent inspects, integrates, and verifies every delegated change.

Default to a maximum of 3 review rounds unless I specify a different cap. Count a review round each time fresh-context reviewers inspect the current diff after an implementation or fix pass. Stop early when reviewers find no blockers or fixes worth doing now.

For each review round, launch fresh-context, read-only `reviewer` agents in parallel. Reviewers must inspect the repository, relevant instructions, and current diff directly from files and commands. They must not rely on the main conversation history and must not modify project/source files.

Choose review angles from the actual change. Common angles are correctness/regressions, tests/validation, and simplicity/maintainability. Add security, performance, docs/API contracts, or user-flow validation when the work calls for it. Prefer three strong reviewers over many vague reviewers.

After reviewers return, the parent synthesizes their feedback into:
- blockers or scope/product/architecture decisions that need user approval;
- fixes worth doing now;
- optional improvements;
- feedback to ignore or defer, with a short reason.

Do not blindly apply every reviewer suggestion. Findings are evidence, not authority to amend the task contract. If a fix needs another file, range, behavior, dependency, changed-line budget, or an unapproved product, scope, architecture, compatibility, or API decision, pause and ask me before editing.

When fixes are authorized by the current contract, the parent applies them. Use write children only when at least two independent fix areas satisfy the same concurrent-write contract and revision. Run another review round only after material changes or non-trivial findings; do not loop for optional polish, speculative improvements, or findings already deferred by the parent.

Stop and summarize when one of these is true:
- reviewers find no blockers or fixes worth doing now;
- remaining feedback is optional, speculative, or intentionally deferred;
- reviewers surface an unapproved product/API/compatibility/scope/architecture decision that needs me;
- the max review-round cap is reached.

On completion, inspect the final diff, run or confirm focused validation, and summarize the loop: rounds run, fixes applied, validation, remaining deferred items, and why the loop stopped.

Additional target, implementation request, max-iteration cap, or review focus from the slash command invocation:

$@
