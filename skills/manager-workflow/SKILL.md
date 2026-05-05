---
name: manager-workflow
description: Core delegation and workflow orchestration — 3-tier task routing with .scratch/ workspace. Use when asked to implement features, build systems, refactor code, create new services, migrate libraries, redesign architecture, or any multi-step implementation work.
---

# Manager Workflow

## Tier Assessment

Before starting any implementation, assess the tier and state the classification in chat.

### Planning Gate

Do not edit code until the user approves if any of these are true:

- The user asks to "think where it lives", "decide where", "design", "architecture", or otherwise implies placement/design judgment.
- The change may touch more than one tracked file.
- The change requires tests or docs.
- The change introduces a new config flag, public parameter, environment variable, registry field, API surface, or behavior toggle.
- There are multiple plausible implementation locations.

For Tier 2 tasks, present a brief table with option, location/files, pros, cons, and recommendation. Then ask for explicit approval.

Only Tier 1 may proceed without approval:

- One file
- Under ~20 changed lines
- No behavior/config/API surface decision
- No docs/tests needed
- Requirements are unambiguous

If unsure, classify as Tier 2.

Before the first mutating tool call, internally verify:

1. Did I state the tier to the user?
2. Is there any placement/design decision?
3. Will this touch tests/docs/config?
4. Did the user explicitly approve if Tier 2+?

If any answer requires approval, stop and ask.

### Tier 1 — Just Do It

- Single file, clear intent, < ~20 lines
- No discussion needed. Make the change, show what you did.
- Examples: fix a type error, rename a variable, add an import

### Tier 2 — Talk First

- Multi-file or ambiguous intent
- Present what you'd change, where, and why. Get approval.
- No plan files. Brief discussion in chat.
- Examples: add a new API endpoint, refactor a module, fix a bug touching 3+ files

### Tier 3 — Write It Down

- Architectural, > 5 files, new systems, irreversible
- Write plan to `.scratch/plans/YYYY-MM-DD-<slug>.md`
- Mark every assumption: **[ASSUMPTION: ...]**
- Present summary. Wait for explicit approval.
- Implement via worker subagents with exact instructions.
- Examples: redesign a system, migrate libraries, build a new service

The user can always escalate. If they say "wait", "let's talk", or "hold on" — move up a tier.

## Delegation Rules

### Research Phase

- Dispatch scout agents for codebase exploration
- Scouts can run in parallel (e.g., 5 scouts analyzing different modules)
- Scouts write findings to `.scratch/research/`
- Read scout findings before planning

### Implementation Phase

- Worker agents get exact instructions: which files, which functions, what changes, line numbers
- If you can't specify exactly, you haven't planned enough — go back to planning
- Workers run in sequence, not parallel
- Workers run checks before reporting done
- Workers write results to `.scratch/`

### Review Phase

- Dispatch reviewer agent after implementation
- Reviewer checks against the plan and coding standards
- Reviewer writes findings to `.scratch/reviews/`
- Address must-fix findings before presenting to user

### Completion Phase

- Run required checks and report evidence.
- If the current branch has an open PR, load the github skill and update the existing PR description with what changed and how it was tested.
- Update, merge, or append to the existing PR body; never overwrite unrelated content.

## .scratch/ Workspace

Ensure `.scratch/` exists and is gitignored. Do not make unrelated setup edits such as adding `.scratch/` to `.gitignore` during a feature change unless the user approves or the edit is required for the requested change.

Organized:

- `research/` — scout findings
- `plans/` — change plans with [ASSUMPTION] annotations
- `reviews/` — reviewer output
- `sessions/` — session state for continuation

Quick lookups stay in context. Deeper research goes to files.
Check for existing .scratch/ files before re-researching.
