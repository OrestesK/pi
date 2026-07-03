# pi-memory-md

Letta-like memory management for [pi](https://github.com/badlogic/pi-mono) using local markdown files with optional git sync.

## Features

- **Persistent Memory**: Store context, preferences, and knowledge across sessions
- **Local-first**: Read, write, list, and search memory from a local directory
- **Optional Git sync**: Add `repoUrl` when you want version control and cross-device sync
- **Prompt delivery**: A ranked, capped memory index is delivered before the first agent turn according to the configured delivery mode
- **On-demand access**: LLM reads full content via tools when needed
- **Multi-project**: Separate memory spaces per project

## Quick Start

```bash
# 1. Install
pi install npm:pi-memory-md
# Or for latest from GitHub:
pi install git:github.com/VandeeFeng/pi-memory-md

# 2. Configure pi
# Add to ~/.pi/agent/settings.json:
{
  "pi-memory-md": {
    "memoryDir": {
      "localPath": "~/.pi/memory-md",
      "globalMemory": "global" // optional shared memory folder
    },
    "hooks": {
      "sessionStart": [],
      "sessionEnd": []
    }
  }
}

# 3. Start a new pi session
# type /skill:memory-init slash command to initialize local memory files

# Optional: add memoryDir.repoUrl and restore pull/push hooks when you want git sync.
```

> **Security recommendation**
>
> Configure `pi-memory-md` in global settings (`~/.pi/agent/settings.json`) instead of project settings (`.pi/settings.json`).
>
> If project settings could override these options, a repository could redirect your memory to another local path, point sync at a different remote repo, or enable automatic pull/push behavior you did not intend.
>
> For this reason, project-level `.pi/settings.json` does not override these `pi-memory-md` options: `repoUrl`, `localPath`, `memoryDir`, sync hooks, and `tape.tapePath`.

## How It Works

```
Session Start
    ↓
1. Prepare local memory context; run configured sync hooks when the current session lifecycle supports them
    ↓
2. Scan visible, non-superseded `.md` files under the project memory root and configured shared-global memory
    ↓
3. Rank startup entries by `load_priority`, status, project-path relevance, and recency
    ↓
4. Deliver up to 24 files per scope before the first agent turn via `message-append` or `system-prompt`
    ↓
5. LLM uses `memory_search`, `memory_list`, or `read` for omitted or full file content when needed
```

## Slash Commands In Pi

You can also use these slash commands directly in pi:

| Command              | Description                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| `/skill:memory-init` | Initialize local memory directories, optionally using a configured git repo for sync |
| `/memory-status`     | Show memory repository status (project name, git status, path)                       |
| `/memory-refresh`    | Refresh memory context from files (rebuild cache and deliver into current session)   |
| `/memory-check`      | Show the current project memory directory tree                                       |

## Available Tools

The LLM can use these tools to interact with memory:

### Memory Management Tools

| Tool            | Parameters                             | Description                                                                                             |
| --------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `memory_sync`   | `{action: "pull" / "push" / "status"}` | Git status/sync when the memory directory is git-backed; status also reports local-only initialization  |
| `memory_write`  | `{path, content, description, tags?}`  | Write a project memory file by relative path                                                            |
| `memory_list`   | `{directory?: string}`                 | List visible memory by relative path; global paths stay absolute; `status: superseded` files are hidden |
| `memory_search` | `{query?, grep?, rg?}`                 | Search parsed metadata/path/headings and custom grep/ripgrep patterns, including superseded files       |
| `memory_check`  | `{}`                                   | Inspect project memory plus configured shared-global memory, including file counts                      |

`memory_search(query=...)` tokenizes query terms and searches parsed JSON/YAML frontmatter, relative paths, and markdown headings. Startup context is capped for prompt size, but `memory_search` and `memory_list` still inspect the full memory corpus. If a query returns no results before a planned write, retry with `memory_search(rg=...)` or `memory_list(directory=...)` to avoid duplicating an existing memory.

## Memory File Format

```markdown
---
description: "User identity and background"
tags: ["user", "identity"]
created: "2026-02-14"
updated: "2026-02-14"
load_priority: "high" # Optional startup ranking hint: high, medium, or low
---

# Your Content Here

Markdown content...
```

## Directory Structure

```
~/.pi/memory-md/
├── global/                 # Optional shared memory when globalMemory is enabled
│   └── core/
│       ├── USER.md         # Optional shared user profile and preferences
│       ├── MEMORY.md       # Optional shared durable notes, conventions, and lessons learned
│       └── TASK.md         # Optional shared task template
└── project-name/
    ├── core/
    │   ├── USER.md         # Optional project user profile and preferences
    │   ├── TASK.md         # Optional project task template
    │   └── project/        # Project context
    │       └── tech-stack.md
    ├── docs/               # Optional root-level reference docs
    ├── archive/            # Optional historical info
    ├── research/           # Optional research notes
    └── notes/              # Optional standalone notes
```

## Configuration

```json
{
  "pi-memory-md": {
    // "enabled": false,

    "memoryDir": {
      // Optional git remote URL for pull/push sync. Omit for local-only memory.
      // "repoUrl": "git@github.com:username/repo.git", // Or HTTPS format

      // Root dir for all memory. `~/.pi/memory-md` as default.
      "localPath": "~/.pi/memory-md",

      // Shared memory folder name under localPath.
      // Only enabled when explicitly configured
      // "global" -> {localPath}/global, "foo/bar" -> {localPath}/bar.
      // "" or omitted -> disabled, "   " -> {localPath}/global, ".." -> {localPath}/global.
      "globalMemory": "global"
    },

    // `injection` is still accepted as a legacy alias for `delivery`.
    "delivery": "message-append",
    "hooks": {
      "sessionStart": ["pull"],
      "sessionEnd": ["push"]
    }
  }
}
```

| Setting                  | Default            | Description                                                                                                                   |
| ------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `enabled`                | `true`             | Enable extension                                                                                                              |
| `memoryDir.repoUrl`      | unset              | Optional git repository URL for pull/push sync                                                                                |
| `memoryDir.localPath`    | `~/.pi/memory-md`  | Local memory root path                                                                                                        |
| `memoryDir.globalMemory` | disabled           | Shared memory folder name (relative to `localPath`), enabled only when explicitly configured                                  |
| `delivery`               | `"message-append"` | Memory delivery mode: `"message-append"`, `"system-prompt"`                                                                   |
| `hooks.sessionStart`     | `["pull"]`         | Pull hook action for eligible session-start lifecycles; explicitly run `memory_sync` when deterministic freshness is required |
| `hooks.sessionEnd`       | `[]`               | Actions to run when a session ends                                                                                            |
| `tape.enabled`           | `false`            | Enable tape mode for dynamic context selection                                                                                |

When settings change, run `/reload` to apply them.

Legacy config is still supported:

```json
{
  "pi-memory-md": {
    "autoSync": {
      "onSessionStart": true
    }
  }
}
```

```json
{
  "pi-memory-md": {
    "localPath": "~/.pi/memory-md",
    "repoUrl": "git@github.com:username/repo.git" // Or HTTPS format
  }
}
```

### Hooks

- `sessionStart: ["pull"]`: pull latest memory for eligible session-start lifecycles. New and forked sessions currently initialize delivery without running session-start hooks, so explicitly request `memory_sync(action="pull")` when deterministic freshness is required. Requires `repoUrl` and a git-backed `localPath`.
- `sessionEnd: ["push"]`: commit and push memory when the session ends. Requires `repoUrl` and a git-backed `localPath`.
- For local-only memory, set both hook arrays to `[]`.

More trigger actions can be added later, even custom hooks.

### Memory Delivery Modes

The extension supports two base modes for delivering memory into the conversation.
When tape mode is disabled, behavior is exactly as described below.
When tape mode is enabled, the same delivery mode still applies, but tape changes how memory files are selected.

#### 1. Message Append (Default)

```json
{
  "pi-memory-md": {
    ...
    "delivery": "message-append"
  }
}
```

- Memory is sent as a hidden custom message on the first agent turn and once again after each successful compaction
- Not visible in the TUI (`display: false` in pi-tui)
- This hidden message is delivered in the same agent turn, so it does not create a second LLM request; it only adds tokens to the current request
- Persists in the session history
- Delivered once per session, then re-delivered after successful compaction because compaction can remove the earlier hidden memory message from active context
- **Pros**: Lower token usage, memory persists naturally in conversation
- **Cons**: Only visible when the model scrolls back to earlier messages

#### 2. System Prompt

```json
{
  "pi-memory-md": {
    ...
    "delivery": "system-prompt"
  }
}
```

- Memory is appended to the system prompt
- Rebuilt and delivered on every agent turn
- Always visible to the model in the system context
- **Pros**: Memory always present in system context, no need to scroll back
- **Cons**: Higher token usage (repeated on every prompt)

## Usage Examples

Simply talk to pi - the LLM will automatically use memory tools when appropriate:

```
You: Save my preference for 2-space indentation in TypeScript files to memory.

Pi: [Uses memory_write tool to save your preference]
```

You can also explicitly request operations:

```
You: List all memory files for this project.
You: Search memory for "typescript" preferences.
You: Read core/USER.md
You: Sync my changes to the repository.
```

The LLM automatically:

- Reads memory index before the first agent turn according to the configured delivery mode
- Writes new information when you ask to remember something
- Syncs changes only when hooks are configured or when you explicitly request `memory_sync`

## Tape Mode (Dynamic Context Delivery)

> **Experimental**: This mode is under active development. APIs and behavior may change.
>
> For the latest, install via GitHub: `pi install git:github.com/VandeeFeng/pi-memory-md`
>
> **Note**: This mode may consume more tokens. Adjust parameters based on your model's context window and your API quota.

More details [tape-design](docs/tape-design.md) / [中文版](docs/tape-design.zh.md)

Minimal setting:

```json
{
  "pi-memory-md": {
    ...
    "tape": {
      // "enabled": false,
      "anchor": {
        "keywords": {
          "global": ["refactor", "migration"],
          "project": ["tape", "Emacs"]
        }
      }
    }
  }
}
```

Then use `/memory-anchor` to create an anchor manually, or let anchors be created automatically when configured keywords are triggered.

If you want to jump to the conversation around an anchor and restart from there, `/tree` and the anchors in this session are all there with a customizable anchor label in pi TUI.

### Tape vs Delivery Modes

**Tape** is an independent feature that can be enabled alongside either delivery mode.
It does not change the delivery mechanism; it changes **which memory files** are selected.

| Tape     | Delivery mode    | Behavior                                                                                                      |
| -------- | ---------------- | ------------------------------------------------------------------------------------------------------------- |
| Disabled | `message-append` | Sends memory as a hidden custom message on the first agent turn and after successful compaction               |
| Disabled | `system-prompt`  | Rebuilds memory and appends it to the system prompt on every agent turn                                       |
| Enabled  | `message-append` | Sends tape-selected memory as a hidden custom message on the first agent turn and after successful compaction |
| Enabled  | `system-prompt`  | Rebuilds tape-selected memory and appends it to the system prompt on every agent turn                         |

With tape enabled, the delivered content is still a memory index/summary for the model, but the file list is chosen by tape-aware selection logic instead of the basic project scan. In smart mode, the delivered list can also include recently active project file paths inferred from tool usage, plus a `recent focus` summary for each selected file showing the most recently attended `read` / `edit` ranges inside the same effective smart-scan window. Stale paths from old tape history are ignored when the file no longer exists.

A delivered tape hidden message looks like:

```md
# Project Memory

Memory directory: /home/user/.pi/memory-md/my-project

Paths below are relative to that directory.

Available memory files (ranked and capped; use memory_search or memory_list to find omitted files):

- core/USER.md [high priority]
  recent focus: read 12-28
  Description: User profile and preferences
  Tags: user, profile, preferences

---

Recently active project files (full paths from read/edit/write tool usage):

- /path/to/project/tape/tape-selector.ts [high priority]
  recent focus: read 340-420, read 590-677, edit 340-399

---

💡 Tape is enabled for this conversation. Use tape tools when you need anchors or tape history.
```

### Config Guide

```json
{
  "pi-memory-md": {
    ...
    "memoryDir": {
      "localPath": "~/.pi/memory-md"
    },
    "tape": {
      // Run tape only inside a Git repository by default
      // Uses `git rev-parse --show-toplevel`; if it fails, tape is skipped
      "onlyGit": true, // default

      // Absolute directory paths where tape is always disabled
      // Built-in system/temp directories are also excluded by default
      "excludeDirs": [
        "/absolute/path/to/sandbox"
      ],

      "context": {
        // "smart": ranks memory files plus recent project file activity from session history (default)
        //          repeated accesses get diminishing returns, edit/write outrank plain reads,
        //          recent accesses get a recency bonus, missing/stale paths are ignored,
        //          and handoff boosts only apply near the latest anchors
        // "recent-only": most recently modified memory files only
        "strategy": "smart", // default

        // Max files to deliver into LLM context
        "fileLimit": 10, // default

        // Smart-mode pi session history scan range: [startHours, maxHours]
        // Scans history incrementally by 24-hour steps, starting from startHours.
        // Stops and uses the result once the sample reaches MIN_SMART_ACCESS_SAMPLES (5).
        // Otherwise keeps expanding until maxHours is reached.
        "memoryScan": [72, 168], // default

        // "alwaysInclude" is deprecated
        // Files or directories to always include in context (optional, defaults to empty)
        "whitelist": [
          "core/USER.md",
          "docs/tape-design.md"
        ],

        // Files or directories to always exclude from context (optional, defaults to empty)
        // Other paths still go through rg ignore rules first, then the built-in default ignore list.
        "blacklist": [
          "node_modules",
          "dist"
        ]
      },
      "anchor": {
        // "auto": LLM may create handoff anchors when it decides they are useful
        // "manual": direct tape_handoff is hard-blocked
        // hidden keyword instructions and /memory-anchor still work in manual mode
        "mode": "auto", // default

        // Prefix mirrored into pi /tree labels for anchor nodes
        "labelPrefix": "⚓ ", // default

        "keywords": {
          // Match against user prompts with length in [10, 300]
          // When matched, send a hidden instruction about the tape_handoff tool call
          // It stays in the same agent turn: no extra LLM request, only extra tokens in the current request
          // This gives the agent room to refuse when creating a keyword anchor is not necessary at all
          // Strongly recommended! Keywords make anchor creation much smarter - customize based on your focus areas
          "global": ["refactor", "migration"],
          "project": ["tape", "Emacs"]
        }
      },

      // Custom tape path (optional)
      // If not set, default is {localPath}/TAPE: ~/.pi/memory-md/TAPE
      // Anchor index files (.jsonl) will be stored directly under this path
      "tapePath": "/custom/path/to/tape"
    }
  }
}
```

### Tape Anchors

Anchors are named checkpoints that correspond to pi session entries, marking important transitions in your conversation. They enable efficient context reconstruction and are mirrored into pi `/tree` labels:

<img src="docs/pi-tree.png" width="400" />

Each line in the tape anchor store is a JSON record:

```json
{
  "id": "1234567890-abc123",
  "timestamp": "2026-04-04T12:00:00.000Z",
  "name": "task/begin",
  "type": "handoff",
  "meta": {
    "summary": "Working on feature X",
    "purpose": "feature",
    "trigger": "manual"
  },
  "sessionId": "019dbd12-90b7-72b1-a88d-843706db32de",
  "sessionEntryId": "446b6c33"
}
```

Each anchor has:

- **`id`**: A stable unique identifier, auto-generated from `sessionEntryId:timestamp:name`
- **`name`**: A human-readable label (e.g., `session/new`, `task/begin`)
- **`type`**: Anchor type - `session` for lifecycle anchors, `handoff` for manual/semantic transitions
- **`sessionId`**: The pi session this anchor belongs to
- **`sessionEntryId`**: The associated session entry ID for tree mirroring
- **`timestamp`**: ISO timestamp of when the anchor was created
- **`meta`**: Optional metadata including `summary`, `trigger`, `keywords`, `purpose`. `purpose` is a 1-2 word label (e.g., `feature`, `review`, `deploy`). `trigger` can be `direct` (agent auto), `keyword` (configured keywords matched), or `manual` (explicit user/tool call)

In a word, tape anchors are markers that help the agent organize context more effectively according to the user's intention.

Tape anchors are stored as points within pi session entries. The context delivery then selects relevant memory files and recently active project files based on configured strategy, optionally including concise `recent focus` hints like `read 340-420` or `edit 390-399`.

Lifecycle anchors (`session/*`) are created automatically, while handoff anchors can be created via `/memory-anchor` manually. When `mode: "manual"` is set, direct `tape_handoff` calls are blocked, which means the agent will not create anchors automatically, though keyword-matched hidden instructions and `/memory-anchor` still work.

Keyword detection can send a hidden message to guide the agent to create a keyword anchor, but the agent may refuse when unnecessary.Anchor names are also mirrored into pi `/tree` labels for the session nodes they attach to, with stale labels cleaned up before resync.

The combination of anchors and keywords balances the agent's autonomy with user control.

### Tape Tools (Anchor-based Context)

| Tool             | Parameters                                                                                                          | Description                                                                               |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `/memory-anchor` | `<prompt>`                                                                                                          | Slash command that asks the LLM to derive and create a manually authorized handoff anchor |
| `tape_handoff`   | `{name, summary?, purpose?}`                                                                                        | Create a handoff anchor checkpoint in the tape                                            |
| `tape_list`      | `{limit?: number}`                                                                                                  | List all anchor checkpoints                                                               |
| `tape_delete`    | `{id}`                                                                                                              | Delete an anchor checkpoint by id                                                         |
| `tape_info`      | `{}`                                                                                                                | Get tape statistics and information                                                       |
| `tape_search`    | `{query?, kinds?, limit?, sinceAnchor?, anchorName?, anchorType?, anchorSummary?, anchorPurpose?, anchorKeywords?}` | Search tape entries by text or type, with structured anchor-field filters                 |
| `tape_read`      | `{afterAnchor?, lastAnchor?, betweenAnchors?, betweenDates?, query?, kinds?, limit?}`                               | Read tape entries as formatted messages                                                   |
| `tape_reset`     | `{archive?: boolean}`                                                                                               | Reset the tape with a new session lifecycle anchor                                        |

> **Note**: Tape tools are registered when a `tape` block exists in config (opt-out: set `"enabled": false`). They provide anchor-based context management inspired by [bub](https://bub.build)'s tape mechanism.

## Reference

- [Introducing Context Repositories: Git-based Memory for Coding Agents | Letta](https://www.letta.com/blog/context-repositories)
- https://tape.systems
- https://bub.build/
- https://github.com/bubbuild/bub/tree/main/src/bub
