# @ff-labs/pi-fff

A [Pi](https://github.com/badlogic/pi-mono) extension that replaces the built-in `find` and `grep` tools with [FFF](https://github.com/dmtrKovalenko/fff.nvim), a Rust-native file finder with a prebuilt search index and persistent frecency data.

The extension registers exactly two tools:

| Tool | FFF operation | Behavior |
|---|---|---|
| `find` | `fileSearch` | Fuzzy path and glob search, frecency ranking, Git status annotations, pagination |
| `grep` | `grep` | Plain-text or regular-expression content search, smart case, context, pagination |

It does not register skills, prompts, themes, autocomplete providers, additional search tools, or slash commands.

## Behavior

- Files are indexed in the background when a session starts.
- Searches call the native FFF library directly without spawning `fd` or `rg`.
- Files created or modified while indexed contribute to persistent native frecency ranking, with a five-minute per-file cooldown.
- Ordinary searches and reads do not train that signal. The history database/API remains available, but this integration does not record queries or selections.
- Modified, staged, and untracked Git files receive result annotations.
- Lowercase searches are case-insensitive by default; uppercase characters make matching case-sensitive.
- Out-of-workspace absolute paths use bounded auxiliary finder instances.

## Local configuration

Requirements:

- Pi
- Node.js or Bun supported by the installed FFF native package

This replacement-only variant is loaded from the local package in this checkout. Configure Pi to load only its extension:

```json
{
  "packages": [
    {
      "source": "packages/pi-fff",
      "autoload": false,
      "extensions": ["+src/index.ts"],
      "skills": [],
      "prompts": [],
      "themes": []
    }
  ]
}
```

## Tools

### `find`

Fuzzy path and glob search. Matching uses the whole path relative to the active finder root.

Parameters:

- `pattern` — fuzzy path query
- `path` — optional directory, file, or glob constraint
- `exclude` — optional path or glob exclusions
- `limit` — maximum results per page; default `30`
- `cursor` — pagination cursor from a previous result

### `grep`

Search indexed file contents. Plain text is used by default; patterns containing valid regular-expression syntax use regex mode.

Parameters:

- `pattern` — content search pattern
- `path` — optional directory, file, or glob constraint
- `exclude` — optional path or glob exclusions
- `caseSensitive` — force case-sensitive matching; otherwise smart case is used
- `context` — context lines before and after each match, clamped to an integer from `0` to `20`
- `limit` — requested page size; default `20`, capped at `50`. A returned page can exceed that size to finish the current file. The separate per-file match cap remains `200` so cursor continuation can reach same-file overflow.
- `cursor` — pagination cursor from a previous result

## Startup configuration

Read `pi-fff.json` from `PI_CODING_AGENT_DIR` (or `~/.pi/agent` when unset). This global configuration accepts `$schema`, `frecencyDbPath`, `historyDbPath`, `enableFsRootScanning`, `enableHomeDirScanning`, `warnOnHomeDirScan` and `followSymlinks`. Unknown keys, invalid types and malformed JSON are reported as configuration errors.

This checkout configures:

```json
{
  "$schema": "./packages/pi-fff/pi-fff.schema.json",
  "frecencyDbPath": "/home/orestes/.config/pi/fff/frecency",
  "historyDbPath": "/home/orestes/.config/pi/fff/history",
  "followSymlinks": false
}
```

The explicit paths keep this installation separate from Neovim databases. Without overrides, the upstream resolver first reuses existing Neovim database directories, then falls back to `fff/frecency` and `fff/history` inside the Pi data directory. This checkout disables directory-symlink traversal explicitly; the upstream configuration fallback is `true`.

### Flags

- `--fff-frecency-db <path>` — frecency database path; also `FFF_FRECENCY_DB`
- `--fff-history-db <path>` — query-history database path; also `FFF_HISTORY_DB`
- `--fff-enable-root-scan` — allow indexing when launched from `/`; also `FFF_ENABLE_ROOT_SCAN=1`. Root scanning is disabled by default.
- `--fff-enable-home-scan` — index `$HOME` when launched from `$HOME`; also `FFF_ENABLE_HOME_SCAN`. Home scanning is enabled by default. Disable it with `--fff-enable-home-scan=false` or `FFF_ENABLE_HOME_SCAN=0` when the home tree is too large.
- `--fff-warn-home-scan` — show the home-scan warning; also `FFF_WARN_HOME_SCAN`. Enabled by default.
- `--fff-follow-symlinks` — traverse directory symlinks; also `FFF_FOLLOW_SYMLINKS`. The checkout's configuration sets this to `false`.

Precedence is CLI flags > environment variables > global configuration > defaults. Boolean environment values accept `1`, `true`, `0`, and `false`. Startup configuration is resolved when finder factories are first needed, after flags have been registered.

## Data

The configured databases are local LMDB directories under `/home/orestes/.config/pi/fff/`:

- `frecency` — hashed paths and decaying access timestamps from watched create/modify events; file contents are not stored
- `history` — standard query-history storage/API, with no query or selection producer in this wrapper

Main and auxiliary finders use the same configured databases. If database-backed creation fails, the factory tries once without databases. A successful fallback reports the error and disables database attempts for that factory instance. If both attempts fail, the original database error is preserved. There is no automatic database repair or deletion.

The checkout's `/fff/` Git ignore entry keeps runtime database artifacts out of version control and the normal Git-aware configuration-root index. Explicitly overridden database locations remain the caller's responsibility.

Project files are not uploaded by this extension.

## Security

- No shell execution
- No network calls in the extension code
- No telemetry
- No credential handling beyond Pi and the configured model provider
