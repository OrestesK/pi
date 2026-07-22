from __future__ import annotations

import argparse
from hashlib import sha256
import json
from pathlib import Path, PurePosixPath
from typing import cast


TRANSPORT_EXCLUDED_NAMES = frozenset(
    {
        "__pycache__",
        ".pyc",
        ".pyo",
        ".pyd",
        ".so",
        ".dll",
        ".dylib",
        ".egg-info",
        ".git",
        ".venv",
        "venv",
        ".env",
        ".DS_Store",
    }
)
GENERATED_DIRECTORY_NAMES = frozenset(
    {
        ".pi-lens",
        ".pi-subagents",
        ".pytest_cache",
        ".ruff_cache",
        ".scratch",
        "__pycache__",
        "node_modules",
        "python-tools",
        "runtime",
    }
)
HASH_EXCLUDED_DIRECTORY_NAMES = TRANSPORT_EXCLUDED_NAMES | GENERATED_DIRECTORY_NAMES

JsonObject = dict[str, object]


class ProfileVerificationError(Exception):
    pass


def hash_file(path: Path) -> str:
    return sha256(path.read_bytes()).hexdigest()


def hash_directory(path: Path) -> str:
    if not path.is_dir():
        raise ProfileVerificationError(f"profile directory is missing: {path}")
    digest = sha256()
    for candidate in sorted(path.rglob("*")):
        relative = candidate.relative_to(path)
        if any(part in HASH_EXCLUDED_DIRECTORY_NAMES for part in relative.parts):
            continue
        if candidate.is_symlink():
            raise ProfileVerificationError(f"profile source cannot contain symlink: {candidate}")
        if not candidate.is_file() or any(
            fragment in candidate.name for fragment in TRANSPORT_EXCLUDED_NAMES
        ):
            continue
        relative_bytes = relative.as_posix().encode()
        digest.update(len(relative_bytes).to_bytes(8, "big"))
        digest.update(relative_bytes)
        digest.update(bytes.fromhex(hash_file(candidate)))
    return digest.hexdigest()


def checked_relative_path(profile: Path, value: object) -> tuple[str, Path]:
    if not isinstance(value, str):
        raise ProfileVerificationError("profile hash path must be a string")
    relative = PurePosixPath(value)
    if relative.is_absolute() or ".." in relative.parts or not relative.parts:
        raise ProfileVerificationError(f"invalid profile hash path: {value}")
    return value, profile.joinpath(*relative.parts)


def hash_entries(value: object, label: str) -> JsonObject:
    if not isinstance(value, dict):
        raise ProfileVerificationError(f"contentHashes.{label} must be an object")
    return cast(JsonObject, value)


def verify_profile(profile: Path) -> None:
    try:
        raw = cast(object, json.loads((profile / "sources.lock.json").read_text()))
    except (OSError, json.JSONDecodeError) as error:
        raise ProfileVerificationError("invalid sources.lock.json") from error
    if not isinstance(raw, dict):
        raise ProfileVerificationError("sources.lock.json must be an object")
    manifest = cast(JsonObject, raw)
    content_hashes = manifest.get("contentHashes")
    if not isinstance(content_hashes, dict):
        raise ProfileVerificationError("sources.lock.json has no contentHashes")
    hashes = cast(JsonObject, content_hashes)
    files = hash_entries(hashes.get("files"), "files")
    directories = hash_entries(hashes.get("directories"), "directories")

    for raw_path, expected in files.items():
        relative, path = checked_relative_path(profile, raw_path)
        if not isinstance(expected, str) or not path.is_file():
            raise ProfileVerificationError(f"profile file is missing: {relative}")
        actual = hash_file(path)
        if actual != expected:
            raise ProfileVerificationError(f"profile file hash mismatch: {relative}")

    for raw_path, expected in directories.items():
        relative, path = checked_relative_path(profile, raw_path)
        if not isinstance(expected, str):
            raise ProfileVerificationError(f"invalid directory hash: {relative}")
        actual = hash_directory(path)
        if actual != expected:
            raise ProfileVerificationError(f"profile directory hash mismatch: {relative}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify pinned Pi profile content hashes")
    parser.add_argument("profile", type=Path)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    profile = cast(Path, args.profile)
    try:
        verify_profile(profile)
    except ProfileVerificationError as error:
        print(str(error))
        return 1
    print("profile-content-verified")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
