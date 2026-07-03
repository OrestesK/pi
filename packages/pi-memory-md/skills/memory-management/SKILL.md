---
name: memory-management
description: Core memory operations guide for pi-memory-md - create, read, update, and delete memory files. Use when managing pi-memory-md memory files.
---

## Design Philosophy

- **File-based memory**: Each memory is a `.md` file with YAML frontmatter
- **Local-first**: Read, write, list, and search local markdown memory without git
- **Optional Git sync**: Configure `repoUrl` only when pull/push sync is needed
- **Auto-delivery**: In base non-tape delivery, non-superseded markdown files under the project memory root and configured shared-global memory are indexed for delivery; `core/` is the canonical high-priority organization area, not the only delivered scope
- **Minimal fixed core**: `memory-init` now only guarantees `core/project/`
- **Organized by purpose**: Fixed structure for core info, flexible for everything else

## Directory Structure

**Base path**: Prefer `settings["pi-memory-md"].memoryDir.localPath` (default: `~/.pi/memory-md`). Legacy top-level `settings["pi-memory-md"].localPath` is still supported.

```
{localPath}/
├── {globalMemory}/                # Optional shared memory root when globalMemory is enabled
│   └── core/
│       ├── USER.md                # Optional shared user profile and preferences
│       ├── MEMORY.md              # Optional shared durable notes, conventions, and lessons learned
│       └── TASK.md                # Optional shared task template
└── {project-name}/                # Project memory root
    ├── core/                      # Canonical high-priority memory organization
    │   ├── USER.md                # Optional project user profile and preferences
    │   ├── MEMORY.md              # Optional project durable notes, conventions, and lessons learned
    │   ├── TASK.md                # Optional project task template
    │   └── project/               # Project-specific memory folder (pre-created)
    ├── docs/                      # Agent-created reference documentation
    ├── archive/                   # Agent-created historical information
    ├── research/                  # Agent-created research findings
    └── notes/                     # Agent-created standalone notes
```

**Important:** `core/project/` is a pre-defined folder under `core/`. Do NOT create another `project/` folder at the project root level.

## Core Design: Fixed vs Flexible

### Fixed by `memory-init`

These are the only directories `memory-init` guarantees for a project:

- `core/project/`

If `globalMemory` is enabled, it also ensures:

- `{globalMemory}/core/`

### Common optional files

These files are common, but created only if the user chooses templates or imports preferences:

- `core/USER.md`
- `core/TASK.md`
- `{globalMemory}/core/USER.md`
- `{globalMemory}/core/MEMORY.md`
- `{globalMemory}/core/TASK.md`

Project `core/MEMORY.md` is not created by `memory-init`; create it later only when the project needs a durable notes file.

### Flexible root-level organization

Everything outside `core/` is flexible. Common examples:

- `docs/`
- `archive/`
- `research/`
- `notes/`
- any other project-specific folders

## Decision Tree

Base non-tape delivery indexes visible, non-superseded markdown files under the project memory root and configured shared-global memory. Tape mode narrows and ranks selected files differently. `core/` is still the canonical place for high-priority memory that should be easy to find and likely to appear in regular context, but root-level folders are also visible to the base memory index.

### Is this canonical memory the agent should see often?

**Yes** → Place under `core/`

- User profile and preferences → `core/USER.md`
- Durable project notes, conventions, and lessons learned → `core/MEMORY.md`
- Project tasks/plans → `core/TASK.md`
- General project knowledge → `core/project/`

**Maybe shared across ALL projects?** → Place under `{globalMemory}/core/` when `globalMemory` is enabled

- Shared user profile and preferences → `{globalMemory}/core/USER.md`
- Shared durable notes, conventions, and lessons learned → `{globalMemory}/core/MEMORY.md`
- Shared tasks/plans → `{globalMemory}/core/TASK.md`

**No, but still useful memory** → Place at project root level (same level as `core/`)

- Reference docs → `docs/`
- Historical → `archive/`
- Research → `research/`
- Notes → `notes/`
- Other? → Create appropriate folder

Root-level memory files still appear in the base memory index under non-tape delivery. Keep them focused and mark obsolete files with `status: superseded` when they should be hidden from normal listing/delivery.

