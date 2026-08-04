from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import threading
import time
from typing import Any, cast

import pytest

from run_agent import (
    BUNDLE_ROOT,
    BridgePaths,
    EXIT_AUTH,
    EXIT_OK,
    EXIT_PROTOCOL,
    EXIT_STARTUP,
    EXIT_TIMEOUT,
    EXIT_UNEXPECTED_PI_EXIT,
    MAX_TRUSTED_MCP_BYTES,
    MODEL_ID,
    MODEL_PROVIDER,
    VALS_MODEL_ID,
    BridgeFailure,
    parse_args,
    read_trusted_mcp_config,
    run_bridge,
)


FAKE_PI = Path(__file__).parent / "fixtures" / "fake_pi_rpc.py"
TEST_API_KEY = 'sk-test-quoted-"value"-\\line-next'


def write_static_profile(root: Path) -> Path:
    profile = root / "profile"
    profile.mkdir(parents=True)
    for name, value in {
        "settings.json": "{}\n",
        "mcp.json": json.dumps(
            {
                "mcpServers": {
                    "context7": {"url": "https://mcp.context7.com/mcp"},
                    "context-mode": {"command": "/bin/true"},
                }
            }
        )
        + "\n",
        "APPEND_SYSTEM.md": "Unattended test mode.\n",
        "sources.lock.json": '{"version": 1}\n',
    }.items():
        (profile / name).write_text(value)
    prompts = profile / "prompts"
    (prompts / "simple").mkdir(parents=True)
    (prompts / "adapted").mkdir()
    (prompts / "simple" / "AGENTS.md").write_text("# Simple test agent\n")
    (prompts / "adapted" / "AGENTS.md").write_text("# Adapted test agent\n")
    (profile / "allowed-tools.json").write_text(
        json.dumps({"version": 1, "tools": ["read", "bash", "edit", "write"]})
    )
    for name in (
        "extensions",
        "agents",
        "skills",
        "packages",
        "node_modules",
        "mcp-servers",
        "runtime",
    ):
        (profile / name).mkdir()
    return profile


def bridge_paths(tmp_path: Path, mode: str = "success", *extra: str) -> BridgePaths:
    return BridgePaths(
        static_profile=write_static_profile(tmp_path),
        log_dir=tmp_path / "logs",
        pi_command=(sys.executable, str(FAKE_PI), "--fake-mode", mode, *extra),
        runtime_parent=tmp_path / "runtime",
    )


def source_env() -> dict[str, str]:
    return {
        "OPENAI_API_KEY": TEST_API_KEY,
        "TASK_ID": "task-1",
        "PATH": os.environ["PATH"],
        "LANG": "de_DE.UTF-8",
        "LC_ALL": "fr_FR.UTF-8",
        "HTTPS_PROXY": "https://proxy-user:proxy-secret@proxy.invalid:8443",
        "AWS_SECRET_ACCESS_KEY": "must-not-reach-child",
    }


def read_json(path: Path) -> dict[str, Any]:
    value = cast(object, json.loads(path.read_text()))
    assert isinstance(value, dict)
    return cast(dict[str, Any], value)


def test_bundle_root_follows_runner_location() -> None:
    assert BUNDLE_ROOT == Path(__file__).resolve().parents[1]


def test_cli_accepts_only_the_pinned_vals_model(tmp_path: Path) -> None:
    problem = tmp_path / "problem.md"
    problem.write_text("Build the task")
    common = [
        "--problem-statement",
        str(problem),
        "--task-id",
        "task-1",
        "--prompt-profile",
        "simple",
    ]

    args = parse_args([*common, "--declared-model", VALS_MODEL_ID])
    assert args.declared_model == VALS_MODEL_ID
    assert f"{MODEL_PROVIDER}/{MODEL_ID}" == "openai/gpt-5.6-sol"

    with pytest.raises(SystemExit):
        parse_args([*common, "--declared-model", "openai/gpt-5.6-sol-high"])


