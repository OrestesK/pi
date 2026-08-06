---
name: code-intelligence
description: Use for code ownership, structure, symbols, types, references, call relationships, structural patterns, and diagnostics
---

# Code Intelligence

Use semantic code tools when code structure, behavior, types, relationships, or diagnostics matter. Plain file and text tools remain correct for filenames, comments, logs, configuration text, and exact strings.

## Select evidence by question

When a situational Pi Lens tool is unavailable, call `pi_lens_activate_tools` with the needed tool names. Use the activated tools on the next model turn.

- **Ownership and shape:** `symbol_search`, then `module_report`; read exact bodies with `read_symbol` or `read_enclosing`
- **Types and relationships:** `lsp_navigation` for definitions, references, implementations, hover, symbols, rename previews, and call hierarchy
- **Structural patterns:** `ast_grep_search`; use `ast_grep_replace` for structural rewrites and dry-run before applying. Use `ast_grep_outline` for syntax-only structure and `ast_grep_dump` when the AST shape is unclear
- **Diagnostics:** `lsp_diagnostics` for focused language-server checks and `lens_diagnostics` for aggregate edited-file or project findings

Use every evidence group that answers a material question, but do not call groups mechanically. Gather the minimum evidence that can settle ownership, implementation, or correctness.

## Read before editing

Before changing an identifiable function, class, method, callback, or symbol, read its actual body with `read_symbol` or `read_enclosing`. For multi-file changes, inspect relevant structure first. Use plain `read` when semantic tools are unavailable or the target is not source code.

## Structural search

Use specific valid code patterns and scope them to relevant paths. If a search returns no match, simplify it once. Use `ast_grep_dump` when node kinds or nesting are unclear, then fall back to text search only when structure is not the right query.

Dry-run structural replacements before applying them.

## LSP use

Use each tool's registered `path` or `paths` field. Start from a real file in the project when workspace symbol or project resolution needs context. Query references from the definition when usage-site results can be partial.

Run targeted LSP diagnostics after each coherent code edit group and again after the final relevant edit. State the concrete reason when a required semantic or diagnostic surface is unavailable or does not apply.

## Trust the result boundary

Code-intelligence findings guide investigation and review. They do not authorize edits outside the approved behavior. Validate diagnostics and reviewer findings against the real producer, reachable state, scope, and contract before changing code.
