# pi-tool-result-virtualizer

Local Pi extension that stores large tool-result text in a mode-restricted sidecar and replaces model-visible tool results with compact retrieval receipts.

## Behavior

- Intercepts `tool_result` events.
- Stores large text results under `${PI_TOOL_RESULT_VIRTUALIZER_DIR:-~/.pi/tool-result-virtualizer}`. This avoids tracked config repos when `~/.pi/agent` is symlinked to a checkout.
- For `bash`, prefers `details.fullOutputPath` when present so retrieval can use the full raw output instead of Pi's truncated `content`.
- For `read`, snapshots `event.input.path` and applies `offset`/`limit` when present.
- Replaces `content` with a decision-first receipt containing source id, capture status, size, line count, hash prefix, a cropped head/middle/tail preview, and an explicit choice between recommended summary and exact full export.
- Treats text as large at 50,000 bytes or 200 lines. The byte threshold follows large-result offloading prior art that uses tens-of-thousands-of-characters or ~1,500–2,500-token boundaries instead of the earlier 8 KiB value; the line threshold still catches pathological many-line outputs.
- Skips recursive handling by protected tool name, context-mode direct/MCP-wrapper tool identity, and `details.toolResultVirtualizer` metadata, not by raw receipt-marker text, so ordinary output containing `[tool-result-virtualizer]` is still captured.
- Lets `read` results for root or one-level nested `SKILL.md` files under Pi skill roots pass through instead of becoming retrieval receipts, mirroring Pi core's skill-loading convention so skill instructions load in full rather than through a sidecar source id.
- Validates protected-tool `sourceId` parameters as `tr_[a-z0-9_]+` under 128 bytes, and export `filePath` parameters as relative managed-export paths under 1024 bytes without absolute paths, parent traversal, or NUL bytes. Invalid values fail with compact errors instead of echoing raw input.
- On local store/write failure for a large result, suppresses the raw output and returns a compact failure receipt instead of failing open into the model context.
- Removes `details.truncation.content` while preserving numeric truncation metadata and `fullOutputPath`.
- Stores oversized original `details` JSON in the local sidecar and keeps only compact scalar/session metadata plus hashes in session-visible details; oversized scalar strings become metadata placeholders instead of raw prefixes. Details-only compaction is marked as `storageKind: "details"` so list/diagnostics output does not present it as ordinary virtualized content.
- Compacts oversized string arguments for protected `tool_result_*` assistant tool calls only in the provider-context copy; persisted session JSONL and actual tool execution arguments remain unchanged.
- Uses an optional derived SQLite FTS5 trigram sidecar (`search-index.sqlite`) to accelerate broad `tool_result_search` candidate selection when `node:sqlite` and trigram FTS are available. Source text files and validated `index.jsonl` rows remain authoritative; exact line/context matches still come from source files; sourceId-restricted, short, non-ASCII, oversized, SQLite-failing, or SQLite-consistency-failing searches fall back to the linear file scan or rebuild the derived index.
- Registers bounded retrieval/export tools; each accepts optional `reason` text for future session search/recovery, stored byte-capped in compact details. Search also byte-caps echoed query metadata in details while still using the full query for matching:
  - `tool_result_outline`: return a bounded deterministic triage outline with head/tail samples, broad keyword hits, and explicit omissions; use search/get/export for evidence.
  - `tool_result_summary_contract`: return an honest ready-to-call `subagent` task contract for a focused summary. This tool does not spawn a subagent; it exists because this extension does not have a clean stable internal tool-to-tool/subagent invocation API. The contract requires source id, retrieval commands or cited line ranges, concise findings, omitted/uncertain areas, and whether exact full retrieval is still needed.
  - `tool_result_get`: return a bounded, byte-capped line window; use `tool_result_export` for exact oversized ranges.
  - `tool_result_search`: search stored sources with non-blank queries, newest-first broad ordering, byte-capped match-centered cited line ranges, and sourceId/linear-scan guidance for broad no-match searches.
  - `tool_result_list`: list recent stored sources and metadata, including `storageKind`, with byte-capped visible output.
  - `tool_result_diagnostics`: report byte-capped store health totals, index corruption counters, and recent source metadata without raw source text.
  - `tool_result_retention_preview`: non-destructively preview retention cleanup candidates by count/age selectors; byte-caps visible output and defaults to showing at most 20 candidate and kept source ids while preserving full counts and omitted counts.
  - `tool_result_export_details`: write exact stored original details JSON to a local file while returning only compact metadata. Exports fail by default if `filePath` already exists; pass `overwrite: true` to replace it.
  - `tool_result_export`: write a full stored source or line range under the managed export directory while returning only compact metadata. With no `lineStart`/`lineLimit`, this writes the exact stored content. For `details.fullOutputPath` captures that is the captured full output; for `read.input.path` captures that is the selected read range; for `event.content` captures it may already reflect upstream truncation or omission. Exports fail by default if `filePath` already exists; pass `overwrite: true` to replace it.