def process_is_dead(pid: int) -> bool:
    stat = Path(f"/proc/{pid}/stat")
    if not stat.exists():
        return True
    fields = stat.read_text().split()
    return len(fields) > 2 and fields[2] == "Z"


@pytest.mark.parametrize("mode", ["success", "dialog", "malformed", "stale-after-final"])
@pytest.mark.parametrize("prompt_profile", ["simple", "adapted"])
def test_bridge_settles_and_redacts_all_artifacts(
    tmp_path: Path, mode: str, prompt_profile: str
) -> None:
    expected_prompt = f"# {prompt_profile.capitalize()} test agent\n"
    paths = bridge_paths(tmp_path, mode, "--expected-agent-prompt", expected_prompt)
    env = source_env()

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        prompt_profile=prompt_profile,
        timeout_seconds=5,
        paths=paths,
        source_env=env,
    )

    assert exit_code == EXIT_OK
    summary = read_json(paths.log_dir / "summary.json")
    assert summary["version"] == 2
    assert summary["outcome"] == "agent_settled"
    assert summary["agentSettled"] is True
    assert summary["finalMessageObserved"] is True
    assert "terminalGoalState" not in summary
    assert summary["taskId"] == "task-1"
    assert summary["promptProfile"] == prompt_profile
    selected_prompt = paths.static_profile / "prompts" / prompt_profile / "AGENTS.md"
    assert summary["promptSha256"] == hashlib.sha256(selected_prompt.read_bytes()).hexdigest()
    assert summary["model"] == "openai/gpt-5.6-sol"
    assert summary["valsModel"] == "openai/gpt-5.6-sol"
    assert summary["requestedThinkingLevel"] == "high"
    assert summary["effectiveThinkingLevel"] == "high"
    assert summary["toolState"] == {
        "version": 1,
        "allowedTools": ["read", "bash", "edit", "write"],
        "registeredTools": ["read", "bash", "edit", "write"],
        "activeTools": ["read", "bash", "edit", "write"],
    }
    assert (paths.log_dir / "final_message.txt").read_text().startswith("Task finished:")
    assert not (paths.log_dir / "goal-state.json").exists()

    artifact_text = "\n".join(
        path.read_text() for path in paths.log_dir.rglob("*") if path.is_file()
    )
    assert TEST_API_KEY not in artifact_text
    assert env["HTTPS_PROXY"] not in artifact_text
    assert "proxy-user" not in artifact_text
    assert "proxy-secret" not in artifact_text
    assert "[REDACTED]" in artifact_text
    if mode == "malformed":
        assert "not-json-output" in (paths.log_dir / "raw_output.txt").read_text()
    assert not any(paths.runtime_parent.iterdir())


def test_missing_api_key_stops_before_process_start(tmp_path: Path) -> None:
    paths = bridge_paths(tmp_path)
    env = source_env()
    env.pop("OPENAI_API_KEY")

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=5,
        paths=paths,
        source_env=env,
    )

    assert exit_code == EXIT_AUTH
    summary = read_json(paths.log_dir / "summary.json")
    assert summary["errorClass"] == "auth"
    assert summary["promptProfile"] == "simple"
    selected_prompt = paths.static_profile / "prompts" / "simple" / "AGENTS.md"
    assert summary["promptSha256"] == hashlib.sha256(selected_prompt.read_bytes()).hexdigest()


