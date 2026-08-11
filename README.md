# Pi Config v2

Personal configuration for the Pi coding agent.

- Maintaining the config: read [System Methodology](SYSTEM_METHODOLOGY.md), then use the file map below
- Source provenance: [Attributions](ATTRIBUTIONS.md)

## File map

This is the canonical map of configuration surfaces. The `Kind` column distinguishes executable instructions and runtime config from non-executable references.

| Path | Kind | Purpose |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | Executable policy | Always-loaded agent rules and workflow routing |
| [`APPEND_SYSTEM.md`](APPEND_SYSTEM.md) | Executable policy | Coding toolchain, core clipboard, and selected local CLI overlay |
| [`SYSTEM_METHODOLOGY.md`](SYSTEM_METHODOLOGY.md) | Design intent | Current general workflow, goals, and ownership model for config maintainers |
| [`settings.json`](settings.json) | Runtime config | Models, packages, UI, and compaction |
| [`hermes-memory-config.json`](hermes-memory-config.json) | Runtime config | Hermes automatic learning, recall, search, and storage behavior |
| [`models.json`](models.json) | Runtime config | Custom model definitions |
| [`mcp.json`](mcp.json) | Runtime config | MCP server registry |
| [`permissions.json`](permissions.json) | Inactive artifact | Not consumed by Pi 0.80.6 or the loaded extensions |
| [`keybindings.json`](keybindings.json) | Runtime config | Terminal keybindings |
| [`agents/`](agents/) | Executable prompts | Local subagent roles; same-name files override packaged builtins |
| [`skills/`](skills/) | Executable workflows | On-demand workflows and domain guidance |
| [`.agents/skills/`](.agents/skills/) | Project workflows | `agent-evaluation` and `skill-authoring` are project-scoped and narrowly allowlisted; they remain untracked until a later user-authorized Git action |
| [`extensions/`](extensions/) | Runtime code/config | Commands, UI helpers, todos, and guardrails |
| [`mcp-servers/`](mcp-servers/) | Runtime code | Local MCP implementations |
| [`themes/`](themes/) | Runtime config | TUI themes |
| [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) | Provenance | Copied, adapted, and influential sources |

## Runtime at a glance

- The main model and enabled packages are configured in [`settings.json`](settings.json).
- Hermes provides persistent memory and model-facing session search using [`hermes-memory-config.json`](hermes-memory-config.json).
- MCP servers are registered in [`mcp.json`](mcp.json); most load lazily.
- Local role prompts in [`agents/`](agents/) override packaged roles with the same name.
- Skills expose short descriptions and load their full instructions only when needed.
- Extensions under [`extensions/`](extensions/) are auto-discovered.
- Safety combines prompt policy with configured guardrails. `permissions.json` is
  retained as an inactive artifact and does not control Pi 0.80.6 permissions.

## Hermes memory

`pi-hermes-memory` is pinned at 0.9.4. It automatically reviews conversations, captures corrections, flushes eligible sessions before compaction and at shutdown, and consolidates full memory files. Recurring learning calls use `openai-codex/gpt-5.6-terra` with low thinking.

Memory uses policy-only retrieval: the model receives search guidance and fetches relevant entries on demand instead of injecting all learned content into every prompt. `AGENTS.md` remains the authority for mandatory rules, and Hermes standing instructions are disabled.

Hermes stores generated global memory and its transcript index under `pi-hermes-memory/`, project-scoped memory under `projects-memory/`, and its cross-session consolidation lock in `.pi-hermes-locks.sqlite`; these paths are ignored runtime state. Session indexing copies Pi transcript content into local SQLite search, and automatic learning sends eligible conversation and memory content to the configured model provider.

## MCP servers

| Server | Mode | Purpose |
| --- | --- | --- |
| `context7` | lazy | Library and framework documentation |
| `context-mode` | lazy | Large-output analysis and indexing |
| `sentry` | lazy remote OAuth | Sentry issue, trace, release, and project debugging |
| `descope` | lazy remote OAuth | Descope identity management |
| `notion` | lazy remote OAuth | Notion access |
| `google_docs` | lazy local OAuth | Google Docs and Drive-capable operations |
| `slack` | lazy remote OAuth | Slack access through Slack's official hosted MCP server |
| `retool` | lazy remote | Retool apps, resources, and organization access through the MCP proxy |
| `excalidraw-local` | lazy local | Excalidraw diagrams |
| `docent` | lazy local | Agent-run analysis and reports |

OAuth environment and token files are ignored. External/private MCP access and mutations are governed by [`AGENTS.md`](AGENTS.md).

The official Slack MCP entry requests every scope currently advertised by Slack's OAuth metadata: `search:read.public`, `search:read.private`, `search:read.mpim`, `search:read.im`, `search:read.files`, `search:read.users`, `chat:write`, `channels:history`, `groups:history`, `mpim:history`, `im:history`, `canvases:read`, `canvases:write`, `users:read`, `users:read.email`, `reactions:write`, `reactions:read`, `emoji:read`, `files:read`, `channels:write`, `groups:write`, `im:write`, `mpim:write`, `channels:read`, `groups:read`, and `mpim:read`. Tracked config contains the public Slack app client ID and fixed PKCE callback, but no client secret or token. Authentication remains incomplete until OAuth is completed.

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

The script repairs an ordinary non-recursive clone, synchronizes submodule URLs, installs the locked runtime dependencies for Pi Lens and `pi-subagents`, then runs each checked-in `profiles/*/setup.sh` hook. It never installs system tools, global npm packages, credentials, OAuth state, or optional integrations.

## Untracked runtime data

The repository excludes secrets, sessions, caches, logs, generated artifacts, and dependency installs. See [`.gitignore`](.gitignore) for the exact list. Important examples include:

- `.scratch/`, `sessions/`, `pi-hermes-memory/`, `projects-memory/`, and `.pi-hermes-locks.sqlite*`
- OAuth credentials and MCP onboarding state
- crash logs, run history, and caches
- `node_modules/` and Python bytecode/tool caches
- local favorites, compaction backups, and pisesh metadata
