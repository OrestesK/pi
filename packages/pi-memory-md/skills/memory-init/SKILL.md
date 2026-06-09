---
name: memory-init
description: Initialize local pi-memory-md directories, with optional git sync when repoUrl is configured. Use when you need to set up pi-memory-md for the first time or initialize project memory files.
---

## Overview

1. Inspect settings and create the local memory directories under `localPath`
2. If `repoUrl` is configured and the user wants git sync, initialize/clone/sync the git repository outside this skill’s direct file writes
3. Read and copy template files from [templates/](templates/) only after user confirmation

## Prerequisites

Before running this skill, ensure:

- Package installed: `pi install npm:pi-memory-md`
- `localPath` is configured in global settings or you accept the default `~/.pi/memory-md`
- Optional: `repoUrl` is configured and accessible if you want pull/push sync

## Execution Steps

### Step 1: Initialize Local Directories

Read settings from global pi settings, then calculate:

1. `localPath`
2. Project memory directory for the current cwd
3. Optional `globalMemory` directory

Create the project memory directory and its `core/project/` folder. If `globalMemory` is enabled, create that directory too. Do not require `repoUrl` for local-only memory.

If the user wants git sync and `repoUrl` is configured, they may initialize or clone the memory repository before creating files. Do not claim pull/push sync is available unless `localPath` is git-backed and `repoUrl` is configured.

### Step 2: Configure globalMemory (if applicable)

Read `globalMemory` from global pi settings. Project `.pi/settings.json` does not override `pi-memory-md.memoryDir`, so do not use project settings to decide whether shared global memory is enabled.

Then ask user whether they also want to create default global files under the configured `globalMemory` core directory:

- `{globalMemory}/core/USER.md` from `user-template.md`
- `{globalMemory}/core/MEMORY.md` from `memory-template.md`
- `{globalMemory}/core/TASK.md` from `task-template.md`

### Step 3: Copy Template Files for Project Memory (Optional)

Ask user which project templates to create in [templates/](templates/):

```
Which project template files would you like to create? (select all that apply)
1. task-template.md - Project tasks and planning template
2. user-template.md - Project user profile and preferences template
3. None (skip project templates)
```

If user selects templates, copy them from `templates/` to the target paths:

```bash
cp templates/task-template.md {projectMemoryDir}/core/TASK.md
cp templates/user-template.md {projectMemoryDir}/core/USER.md
```

### Step 4: Import Preferences from AGENTS.md (Optional)

This step extracts preferences from AGENTS.md to populate project `core/USER.md` and, if global memory is enabled, `{globalMemory}/core/USER.md`.

1. **Find AGENTS.md** (check in order):
   - Project root: `{cwd}/AGENTS.md`
   - Project: `{cwd}/.pi/agent/AGENTS.md`
   - Global: `~/.pi/agent/AGENTS.md`

2. **Ask user**: Do you want to import preferences from AGENTS.md?
   - If NO, skip to "Summarize and confirm"
   - If YES, continue

3. **Read AGENTS.md** and extract relevant sections:
   - IMPORTANT Rules
   - Code Quality Principles
   - Coding Style Preferences
   - Architecture Principles
   - Development Workflow
   - Technical Preferences

4. **Summarize and confirm**:

   ```
   Found these preferences in AGENTS.md:
   - IMPORTANT Rules: [1-2 sentence summary]
   - Code Quality Principles: [1-2 sentence summary]
   - Coding Style: [1-2 sentence summary]

   Include these in project core/USER.md and, if available, {globalMemory}/core/USER.md? (yes/no)
   ```

5. **If confirmed**, update or create the target profile files with:
   - `core/USER.md`
   - `{globalMemory}/core/USER.md` if global memory is enabled
   - Extracted content from AGENTS.md
   - Keep the existing frontmatter (description, tags, created)

6. **Ask for additional preferences**:
   ```
   Any additional preferences to add to USER.md? (e.g., communication style, specific tools)
   ```

