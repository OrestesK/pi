# Pi Config v2

Personal configuration for the Pi coding agent.

- Maintaining the config: read [System Methodology](SYSTEM_METHODOLOGY.md), then use the file map below
- Source provenance: [Attributions](ATTRIBUTIONS.md)

## File map

This is an orientation map of configuration surfaces. The linked files and effective resource discovery are authoritative. The `Kind` column distinguishes executable instructions and runtime config from non-executable references.

| Path | Kind | Purpose |
| --- | --- | --- |
| [`AGENTS.md`](AGENTS.md) | Executable policy | Always-loaded agent rules and workflow routing |
| [`APPEND_SYSTEM.md`](APPEND_SYSTEM.md) | Executable policy | Coding toolchain, core clipboard, and selected local CLI overlay |
| [`SYSTEM_METHODOLOGY.md`](SYSTEM_METHODOLOGY.md) | Design intent | Current general workflow, goals, and ownership model for config maintainers |
| [`settings.json`](settings.json) | Runtime config | Models, packages, UI, and compaction |
| [`models.json`](models.json) | Runtime config | Custom model definitions |
| [`mcp.json`](mcp.json) | Runtime config | MCP server registry |
| [`keybindings.json`](keybindings.json) | Runtime config | Terminal keybindings |
| [`agents/`](agents/) | Executable prompts | Local subagent roles. Same-name files override packaged builtins |
| [`skills/`](skills/) | Executable workflows | On-demand workflows and domain guidance |
| [`.agents/skills/`](.agents/skills/) | Project workflows | Project-local workflows. These remain ignored |
| [`extensions/`](extensions/) | Runtime code/config | Commands, UI helpers, and guardrails |
| [`themes/`](themes/) | Runtime config | TUI themes |
| [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) | Provenance | Copied, adapted, and influential sources |

## Runtime at a glance

- The main model and enabled packages are configured in [`settings.json`](settings.json).
- `pi-memory-md` provides explicit local Markdown memory and Tape, while `pi-session-search` provides model-facing session search.
- MCP servers are registered in [`mcp.json`](mcp.json) and load lazily.
- Local role prompts in [`agents/`](agents/) override packaged roles with the same name.
- Skills expose short descriptions and load their full instructions only when needed.
- Extensions under [`extensions/`](extensions/) are auto-discovered.
- Safety combines prompt policy with configured guardrails. Pi has no built-in sandbox.

## Memory and session search

`pi-memory-md` stores local Markdown memory under `~/.pi/memory/` and provides Tape. The local `durable-memory` skill owns curation, and `AGENTS.md` requires explicit approval for each memory write or synchronization. Automatic synchronization hooks are disabled.

`pi-session-search` provides model-facing session search. Memory and historical sessions are discovery evidence. Current user instructions and current source remain authoritative.

## MCP servers

| Server | Mode | Purpose |
| --- | --- | --- |
| `context-mode` | lazy local | Large-output analysis and indexing |
| `context7` | lazy remote | Library and framework documentation |
| `descope` | lazy remote | Descope identity management |
| `docent` | lazy local | Agent-run analysis and reports |
| `excalidraw-local` | lazy local | Excalidraw diagrams |
| `figma` | lazy remote | Figma design access |
| `google_docs` | lazy local | Google Docs and Drive-capable operations |
| `notion` | lazy remote | Notion access |
| `retool` | lazy remote | Retool apps, resources, and organization access |
| `sentry` | lazy remote | Sentry issue, trace, release, and project debugging |
| `slack` | lazy remote | Slack search and collaboration |

[`mcp.json`](mcp.json) is authoritative for endpoints, transports, lifecycle, and authentication settings. Credential and onboarding files are ignored. External/private MCP access and mutations are governed by [`AGENTS.md`](AGENTS.md).

## Setup

Required:

- Git and Bash
- Pi coding agent
- Node.js 22.19 or later with npm
- `ast-grep` on `PATH`

Optional integrations use additional commands:

- `pnpm` for local Node-based MCP servers
- `uv` for Docent
- `chafa` and a SIXEL-capable terminal for image previews
- `wl-paste` for Wayland clipboard images

Clone the repository and point Pi at it with the supported config-directory environment variable:

```bash
git clone --recurse-submodules https://github.com/OrestesK/pi.git ~/.config/pi
export PI_CODING_AGENT_DIR="$HOME/.config/pi"
~/.config/pi/setup.sh
```

Persist `PI_CODING_AGENT_DIR` in your shell startup file before opening Pi. Run `setup.sh` from a normal terminal outside Pi, then restart Pi because dependency installation replaces local package trees that an active process may have loaded. The script requires the variable to resolve to its own checkout and does not create or modify `~/.pi/agent`.

The script repairs an ordinary non-recursive clone, synchronizes submodule URLs, installs each locked package root listed in `setup.sh`, builds Pi Lens, and runs any `profiles/*/setup.sh` hooks. It never installs system tools, global npm packages, credentials, OAuth state, or optional integrations.

## Untracked runtime data

The repository excludes secrets, sessions, caches, logs, generated artifacts, and dependency installs. See [`.gitignore`](.gitignore) for the exact list. Important examples include:

- `.scratch/` and `sessions/`
- OAuth credentials and MCP onboarding state
- crash logs, run history, and caches
- `node_modules/` and Python bytecode/tool caches
- local favorites, compaction backups, and pisesh metadata
