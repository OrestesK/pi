# Pi Config v2

Personal pi coding agent configuration for Orestes. Built May 2026.

## Architecture

```
pi-v2/
├── AGENTS.md                  # Core agent behavior (~140 lines)
├── APPEND_SYSTEM.md           # Environment-specific details (stack, system)
├── settings.json              # Provider, model, packages, compaction
├── models.json                # Custom model definitions (gpt-5.5)
├── mcp.json                   # MCP servers (tree-sitter + context7 + nvim)
├── permissions.json           # YOLO mode
├── keybindings.json           # escape/ctrl+c/ctrl+d
├── setup.sh                   # Symlinks config to ~/.pi/agent
├── worktree-setup.sh          # Git worktree isolation setup
│
├── agents/                    # Subagent role definitions
│   ├── scout.md               # Read-only recon (gpt-5.4-mini, fast)
│   ├── worker.md              # Implementation (gpt-5.4)
│   ├── reviewer.md            # Code review (gpt-5.4)
│   └── general-purpose.md     # Default subagent override
│
├── skills/                    # On-demand skills (zero cost until triggered)
│   ├── manager-workflow/      # 3-tier workflow: just-do-it / talk-first / write-it-down
│   ├── commit/                # Git commit conventions (ok/ prefix, terse messages)
│   ├── systematic-debugging/  # Observe → hypothesize → verify → fix
│   ├── frontend/              # React/TypeScript conventions
│   ├── semantic-git/          # sem CLI for structural git analysis
│   ├── github/                # gh CLI operations
│   ├── learn-codebase/        # First-session project orientation
│   ├── iterate-pr/            # Automated PR fix-push-check loop
│   ├── review/                # Code review standards
│   ├── self-improve/          # End-of-session retrospective (from HazAT)
│   └── session-reader/        # Parse session JSONL files (from HazAT)
│
├── extensions/
│   ├── claude-ui/             # Custom Claude-style terminal UI (must be first in load order)
│   ├── todos/                 # File-based todo management (from mitsuhiko via HazAT)
│   ├── guardrails.json        # Blocks destructive commands and all git mutations
│   ├── answer.ts              # /answer — Q&A TUI for answering agent questions one by one (from mitsuhiko)
│   ├── files.ts               # /files /diff — fuzzy file browser with quick actions (from mitsuhiko)
│   ├── continue.ts            # /continue — session handoff to fresh context (from Mansoor)
│   └── compact-advisor.ts     # Warns at 150k tokens, suggests compaction (from Mansoor)
│
├── themes/
│   └── gruvbox-custom.json    # Gruvbox dark theme
│
├── mcp-servers/
│   └── tree-sitter/           # Custom tree-sitter MCP (7 AST tools)
│
└── .gitignore                 # Excludes auth, sessions, caches, logs, node_modules
```

## How It Works

### Workflow (3 tiers)

| Tier              | When                                  | What happens                                                          |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------- |
| 1 — Just do it    | Single file, < 20 lines, clear intent | Agent makes the change directly                                       |
| 2 — Talk first    | Multi-file or ambiguous               | Agent discusses approach, gets approval                               |
| 3 — Write it down | Architectural, > 5 files              | Agent writes plan to .scratch/, marks assumptions, waits for approval |

### Delegation (4 roles)

| Role     | Model        | What it does                                                 |
| -------- | ------------ | ------------------------------------------------------------ |
| main     | gpt-5.5      | Plans, coordinates, talks with you. Does Tier 1 edits.       |
| scout    | gpt-5.4-mini | Fast read-only recon. Writes to .scratch/research/.          |
| worker   | gpt-5.4      | Implements from exact instructions. Runs checks before done. |
| reviewer | gpt-5.4      | Reviews against plan. Writes to .scratch/reviews/.           |

### Tool priority

