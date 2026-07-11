# How to Use Pi

This is the human quick-start guide. For configuration ownership and file locations, use the [repository map](README.md#file-map).

## Start

```bash
cd ~/your-project
pi
```

In an unfamiliar repository, say `learn the codebase`.

Describe the outcome you want. Add a checkpoint when useful:

- `write a plan first`
- `ask me what you need first`
- `review the changes`
- `wait`, `hold on`, or `let's talk`

The executable workflow and approval rules live in [`AGENTS.md`](AGENTS.md) and the loaded skills; this guide does not redefine them.

## Common workflows

| Ask for | Use it when |
| --- | --- |
| `learn the codebase` | Starting in an unfamiliar project |
| `debug this systematically` | Investigating a failure before changing code |
| `write a plan first` | A change needs an explicit implementation plan |
| `review the changes` | You want a focused review pass |
| `quality gate this` | You need a `PASS`, `FAIL`, or `INCONCLUSIVE` verdict |
| `give me options` | You want candidates generated, filtered, and ranked |
| `ask me what you need first` | Requirements or constraints are not settled |

## Commands

| Command | Purpose |
| --- | --- |
| `/answer` | Extract questions from the last assistant message and answer them interactively |
| `/cc`, `/copy-code` | Copy a fenced command or code block from recent assistant messages |
| `/context` | Show current context and token usage |
| `/continue [slug]` | Save a continuation note under `.scratch/sessions/` and start a fresh session |
| `/files` | Browse files referenced by Git or the current session |
| `/goal` | Run or manage a session-scoped continuation goal |
| `/slipstream` | Inspect or run Slipstream compaction controls |
| `/skill:self-improve` | Review the session and suggest config improvements |
| `/todos` | Open the interactive todo manager |

## Shortcuts

| Shortcut | Purpose |
| --- | --- |
| `ctrl+.` | Run the `/answer` flow |
| `ctrl+shift+o` | Open the `/files` browser |
| `ctrl+shift+f` | Reveal the latest session file reference |
| `ctrl+shift+r` | Quick Look the latest session file reference |

## Editor integration

When the editor MCP is available, Pi can inspect open buffers, cursor position, selections, and diagnostics. For example:

- “What file do I have open?”
- “Check editor diagnostics.”
- “Read my current selection.”

## Context and handoffs

- Automatic compaction is enabled; Slipstream artifacts go under `.scratch/compactions/`.
- A qualifying automatic compaction may queue a continuation turn through `extensions/compact-advisor.ts`.
- Use `/continue` when a clean handoff would help.
- Research, plans, reviews, and continuation notes belong in `.scratch/`.
- Durable runbooks belong in memory; quick facts can stay in the conversation.

## Git

Pi may inspect Git state but is instructed not to mutate it. You stage, commit, push, branch, rebase, and merge. This config uses `permissions.json` in `yolo` mode, so the restriction is prompt policy backed by guardrails for many mutations, not a universal confirmation dialog.

Ask for a commit message when the change is ready.

## Local customization

Use [`APPEND_SYSTEM.md`](APPEND_SYSTEM.md) for machine-specific facts and conventions. Use the [file map](README.md#file-map) to find models, packages, MCP servers, permissions, keybindings, roles, and skills.
