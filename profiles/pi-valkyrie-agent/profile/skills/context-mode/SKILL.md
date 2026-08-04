---
name: context-mode
description: Use Context Mode for large command, test, log, document, data, browser, or MCP output that would otherwise flood model context. Keep small reads and ordinary code discovery in normal Pi tools.
---

# Context Mode

Use the local Context Mode MCP when output may exceed 20 lines, requires filtering or aggregation, or should remain outside model context.

## Use normal tools for

- Exact small file reads before editing
- Exact edits and writes
- Symbol/module, AST, and LSP code intelligence
- Small bounded searches and commands

## Use Context Mode for

- Large test, build, log, Git, dependency, or data output
- Large-file analysis where only a summary or selected facts are needed
- Repeated searches over one indexed local source
- Processing a large result from another tool after saving it to a task-local file

The benchmark excludes `ctx_fetch_and_index`. Do not ask Context Mode to fetch URLs. Use repository-pinned source or the anonymous Context7 MCP for external library documentation when available.

## Tool choice

- `ctx_execute`: run a command or analysis program and print only decision-relevant output
- `ctx_execute_file`: process a local file through `FILE_CONTENT` without loading the file into model context
- `ctx_index` and `ctx_search`: use only when repeated searches over one local source materially help
- Small bounded shell commands remain appropriate when their output is predictable

Write analysis code instead of dumping raw data. Always print the exact finding, error, count, path, or decision needed by the caller.

## Safety

Context Mode is not a safety bypass. The task contract still controls filesystem mutation, Git, credentials, network access, destructive operations, and external effects. Do not index secrets or unrelated host data.