**Important:** `core/project/` is a fixed subdirectory under `core/`. Always use `core/project/` for project-specific memory files, never create a `project/` folder at the root level.

## Operational Memory Policy

Use memory for durable reusable knowledge, not as a transcript dump.

Read/search memory before nontrivial debugging, implementation, refactoring, architecture, CI/deploy/ops, benchmarking, workflow, or unfamiliar-repo work. Search again when uncertain, when prior context may be stale, when a familiar error appears, or before re-deriving a command, setup step, root cause, or runbook.

Write memory only for information likely to save future work: repo runbooks, command flows, root causes, gotchas, environment setup, successful verification, failed approaches, and stable user preferences. Do not store secrets, raw logs, trivial one-off notes, or long transcripts. Keep files focused and searchable; split unrelated or growing topics into separate memories.

Before writing, search/list existing memory and update an existing focused file when possible. If `memory_search(query=...)` returns empty, retry once with a broader `memory_search(rg=...)` body/path pattern or `memory_list(directory=...)` for the likely folder before creating a new file. If new facts supersede old ones, edit the current memory or mark stale duplicates with `status: superseded` and a replacement pointer. Do not duplicate authoritative rules from `AGENTS.md`; memory should store repo/debug/runbook knowledge and short pointers.

After substantial debugging/running, write the 30-minute-saving memory before final response, or explicitly state why no durable memory was written.

## Project vs Shared-Global Writes

`memory_write` is project-scoped. Use it by default for project memory paths such as `core/USER.md`, `core/TASK.md`, `core/project/...`, `docs/...`, `archive/...`, `research/...`, or `notes/...`. Use direct file edits for project memory only when full frontmatter is required and safe, such as setting `status: superseded`.

For shared-global memory, resolve the configured shared-global directory from `settings["pi-memory-md"].memoryDir` (`localPath` plus `globalMemory`) and edit files directly with the normal file tools. Standard shared-global files live under `{globalMemory}/core/` as optional `USER.md`, `MEMORY.md`, and `TASK.md`. User-maintained subfolders under that core directory, such as `core/project/`, may exist for cross-repo runbooks; preserve existing layout and update focused existing files instead of relocating content without explicit approval.

## Frontmatter Schema

Every memory file MUST have frontmatter between `---` delimiters. `memory_write` writes JSON-compatible frontmatter because JSON is valid YAML and avoids ambiguous unquoted scalars. Prefer this form for manual rich metadata too:

```yaml
---
{
  "description": "Human-readable description of this memory file",
  "tags": ["user", "identity"],
  "created": "2026-02-14",
  "updated": "2026-02-14",
}
---
```

Plain YAML frontmatter is still readable, but quote any string containing `: `, brackets, braces, backticks, or shell commands. Malformed frontmatter is read with a best-effort fallback so one bad file does not block memory delivery.

**Required fields:**

- `description` (string) - Human-readable description

**Optional fields:**

- `tags` (array of strings) - For searching and categorization
- `created` (date) - File creation date (auto-added on create)
- `updated` (date) - Last modification date (auto-updated on update)

For directly edited project or shared-global memory, include useful rich metadata when it materially improves search and maintenance: `description`, `category`, `status`, `load_priority`, `scope`, `repos`, `prs`, `last_verified`, `staleness_risk`, `evidence`, `tags`, `created`, and `updated`. Use honest status values such as `current`, `resolved`, `partial`, `abandoned`, `superseded`, `historical`, or `unknown`. Quote strings containing `: `, brackets, braces, backticks, or shell commands.

## Examples

### Example 1: User Profile and Preferences (core/USER.md)

```bash
memory_write(
  path="core/USER.md",
  description="User profile and working preferences",
  tags=["user", "profile", "preferences"],
  content="# User Profile\n\n## Communication Style\n- Be concise\n- Show concrete code changes\n\n## Code Style\n- Prefer simple solutions\n- Keep files focused"
)
```

### Example 2: Project Task Memory (core/TASK.md)

```bash
memory_write(
  path="core/TASK.md",
  description="Current project task tracking",
  tags=["task", "planning"],
  content="# Current Tasks\n\n- Fix sync issue\n- Update docs"
)
```

