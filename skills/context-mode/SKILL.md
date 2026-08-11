---
name: context-mode
description: Process large command, test, log, API, document, data, browser, or MCP output
---

# Context Mode

Use Context Mode when an operation can return more than about 20 lines. Also use it when you must process the full input but need only a compact result in the conversation.

Good targets include:

- builds, tests, logs, dependency reports, and broad Git output;
- large JSON, API responses, datasets, and documents;
- browser snapshots, console messages, and network requests;
- broad MCP results that need filtering, comparison, or synthesis.

Keep normal Pi tools for small file reads, narrow searches, source navigation, and short command output.

## Choose the path

Use the `context-mode` MCP server through the `mcp` gateway.

- Use `context_mode_ctx_execute` when a command, fetch, or script can process the data directly in the sandbox.
- Use `context_mode_ctx_execute_file` when the data already exists in a file.
- Use `context_mode_ctx_index` with a file path when the source needs repeated search, then use `context_mode_ctx_search` for focused retrieval.
- Use the `ctx-doctor` skill only for Context Mode setup or runtime diagnostics.

Print only the result needed for the current decision. Do not truncate the input before analysis merely to reduce output.

## File-first flow

When a browser or another tool can save large output directly, save it under `.scratch/`. Pass that path to `context_mode_ctx_execute_file` or `context_mode_ctx_index`. Do not first return the large result to the model and then send the same content again through an inline `content` argument.

Use the same file-first flow for large console output, network requests, generated reports, and local data. An explicit no-file or no-artifact instruction overrides `.scratch/` permission.

## Boundaries

Context Mode changes only how output is processed. It does not change authorization. All existing rules for read-only work, mutations, external effects, credentials, and protected actions still apply.
