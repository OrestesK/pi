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
SOURCES_LOCK_SHA256="36abf4aef6d58f4dcffc0967826146066c1af622225b509ffba84df89d46fcae"
VERIFIER_SHA256="bd2a2b94fb0604a3d8e2999d8d164f56405be40465586ef4e1c602be64d00866"
NODE_RUNTIME="$PROFILE/runtime/node-v${NODE_VERSION}-linux-x64"
NODE="$NODE_RUNTIME/bin/node"
TOOLCHAIN_BIN="$PROFILE/runtime/toolchain/bin"
RG="$TOOLCHAIN_BIN/rg"
FD="$TOOLCHAIN_BIN/fd"
PI_ENTRY="$PROFILE/node_modules/@earendil-works/pi-coding-agent/dist/cli.js"

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
export npm_config_ignore_scripts=false
npm ci --prefix "$PROFILE" --omit=dev

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
