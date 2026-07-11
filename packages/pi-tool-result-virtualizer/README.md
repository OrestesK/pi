# pi-tool-result-virtualizer

Keeps large tool results out of model context while preserving exact local retrieval.

## Install

> Pi packages run with full local permissions. Review the source before installing.

From this package directory:

```sh
pi install "$PWD"
```

## Quick start

1. Run `/reload` in an existing Pi session, or start a new session.
2. Ask Pi to run `node -e "for (let i = 1; i <= 250; i++) console.log(i)"` with the `bash` tool.
3. Confirm that the result is replaced by a receipt with a `tr_...` source id.
4. Ask Pi to call `tool_result_search` for `200` with that source id.

## How it works

- Intercepts text from `tool_result` events.
- Virtualizes results at 50,000 bytes or 200 lines.
- Stores captured text under `${PI_TOOL_RESULT_VIRTUALIZER_DIR:-~/.pi/tool-result-virtualizer}`.
- Replaces model-visible content with a compact receipt containing source metadata, a cropped preview, and retrieval commands.

A receipt is orientation, not evidence for hidden content.

## Retrieve a result

1. Call `tool_result_search` with a focused query and the receipt's source id.
2. Call `tool_result_get` with the cited `lineStart` and `lineLimit`.
3. Optionally call `tool_result_outline` for deterministic triage.
4. Optionally call `tool_result_summary_contract`, then run its returned `subagent` task.
5. Call `tool_result_export` with no line options only when exact stored text is required.

The receipt preview samples the first, middle, and last 10 lines, merges overlaps, and byte-caps each line.

## Tools

Each tool accepts optional `reason` text, stored byte-capped for later session search and recovery.

| Tool | Use |
| --- | --- |
| `tool_result_outline` | Show deterministic samples, broad keyword hits, and omissions |
| `tool_result_summary_contract` | Return a focused, ready-to-call `subagent` task without spawning it |
| `tool_result_get` | Read a bounded, byte-capped line window |
| `tool_result_search` | Search stored sources and return cited match ranges |
| `tool_result_list` | List recent sources and compact metadata |
| `tool_result_diagnostics` | Show store and index health without source text |
| `tool_result_retention_preview` | Preview count- or age-based cleanup without deleting data |
| `tool_result_export_details` | Export exact stored original-details JSON |
| `tool_result_export` | Export a full source or exact line range |

Exports stay inside the managed export directory and refuse to overwrite an existing path unless `overwrite: true` is set.

## Storage and safety

- For `bash`, `details.fullOutputPath` is preferred when available. For `read`, `event.input.path`, `offset`, and `limit` define the capture.
- Protected tools, context-mode results, and `details.toolResultVirtualizer` metadata bypass recursive capture. Raw `[tool-result-virtualizer]` text does not.
- Reads whose requested filename is exactly `SKILL.md` bypass virtualization. Normalized path spellings do not widen this filename rule through symlinks.
- `sourceId` must match `tr_[a-z0-9_]+` and stay under 128 bytes.
- Export paths must be relative managed paths under 1,024 bytes with no absolute path, parent traversal, or NUL byte.
- Invalid input returns a compact error without echoing raw input.
- If local storage fails for a large result, raw output is suppressed and a compact failure receipt is returned instead.

A full export reflects the stored capture. `details.fullOutputPath` can provide full raw command output; `read.input.path` provides the selected range; `event.content` may already contain upstream truncation or omission.

## Persistence and search

- Numeric truncation metadata and `fullOutputPath` are preserved while `details.truncation.content` is removed.
- Oversized original `details` JSON is stored in the sidecar. Session-visible details keep compact metadata and hashes; details-only entries use `storageKind: "details"`.
- Protected `tool_result_*` assistant arguments are compacted only in provider context. Persisted session JSONL and actual tool arguments remain unchanged.
- Optional built-in `node:sqlite` FTS5 trigram search accelerates broad queries. Source files and validated `index.jsonl` rows remain authoritative.
- Unsupported or inconsistent indexed searches fall back to a linear scan or rebuild the derived index.
- Search matches the full query while byte-capping echoed query metadata.

## Non-goals

- Does not replace Slipstream compaction or context-mode output handling.
- Does not override built-in `bash` or `read` tools.
- Does not store non-text or image results.
- Does not delete sidecar data; retention is preview-only.
- Does not spawn subagents.
- Does not require a SQLite server, Docker service, or native npm dependency.
- Does not rewrite persisted assistant tool-call arguments or session JSONL.
- Does not compact arguments for tools outside `tool_result_*`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## License

MIT
