# Pi Config v2

Personal configuration for the Pi coding agent.

- Maintaining the config: start with the file map below
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
| [`permissions.json`](permissions.json) | Inactive artifact | Not consumed by Pi 0.80.6 or the loaded extensions |
| [`keybindings.json`](keybindings.json) | Runtime config | Terminal keybindings |
| [`agents/`](agents/) | Executable prompts | Local subagent roles; same-name files override packaged builtins |
| [`skills/`](skills/) | Executable workflows | Instructions loaded on demand |
| [`extensions/`](extensions/) | Runtime code/config | Commands, UI helpers, todos, and guardrails |
| [`mcp-servers/`](mcp-servers/) | Runtime code | Local MCP implementations |
| [`themes/`](themes/) | Runtime config | TUI themes |
| [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) | Provenance | Copied, adapted, and influential sources |

## Runtime at a glance

- The main model and enabled packages are configured in [`settings.json`](settings.json).
- MCP servers are registered in [`mcp.json`](mcp.json); most load lazily.
- Local role prompts in [`agents/`](agents/) override packaged roles with the same name.
- Skills expose short descriptions and load their full instructions only when needed.
- Extensions under [`extensions/`](extensions/) are auto-discovered.
- Memory is supplied by `pi-memory-md`.
- Safety combines prompt policy with configured guardrails. `permissions.json` is
  retained as an inactive artifact and does not control Pi 0.80.6 permissions.

## MCP servers

| Server | Mode | Purpose |
| --- | --- | --- |
| `context7` | lazy | Library and framework documentation |
| `context-mode` | lazy | Large-output analysis and indexing |
| `descope` | lazy remote OAuth | Descope identity management |
| `notion` | lazy remote OAuth | Notion access |
| `google_docs` | lazy local OAuth | Google Docs and Drive-capable operations |
| `slack` | lazy local OAuth | Slack access through the patched local server |
| `retool` | lazy remote | Retool apps, resources, and organization access through the MCP proxy |
| `excalidraw-local` | lazy local | Excalidraw diagrams |
| `docent` | lazy local | Agent-run analysis and reports |

OAuth environment and token files are ignored. External/private MCP access and mutations are governed by [`AGENTS.md`](AGENTS.md).

The patched Slack server supports reduced scopes. The intended setup uses `SLACK_MCP_CHANNEL_TYPES=public_channel`, `SLACK_MCP_ADD_MESSAGE_TOOL` with explicit channel IDs, and the scopes `chat:write`, `channels:read`, `channels:history`, `users:read`, and `search:read`.

## Setup

Required:

- Git and Bash
- Pi coding agent (tested with 0.80.6)
- Node.js 22.19 or later with npm
- `ast-grep` on `PATH`

Optional integrations use additional commands:

- `pnpm` for the local Excalidraw MCP server
- `uv` for Docent
- `chafa` and a SIXEL-capable terminal for image previews
- `wl-paste` for Wayland clipboard images

Clone the repository and point Pi at it with the supported config-directory environment variable:

```bash
git clone --recurse-submodules https://github.com/OrestesK/pi.git ~/.config/pi
export PI_CODING_AGENT_DIR="$HOME/.config/pi"
~/.config/pi/setup.sh
```

Persist `PI_CODING_AGENT_DIR` in your shell startup file before opening Pi. Run `setup.sh` from a normal terminal outside Pi, then restart Pi; dependency installation replaces local package trees that an active process may have loaded. The script requires the variable to resolve to its own checkout and does not create or modify `~/.pi/agent`.

The script repairs an ordinary non-recursive clone, synchronizes submodule URLs, installs the locked runtime dependencies for Pi Lens, `pi-memory-md`, `pi-openai-service-tier`, and `pi-subagents`, then runs each checked-in `profiles/*/setup.sh` hook. It never installs system tools, global npm packages, credentials, OAuth state, or optional integrations.

## Untracked runtime data

The repository excludes secrets, sessions, caches, logs, generated artifacts, and dependency installs. See [`.gitignore`](.gitignore) for the exact list. Important examples include:

- `.scratch/` and `sessions/`
- OAuth credentials and MCP onboarding state
- crash logs, run history, and caches
- `node_modules/` and Python bytecode/tool caches
- local favorites, compaction backups, and pisesh metadata