def test_external_trusted_mcp_config_is_merged_and_cleaned(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.chdir(workspace)
    trusted = tmp_path / "trusted-mcp.json"
    trusted.write_text(
        json.dumps({"mcpServers": {"infrastructure": {"url": "http://service.invalid/mcp"}}})
    )
    paths = bridge_paths(
        tmp_path / "bundle",
        "success",
        "--expected-mcp-servers",
        "context-mode,context7,infrastructure",
    )

    exit_code = run_bridge(
        problem_statement=workspace / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=5,
        paths=paths,
        source_env=source_env(),
        trusted_mcp_config=trusted,
    )

    assert exit_code == EXIT_OK
    assert not any(paths.runtime_parent.iterdir())


@pytest.mark.parametrize(
    "case",
    [
        "relative",
        "workspace",
        "symlink",
        "intermediate-symlink",
        "directory",
        "oversized",
        "malformed",
        "imports",
        "collision",
    ],
)
def test_invalid_trusted_mcp_config_stops_before_pi(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    case: str,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    monkeypatch.chdir(workspace)
    external = tmp_path / "trusted-mcp.json"
    external.write_text('{"mcpServers": {}}')
    trusted: Path = external
    if case == "relative":
        trusted = Path("trusted-mcp.json")
        (workspace / trusted).write_text('{"mcpServers": {}}')
    elif case == "workspace":
        trusted = workspace / "trusted-mcp.json"
        trusted.write_text('{"mcpServers": {}}')
    elif case == "symlink":
        trusted = tmp_path / "trusted-link.json"
        trusted.symlink_to(external)
    elif case == "intermediate-symlink":
        actual_parent = tmp_path / "actual-parent"
        actual_parent.mkdir()
        (actual_parent / "trusted-mcp.json").write_text('{"mcpServers": {}}')
        linked_parent = tmp_path / "linked-parent"
        linked_parent.symlink_to(actual_parent, target_is_directory=True)
        trusted = linked_parent / "trusted-mcp.json"
    elif case == "directory":
        trusted = tmp_path / "trusted-directory"
        trusted.mkdir()
    elif case == "oversized":
        external.write_bytes(b" " * (MAX_TRUSTED_MCP_BYTES + 1))
    elif case == "malformed":
        external.write_text("not-json")
    elif case == "imports":
        external.write_text('{"mcpServers": {}, "imports": ["vscode"]}')
    elif case == "collision":
        external.write_text('{"mcpServers": {"context7": {"url": "http://replace.invalid"}}}')

    paths = bridge_paths(tmp_path / "bundle")
    exit_code = run_bridge(
        problem_statement=workspace / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=5,
        paths=paths,
        source_env=source_env(),
        trusted_mcp_config=trusted,
    )

    assert exit_code == EXIT_STARTUP
    assert read_json(paths.log_dir / "summary.json")["errorClass"] == "startup"
    assert not any(paths.runtime_parent.iterdir())


def test_no_writer_trusted_mcp_fifo_rejects_without_blocking(tmp_path: Path) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    trusted = tmp_path / "trusted-mcp.fifo"
    os.mkfifo(trusted)
    probe = """
from pathlib import Path
import sys
from run_agent import BridgeFailure, EXIT_STARTUP, read_trusted_mcp_config
try:
    read_trusted_mcp_config(Path(sys.argv[1]), Path(sys.argv[2]))
except BridgeFailure as error:
    if error.exit_code == EXIT_STARTUP and error.error_class == "startup":
        print(str(error))
        raise SystemExit(0)
    raise
raise SystemExit("FIFO unexpectedly accepted")
"""

    result = subprocess.run(
        [sys.executable, "-c", probe, str(trusted), str(workspace)],
        cwd=BUNDLE_ROOT,
        capture_output=True,
        text=True,
        timeout=2,
        check=False,
    )

    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "trusted MCP config must be a regular file"


def test_trusted_mcp_descriptor_rejects_parent_rename_after_open(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workspace = tmp_path / "workspace"
    workspace.mkdir()
    trusted_parent = tmp_path / "trusted-parent"
    trusted_parent.mkdir()
    trusted = trusted_parent / "trusted-mcp.json"
    trusted.write_text('{"mcpServers": {}}')
    renamed_parent = tmp_path / "renamed-parent"
    original_open = os.open
    renamed = False

    def open_and_rename(
        path: str | bytes | os.PathLike[str] | os.PathLike[bytes],
        flags: int,
        mode: int = 0o777,
        *,
        dir_fd: int | None = None,
    ) -> int:
        nonlocal renamed
        descriptor = original_open(path, flags, mode, dir_fd=dir_fd)
        if path == trusted.name and dir_fd is not None and not renamed:
            trusted_parent.rename(renamed_parent)
            renamed = True
        return descriptor

    monkeypatch.setattr(os, "open", open_and_rename)
    with pytest.raises(BridgeFailure, match="path changed"):
        read_trusted_mcp_config(trusted, workspace)


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        ("handshake-reject", EXIT_STARTUP),
        ("handshake-exit", EXIT_STARTUP),
        ("wrong-thinking", EXIT_STARTUP),
        ("missing-tool-state", EXIT_STARTUP),
        ("extra-active-tool", EXIT_STARTUP),
        ("missing-active-tool", EXIT_STARTUP),
        ("reject", EXIT_PROTOCOL),
        ("settled-without-message", EXIT_PROTOCOL),
        ("stale-before-task-response", EXIT_PROTOCOL),
        ("stale-handshake-message", EXIT_PROTOCOL),
        ("whitespace-message", EXIT_PROTOCOL),
        ("malformed-final", EXIT_PROTOCOL),
        ("duplicate-final", EXIT_PROTOCOL),
        ("unexpected-exit", EXIT_UNEXPECTED_PI_EXIT),
        ("exit-with-child", EXIT_UNEXPECTED_PI_EXIT),
    ],
)
def test_bridge_maps_protocol_and_process_failures(
    tmp_path: Path, mode: str, expected: int
) -> None:
    paths = bridge_paths(tmp_path, mode)

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=5,
        paths=paths,
        source_env=source_env(),
    )

    assert exit_code == expected
    summary = read_json(paths.log_dir / "summary.json")
    assert summary["promptProfile"] == "simple"
    selected_prompt = paths.static_profile / "prompts" / "simple" / "AGENTS.md"
    assert summary["promptSha256"] == hashlib.sha256(selected_prompt.read_bytes()).hexdigest()


