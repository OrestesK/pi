---
name: code-intelligence
description: Use when you need to find code ownership, structure, symbols, types, references, call relationships, structural patterns, or diagnostics
---

# Code Intelligence

Use semantic tools to understand code structure, behavior, types, relationships, and diagnostics. Use plain file and text tools for filenames, comments, logs, configuration text, and exact strings

## Select evidence by question

If a Pi Lens tool you need is unavailable, call `pi_lens_activate_tools` with its name. Use the activated tool on the next model turn

- **Ownership and shape:** `symbol_search`, then `module_report`; read exact bodies with `read_symbol` or `read_enclosing`
- **Types and relationships:** `lsp_navigation` for definitions, references, implementations, hover, symbols, rename previews, and call hierarchy
- **Structural patterns:** Use `ast_grep_search`. For a structural rewrite, use `ast_grep_replace` and dry-run it before applying changes. Use `ast_grep_outline` for syntax-only structure and `ast_grep_dump` when the AST shape is unclear
- **Diagnostics:** `lsp_diagnostics` for focused language-server checks and `lens_diagnostics` for aggregate edited-file or project findings

Use every evidence group that can answer a material question. Do not call a group only because it is listed. Stop when you have enough evidence to settle ownership, implementation, or correctness

## Read before editing

Before changing an identifiable function, class, method, callback, or symbol, read its actual body with `read_symbol` or `read_enclosing`. For multi-file changes, inspect relevant structure first. Use plain `read` when semantic tools are unavailable or the target is not source code.

## Structural search

Use specific valid code patterns and limit them to the relevant paths. If a search finds no match, simplify it once. Use `ast_grep_dump` when node kinds or nesting are unclear. Fall back to text search only when code structure cannot answer the question

## LSP use

Pass paths through each tool's registered `path` or `paths` parameter. When workspace symbol lookup or project resolution needs context, start from a real project file. If usage-site results can be partial, query references from the definition

Run targeted LSP diagnostics after each coherent code-edit group and once more after the final relevant edit. If a needed semantic or diagnostic check is unavailable or does not apply, state exactly why

## Treat findings as evidence, not approval

Code-intelligence findings guide investigation and review. They do not authorize edits outside approved behavior. Before changing code, validate each diagnostic or reviewer finding against the actual producer, the states the program can reach, the approved scope, and the contract