1. **tree-sitter** (symbol_definition, search_symbols, document_symbols, pattern_search) — always first for code navigation
2. **context7** — for library/framework docs, never guess
3. **Preferred CLIs** — uv, pnpm, difft, fd, bat, sd, ast-grep, shellcheck, gh, aws
4. **Grep/Glob/Read** — when tree-sitter doesn't apply

### Git: read-only

Agent can only run: git log, git diff, git status, git blame, git show.
All mutations (add, commit, push, checkout, etc.) are blocked by guardrails.

### .scratch/ workspace

```
.scratch/           (gitignored, per-project)
├── research/       scout findings
├── plans/          change plans with [ASSUMPTION] annotations
├── reviews/        reviewer output
└── sessions/       session state for continuation
```

## Packages (11)

| Package                      | What it does                                                |
| ---------------------------- | ----------------------------------------------------------- |
| extensions/claude-ui (local) | Claude-style terminal UI rendering                          |
| pi-subagents                 | Scout/worker/reviewer delegation                            |
| pi-mcp-adapter               | Lazy MCP proxy for context7                                 |
| pi-lens                      | AST-enhanced reads                                          |
| pi-web-access                | Web search + content extraction                             |
| pi-memory-md                 | Cross-session memory (git-backed markdown)                  |
| @aliou/pi-guardrails         | Security baseline (npm)                                     |
| @aliou/pi-toolchain          | Enforces preferred CLIs (uv, pnpm, difft, fd, etc.)         |
| pi-rewind                    | Per-turn git checkpoints                                    |
| pi-ask-user                  | Structured question UI — agent presents options, user picks |
| context-mode                 | Keeps raw data out of context (98% reduction)               |

## MCP Servers (3)

| Server      | Mode                          | Purpose                                                      |
| ----------- | ----------------------------- | ------------------------------------------------------------ |
| tree-sitter | Direct tools (always visible) | Code intelligence — symbols, definitions, patterns           |
| context7    | Via adapter (on demand)       | Library/framework documentation lookup                       |
| nvim        | Lazy (on demand)              | Neovim state — open buffers, cursor, selections, diagnostics |

Everything else (GitHub, AWS, etc.) uses CLI tools via bash — zero token cost.

## Setup

Prerequisites:

- pi coding agent
- Node.js/npm for npm-hosted packages and the local tree-sitter MCP server
- uv/uvx for the nvim MCP server
- context7-mcp on PATH for library documentation lookup

```bash
cd ~/.config/pi
chmod +x setup.sh
./setup.sh
```

## Publishing Safety

This repository intentionally excludes local runtime and secret-bearing files:

- `auth.json`
- `sessions/`
- `run-history.jsonl`
- `mcp-cache.json`
- `pi-crash.log`
- `**/node_modules/`
- `.scratch/`

Review `APPEND_SYSTEM.md`, `settings.json`, and `permissions.json` before reusing this config. They contain personal environment assumptions, absolute paths, model/provider choices, and YOLO-mode permissions guarded by `extensions/guardrails.json`.

## Design Decisions

Based on analysis of 4 Claude Code sessions (4,528 tool calls) and research from 21+ articles and 10+ community configs:

- **Tree-sitter as direct tools**: Claude Code ignored MCP tools across ALL sessions. Pi's smaller system prompt gives AGENTS.md instructions more weight. Direct tools make them reflexive.
- **Read-only git**: Session 3 had a destructive git disaster (checkout → stash → stash drop destroyed work). Blocked at guardrails level.
- **Workers write to .scratch/, not context**: Session 1 had subagent results polluting main context. .scratch/ files keep context clean.
- **Batched code quality checks**: Session 3 had 35 pyright runs in one session. Workers batch checks at end.
- **Named agent roles**: Prevents "general-purpose does everything badly." Each role has specific model, tools, and rules.
- **11 skills, zero context cost**: Skills load on demand. No token cost until triggered.
- **gitnexus CLI**: Available globally for on-demand call-chain and blast radius analysis (`gitnexus query`, `gitnexus impact`). Not a pi package — zero token cost.
