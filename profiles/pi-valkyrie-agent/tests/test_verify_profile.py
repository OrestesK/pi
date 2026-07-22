from __future__ import annotations

import json
from pathlib import Path

import pytest

from scripts.verify_profile import (
    ProfileVerificationError,
    hash_directory,
    hash_file,
    verify_profile,
)


def write_manifest(profile: Path) -> None:
    manifest = {
        "version": 1,
        "contentHashes": {
            "files": {"settings.json": hash_file(profile / "settings.json")},
            "directories": {"packages/example": hash_directory(profile / "packages/example")},
        },
    }
    (profile / "sources.lock.json").write_text(json.dumps(manifest))


def test_profile_hash_verification_accepts_exact_content_and_ignores_generated_dirs(
    tmp_path: Path,
) -> None:
    profile = tmp_path / "profile"
    package = profile / "packages" / "example"
    package.mkdir(parents=True)
    (profile / "settings.json").write_text('{"defaultModel":"gpt-5.6-sol"}\n')
    (package / "index.ts").write_text("export const value = 1;\n")
    generated = package / "node_modules" / "dependency"
    generated.mkdir(parents=True)
    (generated / "index.js").write_text("generated\n")
    write_manifest(profile)

    verify_profile(profile)

    (generated / "index.js").write_text("changed generated content\n")
    verify_profile(profile)


def test_profile_hash_verification_rejects_changed_source(tmp_path: Path) -> None:
    profile = tmp_path / "profile"
    package = profile / "packages" / "example"
    package.mkdir(parents=True)
    (profile / "settings.json").write_text("{}\n")
    (package / "index.ts").write_text("export const value = 1;\n")
    write_manifest(profile)
    (package / "index.ts").write_text("export const value = 2;\n")

    with pytest.raises(ProfileVerificationError, match="packages/example"):
        verify_profile(profile)