### Example 3: Project Architecture (core/project/)

```bash
memory_write(
  path="core/project/architecture.md",
  description="Project architecture and design",
  tags=["project", "architecture"],
  content="# Architecture\n\n..."
)
```

### Example 4: Reference Docs (root level)

```bash
memory_write(
  path="docs/api/rest-endpoints.md",
  description="REST API reference documentation",
  tags=["docs", "api"],
  content="# REST Endpoints\n\n..."
)
```

### Example 5: Archived Decision (root level)

```bash
memory_write(
  path="archive/decisions/2024-01-15-auth-redesign.md",
  description="Auth redesign decision from January 2024",
  tags=["archive", "decision"],
  content="# Auth Redesign\n\n..."
)
```

## Listing Memory Files

Use the `memory_list` tool:

```bash
# List all files
memory_list()

# List files in specific directory
memory_list(directory="core/project")

# List only core/ files
memory_list(directory="core")
```

## Updating Memory Files

To update a file, use `memory_write` with the same path:

```bash
memory_write(
  path="core/USER.md",
  description="Updated user profile and preferences",
  content="New content..."
)
```

The extension preserves existing `created` date and updates `updated` automatically.

## Folder Creation Guidelines

### core/ directory - partially fixed structure

**Directories guaranteed by `memory-init`:**

- `project/` - Project-specific information

**Common optional files at `core/` root:**

- `USER.md` - User profile and preferences
- `MEMORY.md` - Durable notes, conventions, and lessons learned
- `TASK.md` - Task and planning file

Avoid inventing extra `core/` subfolders unless there is a clear reason and the structure is intentionally being extended.

### Root level (same level as core/) - COMPLETE freedom

**Agent can create any folder structure at project root level (same level as `core/`):**

- `docs/` - Reference documentation
- `archive/` - Historical information
- `research/` - Research findings
- `notes/` - Standalone notes
- `examples/` - Code examples
- `guides/` - How-to guides

**Rule:** Organize root level in a way that makes sense for the project.

**WARNING:** Do NOT create a `project/` folder at root level. Use `core/project/` instead.

## Best Practices

### DO:

- Use `core/USER.md` for user profile and preferences
- Use `core/MEMORY.md` for durable notes, conventions, and lessons learned
- Use `core/TASK.md` for task and planning memory
- Use `core/project/` for project-specific knowledge meant for regular delivery
- Use `{globalMemory}/core/` only for truly cross-project memory
- Use root level for reference, historical, and research content that can still appear in the memory index
- Keep files focused on a single topic
- Organize root level folders by content type

### DON'T:

- Create a `project/` folder at root level (use `core/project/` instead)
- Assume `core/USER.md`, `core/MEMORY.md`, or task files already exist unless templates were created
- Put reference docs in `core/` when they are not canonical high-priority memory
- Create giant files (split into focused topics)
- Mix unrelated content in same file

## Maintenance

### Session Wrap-up

After completing work, archive to root level:

```bash
memory_write(
  path="archive/sessions/2025-02-14-bug-fix.md",
  description="Session summary: fixed database connection bug",
  tags=["archive", "session"],
  content="..."
)
```

### Regular Cleanup

- Consolidate duplicate information
- Update descriptions to stay accurate
- Remove information that's no longer relevant
- Archive old content to appropriate root level folders

## When to Use This Skill

Use `memory-management` when:

- User asks to remember something for future sessions
- Creating or updating project documentation
- Setting preferences or guidelines
- Storing reference material
- Building knowledge base about the project
- Organizing information by type or domain
- Creating reusable patterns and solutions
- Documenting troubleshooting steps

## Before Syncing

**IMPORTANT**: Before running `memory_sync(action="push")`, run `memory_check()` first to inspect the folder structure:

```bash
# Inspect structure first
memory_check()

# Then push after reviewing the structure
memory_sync(action="push")
```

## Related Skills

- `memory-sync` - Git synchronization operations
- `memory-init` - Set up local memory directories and optional git sync
- `memory-search` - Finding specific information

Related command/tool:

- `memory_check` tool - Show project memory plus configured shared-global memory, including folder structure and file counts before syncing
- `/memory-check` command - Show the current project memory folder tree before syncing
