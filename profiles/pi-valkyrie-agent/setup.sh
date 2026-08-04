#!/usr/bin/env bash
set -euo pipefail

ROOT=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
PROFILE="$ROOT/profile"
NODE_VERSION="26.4.0"
PI_VERSION="0.80.6"
NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/${NODE_ARCHIVE}"
NODE_SHA256="5c4286dcd5bbd5acb1ccc7eb0e088bd5eb1e3affad671ee9364004f8f6a4a431"
RG_VERSION="15.2.0"
RG_URL="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/ripgrep-${RG_VERSION}-x86_64-unknown-linux-musl.tar.gz"
RG_SHA256="33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c"
FD_VERSION="10.4.2"
FD_URL="https://github.com/sharkdp/fd/releases/download/v${FD_VERSION}/fd-v${FD_VERSION}-x86_64-unknown-linux-musl.tar.gz"
FD_SHA256="e3257d48e29a6be965187dbd24ce9af564e0fe67b3e73c9bdcd180f4ec11bdde"
SOURCES_LOCK_SHA256="63fcffcb129e6ec5a0eaae1e95efb273b81303253cb279cde9860b567831e0fd"
VERIFIER_SHA256="f08b03384f52687f66c2ec4a9c946f7ecaa77273e8deae2b5cff0d8c122ee30d"
NODE_RUNTIME="$PROFILE/runtime/node-v${NODE_VERSION}-linux-x64"
NODE="$NODE_RUNTIME/bin/node"
TOOLCHAIN_BIN="$PROFILE/runtime/toolchain/bin"
RG="$TOOLCHAIN_BIN/rg"
FD="$TOOLCHAIN_BIN/fd"
PI_ENTRY="$PROFILE/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"
NPM_CACHE="$PROFILE/runtime/npm-cache"
NPM_LOGS="$NPM_CACHE/_logs"

if [[ -x /usr/local/bin/python3 ]]; then
  PYTHON="/usr/local/bin/python3"
elif [[ -x /usr/bin/python3 ]]; then
  PYTHON="/usr/bin/python3"
else
  printf 'Python 3 is required at /usr/local/bin/python3 or /usr/bin/python3\n' >&2
  exit 1
fi

if [[ $(uname -m) != "x86_64" ]]; then
  printf 'Unsupported architecture: %s\n' "$(uname -m)" >&2
  exit 1
fi

for required in package.json package-lock.json settings.json sources.lock.json; do
  if [[ ! -f "$PROFILE/$required" ]]; then
    printf 'Missing pinned profile resource: %s\n' "$required" >&2
    exit 1
  fi
done
if [[ ! -f "$ROOT/scripts/verify_profile.py" ]]; then
  printf 'Missing profile verifier\n' >&2
  exit 1
fi

# Rebuild unverified generated state exclusively from the pinned inputs below.
find "$PROFILE" -depth -type d \( \
  -name node_modules -o \
  -name runtime -o \
  -name python-tools -o \
  -name .pi-lens -o \
  -name .pi-subagents -o \
  -name .pytest_cache -o \
  -name .ruff_cache -o \
  -name .scratch -o \
  -name __pycache__ \
\) -exec rm -rf -- {} +

SETUP_HOME="$PROFILE/runtime/setup-home"
export HOME="$SETUP_HOME"
export XDG_CACHE_HOME="$PROFILE/runtime/xdg-cache"
export XDG_CONFIG_HOME="$PROFILE/runtime/xdg-config"
export XDG_STATE_HOME="$PROFILE/runtime/xdg-state"
mkdir -p "$HOME" "$XDG_CACHE_HOME" "$XDG_CONFIG_HOME" "$XDG_STATE_HOME"

