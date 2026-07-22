from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_setup_uses_only_pinned_bundle_local_runtime() -> None:
    script = (ROOT / "setup.sh").read_text()

    assert 'NODE_VERSION="26.4.0"' in script
    assert 'NODE_ARCHIVE="node-v${NODE_VERSION}-linux-x64.tar.xz"' in script
    assert "5c4286dcd5bbd5acb1ccc7eb0e088bd5eb1e3affad671ee9364004f8f6a4a431" in script
    assert 'PI_VERSION="0.80.6"' in script
    assert 'PYTHON="/usr/local/bin/python3"' in script
    assert 'PYTHON="/usr/bin/python3"' in script
    assert 'npm ci --prefix "$PROFILE" --omit=dev' in script
    assert 'RG_VERSION="15.2.0"' in script
    assert 'FD_VERSION="10.4.2"' in script
    assert "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c" in script
    assert "e3257d48e29a6be965187dbd24ce9af564e0fe67b3e73c9bdcd180f4ec11bdde" in script
    assert "install_tar_binary \\\n  rg " in script
    assert "install_tar_binary \\\n  fd " in script
    assert "python-requirements.lock" not in script
    assert 'SOURCES_LOCK_SHA256="' in script
    assert 'VERIFIER_SHA256="' in script
    assert '"$PYTHON" "$ROOT/scripts/verify_profile.py" "$PROFILE"' in script
    assert "docent-mcp" not in script
    assert "node_modules/@earendil-works/pi-coding-agent/dist/cli.js" in script
    assert '"$PYTHON" -m scripts.check_profile_rpc' in script
    assert "sudo" not in script
    assert "npm install -g" not in script
    assert "command -v pi" not in script


def test_setup_does_not_clone_or_mutate_other_repositories() -> None:
    script = (ROOT / "setup.sh").read_text()

    assert "git clone" not in script
    assert "git submodule" not in script
    assert "git checkout" not in script
