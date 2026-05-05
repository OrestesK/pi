#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="$HOME/.pi/agent"

mkdir -p "$HOME/.pi"

if [[ -L "$TARGET" ]]; then
    current=$(readlink "$TARGET")
    if [[ "$current" == "$CONFIG_DIR" ]]; then
        echo "Already linked: $TARGET -> $CONFIG_DIR"
        exit 0
    fi
    echo "Updating symlink: $TARGET -> $CONFIG_DIR (was: $current)"
    rm "$TARGET"
elif [[ -d "$TARGET" ]]; then
    echo "WARNING: $TARGET exists as a directory. Back it up and remove it first."
    exit 1
fi

ln -s "$CONFIG_DIR" "$TARGET"
echo "Linked: $TARGET -> $CONFIG_DIR"