file_sha256() {
  "$PYTHON" - "$1" <<'PY'
from hashlib import sha256
from pathlib import Path
import sys

print(sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
}

download_file() {
  local url=$1
  local destination=$2
  "$PYTHON" - "$url" "$destination" <<'PY'
from pathlib import Path
import sys
from urllib.request import urlopen

url = sys.argv[1]
destination = Path(sys.argv[2])
with urlopen(url, timeout=120) as response, destination.open("wb") as output:
    while chunk := response.read(1024 * 1024):
        output.write(chunk)
PY
}

install_tar_binary() {
  local name=$1
  local url=$2
  local expected_sha=$3
  local archive_member=$4
  local archive
  local extraction
  archive=$(mktemp "$PROFILE/runtime/.${name}-download.XXXXXX")
  extraction=$(mktemp -d "$PROFILE/runtime/.${name}-extract.XXXXXX")
  download_file "$url" "$archive"
  if [[ $(file_sha256 "$archive") != "$expected_sha" ]]; then
    printf '%s archive checksum mismatch\n' "$name" >&2
    return 1
  fi
  tar -xzf "$archive" -C "$extraction"
  install -m 0755 "$extraction/$archive_member" "$TOOLCHAIN_BIN/$name"
  rm -f -- "$archive"
  rm -rf -- "$extraction"
}

if [[ $(file_sha256 "$PROFILE/sources.lock.json") != "$SOURCES_LOCK_SHA256" ]]; then
  printf 'Profile source manifest checksum mismatch\n' >&2
  exit 1
fi
if [[ $(file_sha256 "$ROOT/scripts/verify_profile.py") != "$VERIFIER_SHA256" ]]; then
  printf 'Profile verifier checksum mismatch\n' >&2
  exit 1
fi
"$PYTHON" "$ROOT/scripts/verify_profile.py" "$PROFILE"

if [[ ! -x "$NODE" ]]; then
  mkdir -p "$PROFILE/runtime"
  archive=$(mktemp "$PROFILE/runtime/.node-download.XXXXXX")
  cleanup_archive() {
    rm -f -- "$archive"
  }
  trap cleanup_archive EXIT

  download_file "$NODE_URL" "$archive"

  actual_sha=$(file_sha256 "$archive")
  if [[ "$actual_sha" != "$NODE_SHA256" ]]; then
    printf 'Node archive checksum mismatch\n' >&2
    exit 1
  fi

  tar -xJf "$archive" -C "$PROFILE/runtime"
  cleanup_archive
  trap - EXIT
fi

if [[ $($NODE --version) != "v${NODE_VERSION}" ]]; then
  printf 'Pinned Node version check failed\n' >&2
  exit 1
fi

mkdir -p "$TOOLCHAIN_BIN"
install_tar_binary \
  rg "$RG_URL" "$RG_SHA256" \
  "ripgrep-${RG_VERSION}-x86_64-unknown-linux-musl/rg"
install_tar_binary \
  fd "$FD_URL" "$FD_SHA256" \
  "fd-v${FD_VERSION}-x86_64-unknown-linux-musl/fd"
rg_version=$($RG --version)
read -r rg_name actual_rg_version _ <<< "$rg_version"
if [[ $rg_name != "ripgrep" || $actual_rg_version != "$RG_VERSION" ]]; then
  printf 'Pinned ripgrep version check failed\n' >&2
  exit 1
fi
if [[ $($FD --version) != "fd ${FD_VERSION}" ]]; then
  printf 'Pinned fd version check failed\n' >&2
  exit 1
fi

export PATH="$NODE_RUNTIME/bin:$TOOLCHAIN_BIN:/usr/local/bin:/usr/bin:/bin"
mkdir -p "$NPM_LOGS"
export npm_config_cache="$NPM_CACHE"
export npm_config_logs_dir="$NPM_LOGS"
export npm_config_ignore_scripts=true
export npm_config_offline=false
npm ci --prefix "$PROFILE" --omit=dev --ignore-scripts --no-audit --no-fund

AST_GREP_PLATFORM="$PROFILE/node_modules/@ast-grep/cli-linux-x64-gnu"
TSX_ESBUILD_PLATFORM="$PROFILE/node_modules/tsx/node_modules/@esbuild/linux-x64/bin/esbuild"
for required in \
  "$AST_GREP_PLATFORM/ast-grep" \
  "$AST_GREP_PLATFORM/sg" \
  "$TSX_ESBUILD_PLATFORM"; do
  if [[ ! -x "$required" ]]; then
    printf 'Pinned lifecycle platform binary is missing: %s\n' "$required" >&2
    exit 1
  fi
done

if [[ -e "$PROFILE/node_modules/esbuild" || -e "$PROFILE/node_modules/@esbuild/linux-x64" ]]; then
  printf 'Development-only esbuild 0.27.7 entered the production install\n' >&2
  exit 1
fi

# Run only the two pinned lifecycle verifiers required by the Linux runtime.
export npm_config_offline=true
"$NODE" "$PROFILE/node_modules/@ast-grep/cli/postinstall.js"
"$NODE" "$PROFILE/node_modules/tsx/node_modules/esbuild/install.js"

for binary in ast-grep sg; do
  if [[ $(file_sha256 "$PROFILE/node_modules/@ast-grep/cli/$binary") != \
        $(file_sha256 "$AST_GREP_PLATFORM/$binary") ]]; then
    printf 'Pinned ast-grep binary copy mismatch: %s\n' "$binary" >&2
    exit 1
  fi
done
"$PROFILE/node_modules/.bin/sg" --version >/dev/null
ast_fixture=$(mktemp "$PROFILE/runtime/.ast-grep-smoke.XXXXXX.js")
ast_pattern="const \$A = \$B"
printf 'const answer = 42;\n' > "$ast_fixture"
ast_output=$("$PROFILE/node_modules/.bin/sg" run --pattern "$ast_pattern" --lang javascript "$ast_fixture")
rm -f -- "$ast_fixture"
if [[ $ast_output != *"const answer = 42"* ]]; then
  printf 'Pinned ast-grep functional check failed\n' >&2
  exit 1
fi
if [[ $("$PROFILE/node_modules/tsx/node_modules/.bin/esbuild" --version) != "0.28.1" ]]; then
  printf 'Pinned nested esbuild version check failed\n' >&2
  exit 1
fi

if [[ ! -f "$PI_ENTRY" ]]; then
  printf 'Pinned Pi entrypoint is missing: %s\n' "$PI_ENTRY" >&2
  exit 1
fi

actual_pi_version=$($NODE "$PI_ENTRY" --version)
if [[ "$actual_pi_version" != "$PI_VERSION" ]]; then
  printf 'Pinned Pi version mismatch: expected %s, got %s\n' \
    "$PI_VERSION" "$actual_pi_version" >&2
  exit 1
fi

(
  cd "$ROOT"
  "$PYTHON" -m scripts.check_profile_rpc
)

printf 'Installed ok-pi-agent runtime: Node %s, Pi %s, ripgrep %s, fd %s\n' \
  "$NODE_VERSION" "$PI_VERSION" "$RG_VERSION" "$FD_VERSION"