## Architecture

- `src/index.ts`: Pi extension entrypoint; constructs the store, registers tool definitions in order, and wires lifecycle hooks.
- `src/extension-types.ts`: narrow Pi API/tool-definition type surface used by this extension.
- `src/config.ts`: store-root resolution.
- `src/schemas.ts`: protected-tool parameter schemas.
- `src/params.ts`: runtime parameter parsing, validation, and compact reason/query details metadata.
- `src/tools.ts`: definitions and handlers for the nine `tool_result_*` tools.
- `src/context.ts`: provider-context-only compaction for oversized protected `tool_result_*` assistant tool-call arguments.
- `src/virtualize.ts`: capture selection, compact receipt generation, protected-tool skip policy, and session-visible details compaction.
- `src/store.ts`: local sidecar storage, exact source/details retrieval, search, diagnostics metadata, retention preview, managed export path resolution, and export.
- `src/search-index.ts`: optional derived `node:sqlite` FTS5 trigram candidate index for broad search acceleration with linear fallback.
- `src/formatting.ts`: byte-safe protected-tool output capping and reusable retrieval/search/diagnostics/retention formatting.
- `src/outline.ts`: deterministic outline triage and shared cropped-preview sampling over stored source text.

## Receipt workflow

A virtualized receipt is intentionally not evidence for hidden content. It gives only deterministic orientation metadata and a cropped preview:

1. **Recommended summary path:** call `tool_result_summary_contract` with the source id and a focused prompt, then run the returned `subagent` task. The summary contract tells the child to use `tool_result_outline`, `tool_result_search`, and bounded `tool_result_get` windows, and to cite inspected line ranges or retrieval commands.
2. **Exact stored-content escape hatch:** call `tool_result_export` with the source id and no line options. This writes the exact stored content under the managed export directory and returns only metadata. For `details.fullOutputPath` captures that is the captured full output; for `read.input.path` captures that is the selected read range; for `event.content` captures it may already reflect upstream truncation or omission. Use it when exact stored text is required; do not paste the full export back into parent context unless unavoidable.
3. **Bounded manual triage:** use `tool_result_outline`, `tool_result_search`, and `tool_result_get` for targeted evidence. These outputs are protected by byte caps and must not be described as full recovery when capped.

The cropped preview defaults to first 10 lines, middle 10 lines, and last 10 lines, merging overlaps for small sources and byte-capping each preview line. It is for orientation only.

## Non-goals

- Does not claim universal public novelty.
- Does not replace Slipstream compaction.
- Does not override built-in `bash` or `read` tools.
- Does not store non-text/image results.
- Does not delete stored sidecar data; retention is preview-only until an exact cleanup scope is approved.
- Does not internally spawn subagents from `tool_result_summary_contract`; it returns an explicit contract plus structured `details.recommendedSubagentTask` until Pi exposes a clean stable invocation API for that integration.
- Does not require a SQLite server, Docker service, or native npm dependency; FTS acceleration uses probed built-in `node:sqlite` only when available and falls back to the file scan.
- Does not rewrite persisted assistant tool-call arguments or session JSONL; a tested `message_end` rewrite path is rejected because it changes the actual input delivered to the tool.
- Does not compact non-`tool_result_*` tool-call arguments.
- Does not replace context-mode `ctx_*` outputs; context-mode remains a separate sandbox/FTS/session-continuity system and its own tool output is treated as user-visible coordination UX.

## Verification

```bash
(cd packages/pi-tool-result-virtualizer && pnpm run check)
```
