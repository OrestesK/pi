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
- Frequently accessed files rank higher across sessions when the frecency database is enabled.
- Query history associates searches with selected files.
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
- `context` — context lines before and after each match
- `limit` — maximum matches; default `20`
- `cursor` — pagination cursor from a previous result

## Flags

- `--fff-frecency-db <path>` — frecency database path; also `FFF_FRECENCY_DB`
- `--fff-history-db <path>` — query-history database path; also `FFF_HISTORY_DB`
- `--fff-enable-root-scan` — allow indexing when launched from `/`; also `FFF_ENABLE_ROOT_SCAN=1`. Root scanning is disabled by default.
- `--fff-enable-home-scan` — index `$HOME` when launched from `$HOME`; also `FFF_ENABLE_HOME_SCAN`. Home scanning is enabled by default. Disable it with `--fff-enable-home-scan=false` or `FFF_ENABLE_HOME_SCAN=0` when the home tree is too large.

CLI flags take precedence over matching environment variables. Boolean environment values accept `1`, `true`, `0`, and `false`.

## Data

FFF stores search state locally under `~/.pi/agent/fff/` by default:

- frecency database — file access frequency and recency
- history database — query-to-file selection history

Project files are not uploaded by this extension.

## Security

- No shell execution
- No network calls in the extension code
- No telemetry
- No credential handling beyond Pi and the configured model provider
