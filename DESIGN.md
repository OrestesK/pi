# Design Decisions

This document explains the current shape of the config without relying on private session history.

## Goals

- Keep the always-loaded prompt small.
- Prefer structural code navigation over raw text search.
- Make risky operations explicit and hard to trigger accidentally.
- Keep long-running work organized in files, not only in chat context.
- Use specialized workflows only when they are relevant.
- Make delegation predictable by giving agents narrow roles.

## Core Principles

### Tree-sitter first

Code navigation starts with structure:

- symbol search for definitions
- document symbols for file overview
- symbol definitions for targeted reads
- structural pattern search for code patterns

Raw text search still exists, but it is not the default for understanding code.

### Read-only git

The agent can inspect git state but does not mutate it.

Allowed git operations are limited to read-only commands such as:

- `git status`
- `git diff`
- `git log`
- `git show`
- `git blame`

Staging, committing, pushing, rebasing, resetting, stashing, and branch manipulation stay manual. This keeps repository state under user control.

### Guardrails are configuration, not just instructions

Prompt instructions are useful, but high-risk operations should also be blocked at the tool layer.

`extensions/guardrails.json` denies destructive shell patterns and git mutations. `permissions.json` can stay low-friction because the safety boundary is encoded in guardrails.

### Scratch files for durable work

`.scratch/` is the working area for agent-produced artifacts:

```
.scratch/
├── research/    # scout findings
├── plans/       # implementation plans
├── reviews/     # review output
└── sessions/    # continuation notes
```

This keeps large intermediate reasoning and reports out of the main conversation until they are needed.

### Roles over generic delegation

Subagents are split by responsibility:

| Role            | Purpose                                    |
| --------------- | ------------------------------------------ |
| scout           | Read-only reconnaissance and summarization |
| worker          | Implementation from explicit instructions  |
| reviewer        | Review against plan and coding standards   |
| general-purpose | Fallback role for uncategorized tasks      |

The main agent remains responsible for user discussion, planning, tradeoffs, and final decisions.

### Skills over prompt bloat

Specialized workflows live in `skills/` instead of being fully embedded in `AGENTS.md`.

This keeps the base prompt smaller while still making workflows available when needed. Examples:

- `manager-workflow` for tiered implementation flow
- `systematic-debugging` for bug investigation
- `review` for code review
- `session-reader` for session JSONL analysis
- `self-improve` for config retrospectives

### Lazy integrations by default

MCP servers and packages should be lazy unless they need to be visible every turn.

Current split:

| Integration  | Loading strategy          | Reason                                                    |
| ------------ | ------------------------- | --------------------------------------------------------- |
| tree-sitter  | Direct tools / keep-alive | Core code navigation should be immediately available      |
| context7     | Lazy                      | Documentation lookup is only needed for library questions |
| nvim         | Lazy                      | Editor state is only needed on request                    |
| context-mode | Lazy                      | Large-output processing is situational                    |

## Workflow Shape

### Three implementation tiers

| Tier   | Use when                               | Behavior                                                             |
| ------ | -------------------------------------- | -------------------------------------------------------------------- |
| Tier 1 | Small, single-file, unambiguous change | Main agent edits directly                                            |
| Tier 2 | Multi-file or ambiguous change         | Discuss approach before editing                                      |
| Tier 3 | Architectural or broad change          | Write plan to `.scratch/plans/`, mark assumptions, wait for approval |

The point is not process for its own sake. The tiering exists to slow down only when coordination risk is high.

### Planning artifacts

Plans, research, and reviews are files, not hidden conversation state. This makes them easier to inspect, edit, reuse, and discard.

### Review loop

Implementation work should be followed by review when the change is non-trivial. Review output goes in `.scratch/reviews/` and should focus on actionable issues.

## Package Choices

| Package                | Why it is included                                          |
| ---------------------- | ----------------------------------------------------------- |
| `pi-subagents`         | Delegation across scout, worker, and reviewer roles         |
| `pi-mcp-adapter`       | Lazy loading for MCP servers                                |
| `pi-lens`              | AST-aware search/navigation helpers                         |
| `pi-web-access`        | Web search and content extraction                           |
| `pi-memory-md`         | Durable markdown memory                                     |
| `@aliou/pi-guardrails` | Tool-layer safety policies                                  |
| `@aliou/pi-toolchain`  | Preferred CLI enforcement                                   |
| `pi-rewind`            | Recovery checkpoints                                        |
| `pi-ask-user`          | Structured user decision prompts                            |
| `context-mode`         | Large-output analysis without flooding conversation context |
| `extensions/claude-ui` | Local terminal UI customization                             |

## Notable Extensions

| Extension            | Purpose                                                                 |
| -------------------- | ----------------------------------------------------------------------- |
| `answer.ts`          | Extract questions from an assistant response and answer them one by one |
| `files.ts`           | Browse repo files and session-referenced files through a TUI            |
| `todos/`             | File-backed task tracking                                               |
| `continue.ts`        | Write continuation notes and start fresh context                        |
| `compact-advisor.ts` | Prompt for compaction when context grows large                          |
| `guardrails.json`    | Deny destructive shell and git operations                               |

Copied and adapted extension sources are listed in `ATTRIBUTIONS.md`.

## Personal Assumptions

This is a personal config, not a turnkey distribution. Reusers should review:

- `APPEND_SYSTEM.md` for operating system, editor, shell, and project conventions
- `settings.json` for provider, model, packages, and absolute paths
- `mcp.json` for MCP commands and absolute paths
- `permissions.json` for permission mode
- `extensions/guardrails.json` for command policy

## Public Repo Hygiene

The repository should not track runtime state, local credentials, session logs, or dependency installs.

Ignored files include:

- `auth.json`
- `sessions/`
- `run-history.jsonl`
- `mcp-cache.json`
- `mcp-onboarding.json`
- `pi-crash.log`
- `.scratch/`
- `**/node_modules`

## Sources and Attribution

This config is influenced by public pi configs, pi ecosystem packages, and agent workflow writeups. Copied or closely adapted files are documented in `ATTRIBUTIONS.md` with source repositories and licenses.