def test_unexpected_pi_exit_kills_surviving_descendant(tmp_path: Path) -> None:
    child_pid_path = tmp_path / "orphan.pid"
    paths = bridge_paths(
        tmp_path,
        "exit-with-child",
        "--fake-child-pid-path",
        str(child_pid_path),
    )

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=5,
        paths=paths,
        source_env=source_env(),
    )

    assert exit_code == EXIT_UNEXPECTED_PI_EXIT
    child_pid = int(child_pid_path.read_text())
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline and not process_is_dead(child_pid):
        time.sleep(0.02)
    child_was_dead = process_is_dead(child_pid)
    if not child_was_dead:
        os.kill(child_pid, signal.SIGKILL)
    assert child_was_dead


def test_deadline_kills_pi_process_group_and_descendant(tmp_path: Path) -> None:
    child_pid_path = tmp_path / "child.pid"
    paths = bridge_paths(
        tmp_path,
        "timeout",
        "--fake-child-pid-path",
        str(child_pid_path),
    )

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        prompt_profile="simple",
        timeout_seconds=0.5,
        paths=paths,
        source_env=source_env(),
    )

    assert exit_code == EXIT_TIMEOUT
    child_pid = int(child_pid_path.read_text())
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline and not process_is_dead(child_pid):
        time.sleep(0.02)
    assert process_is_dead(child_pid)


def test_stop_event_uses_timeout_cleanup_path(tmp_path: Path) -> None:
    paths = bridge_paths(tmp_path, "timeout")
    stop_event = threading.Event()
    timer = threading.Timer(0.2, stop_event.set)
    timer.start()
    try:
        exit_code = run_bridge(
            problem_statement=tmp_path / "problem.md",
            problem_text="Fix the task",
            prompt_profile="simple",
            timeout_seconds=30,
            paths=paths,
            source_env=source_env(),
            stop_event=stop_event,
        )
    finally:
        timer.cancel()

    assert exit_code == EXIT_TIMEOUT