### Step 5: Create Additional Folders (Optional)

Ask user whether they want to create any additional folders beyond `core/project`.

Examples:

- `reference/`
- `archive/`
- Any custom project-specific folder

If YES, ask for the folder names and create them under the project memory directory.

### Step 6: Inspect Setup

Call the `memory_check` tool to inspect project memory plus configured shared-global memory, including folder structure and file counts.

## Memory Repository Structure

```
{localPath}/
├── {globalMemory}/            # (if globalMemory config block exists)
│   └── core/
│       ├── USER.md            # Shared user profile and preferences
│       ├── MEMORY.md          # Shared durable notes, conventions, and lessons learned
│       └── TASK.md            # Shared task and planning file
└── {project-name}/
    └── core/
        ├── USER.md            # Project user profile and preferences
        ├── project/           # Project memory files
        └── TASK.md            # Task and planning file
```

## Workflow Guide

```
START
  │
  ▼
Read settings and create local memory directories
  │
  ▼
If repoUrl is configured and sync is desired, ensure localPath is git-backed
  │
  ▼
Check settings: is globalMemory enabled?
  │
  ├─ NO ──► Continue with project setup
  │
  └─ YES
      │
      ▼
  Ensure {globalMemory}/core directory exists
      │
      ▼
  Ask: Create {globalMemory}/core/USER.md, {globalMemory}/core/MEMORY.md, and {globalMemory}/core/TASK.md?
      │
      ├─ NO ──► Skip global files
      │
      └─ YES
          │
          ▼
      Copy user-template.md to {globalMemory}/core/USER.md
          │
          ▼
      Copy memory-template.md to {globalMemory}/core/MEMORY.md
          │
          ▼
      Copy task-template.md to {globalMemory}/core/TASK.md
          │
          ▼
Continue with project setup
  │
  ▼
Ask: Which project templates to create?
  │
  ├─ None ──► Skip templates
  │
  └─ Select templates
      │
      ▼
  Copy selected project templates
      │
      ▼
  Never create project core/MEMORY.md in this flow
      │
      ▼
Ask: Import preferences from AGENTS.md?
      │
  ├─ NO ──► Skip import
  │
  └─ YES
      │
      ▼
  Read AGENTS.md and extract preferences
      │
      ▼
  Ask: Confirm import to project core/USER.md and, if available, {globalMemory}/core/USER.md?
      │
      ├─ NO ──► Ask for additional preferences
      │
      └─ YES
          │
          ▼
      Update project core/USER.md and, if available, {globalMemory}/core/USER.md
          │
          ▼
      Ask: Additional preferences?
          │
          ▼
Ask: Create any additional folders?
  │
  ▼
Inspect with memory_check for project/shared-global structure and file counts
  │
  ▼
Optionally use /memory-check for a lighter project-tree-only view
  │
  ▼
DONE
```

## Error Handling

| Error                              | Solution                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------- |
| `settings not found`               | Configure `pi-memory-md` in settings file                                        |
| Pull/push reports missing repo URL | Local-only memory can continue; add `repoUrl` only if pull/push sync is required |
| `Permission denied`                | Check SSH keys: `ssh -T git@github.com` if using git sync                        |
| `Directory exists but not git`     | Use it as local-only memory, or initialize git if sync is required               |
| `Connection timeout`               | Check network and try again if using git sync                                    |

## Templates

Copy these templates to start:

- [templates/task-template.md](templates/task-template.md) — Project tasks and planning template
- [templates/user-template.md](templates/user-template.md) — User profile and preferences template
- [templates/memory-template.md](templates/memory-template.md) — Hermes-inspired durable notes, conventions, and lessons learned template for `globalMemory` only

## Related Skills

- `memory-management` - Create and manage memory files
- `memory-sync` - Git synchronization
- `memory-search` - Find information in memory
