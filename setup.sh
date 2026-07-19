#!/usr/bin/env bash
set -euo pipefail

CONFIG_DIR="$(cd "$(dirname "$0")" && pwd -P)"
REQUIRED_COMMANDS=(git node npm pi ast-grep)
OPTIONAL_COMMANDS=(pnpm uv chafa wl-paste)
INSTALL_ROOTS=(
	"npm"
	"mcp-servers/tree-sitter"
	"packages/pi-memory-md"
	"packages/pi-openai-service-tier"
	"packages/pi-subagents"
)

if [[ -n "${PI_CODING_AGENT:-}" ]]; then
	echo "Run setup from a terminal outside Pi, then restart Pi." >&2
	exit 1
fi

for command_name in "${REQUIRED_COMMANDS[@]}"; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Missing required command: $command_name" >&2
		exit 1
	fi
done

node -e '
const [major, minor] = process.versions.node.split(".").map(Number);
if (major < 22 || (major === 22 && minor < 19)) {
  console.error("Node.js >=22.19 is required; found " + process.versions.node);
  process.exit(1);
}
'

if [[ -z "${PI_CODING_AGENT_DIR:-}" ]]; then
	echo "PI_CODING_AGENT_DIR is not set." >&2
	echo "Export PI_CODING_AGENT_DIR=\"$CONFIG_DIR\" before running setup." >&2
	exit 1
fi

if ! ACTIVE_CONFIG_DIR="$(cd "$PI_CODING_AGENT_DIR" 2>/dev/null && pwd -P)"; then
	echo "PI_CODING_AGENT_DIR does not resolve to a directory: $PI_CODING_AGENT_DIR" >&2
	exit 1
fi

if [[ "$ACTIVE_CONFIG_DIR" != "$CONFIG_DIR" ]]; then
	echo "PI_CODING_AGENT_DIR resolves to $ACTIVE_CONFIG_DIR, not $CONFIG_DIR" >&2
	exit 1
fi

for command_name in "${OPTIONAL_COMMANDS[@]}"; do
	if ! command -v "$command_name" >/dev/null 2>&1; then
		echo "Optional command unavailable: $command_name" >&2
	fi
done

echo "Synchronizing submodules"
git -C "$CONFIG_DIR" submodule sync --recursive
git -C "$CONFIG_DIR" submodule update --init --recursive

for relative_root in "${INSTALL_ROOTS[@]}"; do
	package_root="$CONFIG_DIR/$relative_root"
	if [[ ! -f "$package_root/package-lock.json" ]]; then
		echo "Missing package lock: $package_root/package-lock.json" >&2
		exit 1
	fi
done

for relative_root in "${INSTALL_ROOTS[@]}"; do
	package_root="$CONFIG_DIR/$relative_root"
	echo "Installing runtime dependencies: $relative_root"
	npm ci --prefix "$package_root" --omit=dev --ignore-scripts
done

echo "Bootstrap complete: $CONFIG_DIR"
