---
name: memory-sync
description: Git synchronization operations for pi-memory-md repository. Use when you need to sync memory.
---

# Memory Sync

Git status and synchronization for pi-memory-md.

## Configuration

Local-only memory works without `repoUrl`. Prefer `pi-memory-md.memoryDir.repoUrl` in global settings when you want pull/push sync with a remote repository; legacy top-level `pi-memory-md.repoUrl` is still supported. Use `hooks.sessionStart: []` and `hooks.sessionEnd: []` for local-only memory.

## Sync Operations

### Pull

Fetch latest changes from remote:

```
memory_sync(action="pull")
```

Use before starting work or switching machines.

### Push

Upload local changes to remote:

```
memory_sync(action="push")
```

Auto-commits changes before pushing.

**Before pushing, run memory_check first to inspect the current structure:**

```
memory_check()
```

This shows the current folder structure and helps you spot layout mistakes before syncing.

### Status

Check uncommitted changes, or report that initialized memory is local-only and not git-backed:

```
memory_sync(action="status")
```

Shows modified/added/deleted files.

## Typical Workflow

| Action         | Command                        |
| -------------- | ------------------------------ |
| Get updates    | `memory_sync(action="pull")`   |
| Check changes  | `memory_sync(action="status")` |
| Upload changes | `memory_sync(action="push")`   |

## Troubleshooting

| Error             | Solution                                                                                                    |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| Non-fast-forward  | Pull first, then push                                                                                       |
| Conflicts         | Manual resolution via bash git commands                                                                     |
| Not a git repo    | Local-only memory can still be used; configure `repoUrl` and initialize git only if you need pull/push sync |
| Permission denied | Check SSH keys or repo URL                                                                                  |

## Related Skills

- `memory-management` - Read and write files
- `memory-init` - Set up local memory directories and optional git sync
