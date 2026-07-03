---
name: memory-search
description: Search and retrieve information from pi-memory-md memory files. Use when you need to search memory.
---

# Memory Search

Search memory files with **multi-mode** search capability.

## Search Modes

### 1. Parsed Metadata (Built-in)
Automatically searches parsed JSON/YAML frontmatter plus file paths and headings based on query. Query terms are tokenized, so multi-word searches can match hyphenated tags or filenames:

```
memory_search(query="typescript")
```

### 2. Custom Grep Pattern (grep)
For complex content search with standard grep:

```
memory_search({
  query: "project",
  grep: "typescript|javascript"
})
```

### 3. Custom Ripgrep Pattern (rg)
For smarter search with ripgrep (smart case, better regex):

```
memory_search({
  query: "project",
  rg: "typescript|javascript"
})
```

## Tool Selection

| Parameter | Tool | Best For |
|-----------|------|----------|
| `grep` | GNU grep | Portable, universal |
| `rg` | ripgrep | Smart case, faster, better regex |

## Examples

### Find files by tag
```
memory_search(query="user")
```

### Grep: OR patterns
```
memory_search({
  query: "project",
  grep: "architecture|component|module"
})
```

### Ripgrep: Smart case
```
memory_search({
  query: "typescript",
  rg: "typescript|javascript"
})
```

### Grep: Word boundary
```
memory_search({
  query: "api",
  grep: "\\bAPI\\b"
})
```

### Both: Compare results
```
memory_search({
  query: "project",
  grep: "pattern1",
  rg: "pattern2"
})
```

## Search Priority

1. **Parsed metadata** - Path, description, tags, and markdown headings from JSON or YAML frontmatter
2. **Custom grep** - Optional grep pattern
3. **Custom rg** - Optional ripgrep pattern

## Empty Search Fallback Before Writing

Before creating or overwriting a memory, an empty `memory_search(query=...)` is not enough evidence that no related memory exists. Retry with at least one broader surface:

- `memory_search(rg="keyword1|keyword2")` for body/path terms; or
- `memory_list(directory="core/project")` or a narrower directory when the likely location is known.

Only write a new memory after that fallback still fails to reveal a focused existing file to update.

## Related Skills

- `memory-management` - Read and write files
- `memory-sync` - Git synchronization
- `memory-init` - Initial repository setup
- `tape-mode` - Conversation history search
