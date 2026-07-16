# pi-tool-result-virtualizer

Keeps large tool results out of model context while preserving focused, bounded local retrieval.

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
- Assigns new captures to a keyed project scope derived from the canonical working directory without storing that raw path in provenance metadata.
- Replaces model-visible content with a compact receipt containing source metadata, a cropped preview, textual known-fact search guidance, and a typed decision card with executable retrieval actions.

A receipt is orientation, not evidence for hidden content. Retrieve cited lines before making claims about stored content.

## Retrieve a result

1. Call `tool_result_search` with a focused query and one `sourceId`, or up to 10 explicit `sourceIds`; use `lineStart` and `lineLimit` to restrict each source.
2. Call `tool_result_get` with the cited `lineStart` and `lineLimit`.
3. Optionally call `tool_result_outline` for deterministic triage when the result shape is unclear.
4. Continue with consecutive `tool_result_get` windows when one bounded response is insufficient.

Search results cite exact `[sourceId:startLine-endLine]` ranges. The receipt preview samples the first, middle, and last 10 lines, merges overlaps, and byte-caps each line.

### Scope and legacy captures

- Broad list, search, diagnostics, and retention previews default to the current project scope.
- Parent callers can set `includeGlobal: true` to include other project scopes.
- Captures created before scoped metadata remain readable in place as `legacy` records; they are not silently rewritten. Set `includeLegacy: true` to include them in broad discovery.
- Unscoped captures are excluded from every broad discovery mode. A known exact `sourceId` is a deliberate parent possession capability across project, unscoped, and legacy records; it does not broaden discovery. Subagents still require an exact run-bound grant, and unavailable sources are not disclosed.
- Capture completeness is explicit: `details.fullOutputPath` and `read.input.path` captures are exact for the captured file/range, while `event.content` may already reflect upstream truncation or omission.

## Tools

Retrieval, discovery, diagnostics, and retention-preview tools accept optional `reason` text, stored byte-capped for later session search and recovery.

| Tool | Use |
| --- | --- |
| `tool_result_outline` | Show deterministic samples, broad keyword hits, and omissions |
| `tool_result_get` | Read a bounded, byte-capped line window |
| `tool_result_search` | Search one or up to 10 explicit sources with optional line bounds and cited context windows |
| `tool_result_delegate` | Preflight or explicitly start one bounded, single-source analyst run |
| `tool_result_list` | List recent sources and compact metadata |
| `tool_result_diagnostics` | Show bounded, scope-filtered store and index health without source text or paths |
| `tool_result_retention_preview` | Preview count- or age-based cleanup without deleting data |

Receipt decision cards always include executable outline and exact-range actions. Receipt text separately directs known-fact lookup through `tool_result_search` with the model's actual fact or phrase. Cards include a `tool_result_delegate` dry-run action only when the packaged analyst and RPC capability are ready.

## Delegated analysis

The package ships `agents/result-analyst.md`, a fresh-context analyst with no inherited project context or skills. It can call only `tool_result_outline`, `tool_result_search`, and `tool_result_get`.

`tool_result_delegate` is parent-only and single-source:

1. The default `dryRun: true` checks the source, packaged analyst, RPC capabilities, and grant feasibility. It creates no grant and spawns no analyst.
2. Re-run with `dryRun: false` to explicitly authorize one asynchronous run. The result returns its run ID plus typed `subagent` status and interrupt actions.
3. Retrieval authority is committed only after spawn to the runner-generated run ID. It is bound to the exact analyst identity, source, operations, call/byte budget, and expiry. A `sourceId` alone is not authorization.

Each run is limited to 8 retrieval calls, 64 KiB of retrieved evidence, a 4-minute runtime, a 5-minute grant lifetime, and an 8 KiB/200-line final response. The analyst must return access/completion status, cited findings, uncertainty, and residual risks.

## Storage integrity and diagnostics

- Capture writes use a cross-process lock and transaction journal. Restart recovery removes only uncommitted transaction artifacts and preserves committed captures.
- Optional positive-integer quotas are configured with `PI_TOOL_RESULT_VIRTUALIZER_MAX_SOURCES` and `PI_TOOL_RESULT_VIRTUALIZER_MAX_STORED_BYTES`. Quotas are disabled when unset and are checked before admitting a write.
- `tool_result_diagnostics` returns a read-only, scope-filtered consistency summary covering visible metadata/content integrity, scope and FTS health, footprint/quota state, and recent sources. It never returns raw source content or store paths.
- `tool_result_retention_preview` reports candidates only. It does not delete captures.

## Telemetry

Telemetry is disabled by default. Set `PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY=1` to write owner-only JSONL events under the store's `telemetry/events.jsonl`.

Events contain allowlisted sizes, counts, decisions, operation/outcome names, and timings. They exclude source content, user-supplied queries and reasons, source IDs, grants, run IDs, RPC payloads, and filesystem paths. Telemetry failures never change tool behavior.

## Storage and safety

- For `bash`, `details.fullOutputPath` is preferred when available. For `read`, `event.input.path`, `offset`, and `limit` define the capture.
- Protected tools, context-mode results, and `details.toolResultVirtualizer` metadata bypass recursive capture. Raw `[tool-result-virtualizer]` text does not.
- Reads whose requested filename is exactly `SKILL.md` bypass virtualization. Normalized path spellings do not widen this filename rule through symlinks.
- `sourceId` must match `tr_[a-z0-9_]+` and stay at most 128 bytes.
- Invalid input returns a compact error without echoing raw input.
- If local storage fails for a large result, raw output is suppressed and a compact failure receipt is returned instead.

## Persistence and search

- Numeric truncation metadata is preserved while session-visible `fullOutputPath` and `details.truncation.content` are removed.
- Oversized original `details` JSON is stored in the sidecar. Session-visible details keep compact metadata, `ResultRef` state, citation rules, and directly executable retrieval actions; details-only entries use `storageKind: "details"`.
- Protected `tool_result_*` assistant arguments are compacted only in provider context. Persisted session JSONL and actual tool arguments remain unchanged.
- Optional built-in `node:sqlite` FTS5 trigram search accelerates broad queries. Source files and validated `index.jsonl` rows remain authoritative.
- Unsupported or inconsistent indexed searches fall back to a linear scan or rebuild the derived index.
- Search matches the full query while byte-capping echoed query metadata.

## Unsupported and deferred

- No destructive retention apply, pin/lease expiry, arbitrary export, network access, or external content movement.
- No structured JSON/JSONL/log/CSV query language, exact diff tool, cursors, rich list filters, regex, joins, map/reduce, or arbitrary code execution.
- No semantic search, OCR, archive processing, compression/content-addressed migration, or FTS redesign/recent-only indexing.
- No general-purpose subagent spawning: delegation is limited to the packaged analyst and requires explicit `dryRun: false` authorization.
- No non-text or image storage, SQLite server, Docker service, or native npm dependency.
- Does not replace Slipstream compaction or context-mode output handling, override built-in `bash` or `read`, rewrite persisted assistant tool-call arguments/session JSONL, or compact arguments outside `tool_result_*`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm run check
```

## License

MIT
