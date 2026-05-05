#!/usr/bin/env bash
# Worktree setup hook for pi-subagents
# Runs after a git worktree is created for a parallel subagent
# Installs dependencies so the worktree is ready to work

set -euo pipefail

# Python: uv sync from lockfile (fast, ~2s)
if [[ -f "uv.lock" ]]; then
    uv sync --frozen --quiet 2>/dev/null || true
fi

# Node: pnpm install from lockfile (fast with store)
if [[ -f "pnpm-lock.yaml" ]]; then
    pnpm install --frozen-lockfile --silent 2>/dev/null || true
fi
