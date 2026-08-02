---
name: session-reader
description: Efficiently read and analyze pi agent session JSONL files. Use when asked to "read a session", "review a session", "analyze a session", "what happened in this session", "load session", "parse session", "session history", "go through sessions", or given a .jsonl session file path.
---

# Read Pi Sessions

Parse Pi session JSONL files into readable output. `PI_CODING_AGENT_SESSION_DIR`, when set, is the exact directory containing session files. Otherwise Pi groups sessions by project under `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions`.

## Step 1: Find the Session

Resolve `scripts/read_session.py` relative to this skill directory and set `script_path` to that absolute path. Then list sessions and set `session_path` to the selected JSONL file's absolute path:

```bash
script_path="/absolute/path/resolved-from-this-skill/scripts/read_session.py"

if [[ -n "${PI_CODING_AGENT_SESSION_DIR:-}" ]]; then
    session_dir="$PI_CODING_AGENT_SESSION_DIR"
    ls -t "$session_dir"/*.jsonl | head -10
else
    session_root="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
    find "$session_root" -mindepth 1 -maxdepth 1 -type d -printf '%p\n' | sort
    project_dir="/absolute/path/to/one-listed-project-directory"
    ls -t "$project_dir"/*.jsonl | head -10
fi

session_path="/absolute/path/to/selected-session.jsonl"
```

## Step 2: Start with Table of Contents

Always start with `toc` to get a numbered map of the session:

```bash
uv run "$script_path" "$session_path" --mode toc
```

This prints a compact numbered list of every user exchange with timestamps and tools used.

## Step 3: Read the Conversation

Default mode — shows only user messages and assistant text responses. Tool calls are hidden but hinted at with `[used: tool1, tool2]`.

```bash
# Full conversation (default mode)
uv run "$script_path" "$session_path"

# Specific range
uv run "$script_path" "$session_path" --offset 5 --limit 3

# Search for specific topic
uv run "$script_path" "$session_path" --search "error"
```

## Step 4: Drill Into a Turn

See everything about a specific exchange — thinking, tool calls, tool results, costs:

```bash
uv run "$script_path" "$session_path" --mode turn --turn 7
```

## Mode Reference

| Mode | Shows | Use for |
| ------ | ------- | --------- |
| `conversation` | User + assistant text only (default) | Reading what happened |
| `toc` | Numbered exchange list | Navigation, finding the right turn |
| `turn` | Full detail for one exchange | Drilling into specifics |
| `issues` | Errors, failures, retries, user complaints | Finding what broke |
| `overview` | Metadata + exchange summaries | Quick session assessment |
| `full` | Everything including tool I/O | Deep debugging |
| `tools` | Tool calls and results only | Understanding agent actions |
| `costs` | Token usage and cost per turn | Cost analysis |
| `subagents` | Subagent task/status/cost/paths | Reviewing delegated work |

## Flags

| Flag | Effect |
| ------ | -------- |
| `--offset N` | Skip first N exchanges |
| `--limit N` | Show at most N exchanges |
| `--turn N` | Exchange number to drill into (with `--mode turn`) |
| `--search TERM` | Filter exchanges containing TERM (case-insensitive) |
| `--max-content N` | Max chars per block (default: 3000, 0=unlimited) |

## Typical Workflow

1. `--mode toc` → scan the session, find interesting exchanges
2. Default (conversation) → read the human-readable flow
3. `--mode turn --turn N` → drill into specific exchanges
4. `--mode subagents` → review delegated work and follow subagent session paths

## Subagent Drill-Down

Subagent session files can be read with the same script:

```bash
# Set this to the JSONL path returned by --mode subagents
subagent_session_path="/absolute/path/to/subagent-session.jsonl"
uv run "$script_path" "$subagent_session_path" --mode toc
```

## Session Format Reference

<!-- references/session-format.md does not exist yet — skip for now -->
