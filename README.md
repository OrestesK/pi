# Pi Config v2

Personal configuration for the Pi coding agent.

- New to this setup: [How to use Pi](USAGE.md)
- Maintaining the config: start with the file map below
- Why it is structured this way: [Design decisions](DESIGN.md)
- Source provenance: [Attributions](ATTRIBUTIONS.md)

## File map

This is the canonical map of configuration surfaces. The linked policy and prompt files are executable instructions, not ordinary documentation.

| Path | Kind | Purpose |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | Executable policy | Always-loaded agent rules and workflow routing |
| [`APPEND_SYSTEM.md`](APPEND_SYSTEM.md) | Executable policy | Host, toolchain, and language overlay |
| [`settings.json`](settings.json) | Runtime config | Models, packages, UI, memory, and compaction |
| [`models.json`](models.json) | Runtime config | Custom model definitions |
| [`mcp.json`](mcp.json) | Runtime config | MCP server registry |
| [`permissions.json`](permissions.json) | Runtime config | Permission mode |
| [`keybindings.json`](keybindings.json) | Runtime config | Terminal keybindings |
| [`agents/`](agents/) | Executable prompts | Local subagent roles; same-name files override packaged builtins |
| [`skills/`](skills/) | Executable workflows | Instructions loaded on demand |
| [`extensions/`](extensions/) | Runtime code/config | Commands, UI helpers, todos, and guardrails |
| [`mcp-servers/`](mcp-servers/) | Runtime code | Local MCP implementations |
| [`themes/`](themes/) | Runtime config | TUI themes |
| [`USAGE.md`](USAGE.md) | Human guide | Quick start and common workflows |
| [`DESIGN.md`](DESIGN.md) | Rationale | Stable design decisions |
| [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) | Provenance | Copied, adapted, and influential sources |

## Runtime at a glance

- The main model and enabled packages are configured in [`settings.json`](settings.json).
- MCP servers are registered in [`mcp.json`](mcp.json); most load lazily.
- Local role prompts in [`agents/`](agents/) override packaged roles with the same name.
- Skills expose short descriptions and load their full instructions only when needed.
- Extensions under [`extensions/`](extensions/) are auto-discovered.
- Memory is supplied by `pi-memory-md`.
- Safety combines prompt policy with configured guardrails. `permissions.json` uses `yolo`, so prompt-required approvals are not universal runtime confirmation dialogs.

## MCP servers

| Server | Mode | Purpose |
| --- | --- | --- |
| `tree-sitter` | direct/keep-alive | Symbols, definitions, structural patterns, and codebase maps |
| `context7` | lazy | Library and framework documentation |
| `context-mode` | lazy | Large-output analysis and indexing |
| `descope` | lazy remote OAuth | Descope identity management |
| `notion` | lazy remote OAuth | Notion access |
| `google_docs` | lazy local OAuth | Google Docs and Drive-capable operations |
| `slack` | lazy local OAuth | Slack access through the patched local server |
| `retool` | lazy remote/direct tools | Retool apps, resources, and organization access |

OAuth environment and token files are ignored. External/private MCP access and mutations are governed by [`AGENTS.md`](AGENTS.md).

The patched Slack server supports reduced scopes. The intended setup uses `SLACK_MCP_CHANNEL_TYPES=public_channel`, `SLACK_MCP_ADD_MESSAGE_TOOL` with explicit channel IDs, and the scopes `chat:write`, `channels:read`, `channels:history`, `users:read`, and `search:read`.

## Setup

Prerequisites:

- Pi coding agent
- Node.js/npm
- `uv` and `uvx`
- `context7-mcp` on `PATH`
- `ast-grep` on `PATH`

```bash
cd ~/.config/pi
chmod +x setup.sh
./setup.sh
```

`setup.sh` links this repository to `~/.pi/agent`. If that path is already a symlink, the script repoints it to this checkout.

## Untracked runtime data

The repository excludes secrets, sessions, caches, logs, generated artifacts, and dependency installs. See [`.gitignore`](.gitignore) for the exact list. Important examples include:

- `.scratch/` and `sessions/`
- OAuth credentials and MCP onboarding state
- crash logs, run history, and caches
- `node_modules/` and Python bytecode/tool caches
- local favorites, compaction backups, and pisesh metadata
