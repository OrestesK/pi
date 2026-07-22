from __future__ import annotations

import base64
import json
import os
from pathlib import Path
import signal
import sys
import threading
import time
from typing import Any, cast

import pytest

from run_agent import (
    BridgePaths,
    EXIT_AUTH,
    EXIT_OK,
    EXIT_PROTOCOL,
    EXIT_STARTUP,
    EXIT_TIMEOUT,
    EXIT_UNEXPECTED_PI_EXIT,
    run_bridge,
)


FAKE_PI = Path(__file__).parent / "fixtures" / "fake_pi_rpc.py"


def write_static_profile(root: Path) -> Path:
    profile = root / "profile"
    profile.mkdir()
    for name, value in {
        "settings.json": "{}\n",
        "models.json": "{}\n",
        "mcp.json": "{}\n",
        "AGENTS.md": "# Test agent\n",
        "APPEND_SYSTEM.md": "Unattended test mode.\n",
        "sources.lock.json": '{"version": 1}\n',
    }.items():
        (profile / name).write_text(value)
    (profile / "allowed-tools.json").write_text(
        json.dumps({"version": 1, "tools": ["read", "bash", "edit", "write"]})
    )
    for name in (
        "extensions",
        "themes",
        "packages",
        "node_modules",
        "mcp-servers",
        "runtime",
    ):
        (profile / name).mkdir()
    return profile


def encoded_auth() -> tuple[str, dict[str, Any]]:
    auth = {
        "openai-codex": {
            "access": 'access-secret-"quoted"\\line\nnext',
            "refresh": "refresh-secret-value",
            "expires": 4_102_444_800_000,
        }
    }
    encoded = base64.b64encode(json.dumps(auth).encode()).decode()
    return encoded, auth


def bridge_paths(tmp_path: Path, mode: str = "success", *extra: str) -> BridgePaths:
    return BridgePaths(
        static_profile=write_static_profile(tmp_path),
        log_dir=tmp_path / "logs",
        pi_command=(sys.executable, str(FAKE_PI), "--fake-mode", mode, *extra),
        runtime_parent=tmp_path / "runtime",
    )


def source_env() -> dict[str, str]:
    encoded, _ = encoded_auth()
    return {
        "PI_CODEX_AUTH_JSON_B64": encoded,
        "TASK_ID": "task-1",
        "PATH": os.environ["PATH"],
        "LANG": "C.UTF-8",
        "HTTPS_PROXY": "https://proxy-user:proxy-secret@proxy.invalid:8443",
        "AWS_SECRET_ACCESS_KEY": "must-not-reach-child",
    }


def read_json(path: Path) -> dict[str, Any]:
    value = cast(object, json.loads(path.read_text()))
    assert isinstance(value, dict)
    return cast(dict[str, Any], value)


def process_is_dead(pid: int) -> bool:
    stat = Path(f"/proc/{pid}/stat")
    if not stat.exists():
        return True
    fields = stat.read_text().split()
    return len(fields) > 2 and fields[2] == "Z"


@pytest.mark.parametrize("mode", ["success", "dialog", "malformed"])
def test_bridge_settles_and_redacts_all_artifacts(tmp_path: Path, mode: str) -> None:
    paths = bridge_paths(tmp_path, mode)
    env = source_env()

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
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
    assert summary["requestedThinkingLevel"] == "max"
    assert summary["effectiveThinkingLevel"] == "xhigh"
    assert summary["toolState"] == {
        "version": 1,
        "allowedTools": ["read", "bash", "edit", "write"],
        "registeredTools": ["read", "bash", "edit", "write"],
        "activeTools": ["read", "bash", "edit", "write"],
    }
    assert (paths.log_dir / "final_message.txt").read_text().startswith("Task finished:")
    assert not (paths.log_dir / "goal-state.json").exists()

    encoded, auth = encoded_auth()
    artifact_text = "\n".join(
        path.read_text() for path in paths.log_dir.rglob("*") if path.is_file()
    )
    assert encoded not in artifact_text
    assert auth["openai-codex"]["access"] not in artifact_text
    assert auth["openai-codex"]["refresh"] not in artifact_text
    assert env["HTTPS_PROXY"] not in artifact_text
    assert "proxy-user" not in artifact_text
    assert "proxy-secret" not in artifact_text
    assert "[REDACTED]" in artifact_text
    if mode == "malformed":
        assert "not-json-output" in (paths.log_dir / "raw_output.txt").read_text()
    assert not any(paths.runtime_parent.iterdir())


@pytest.mark.parametrize("encoded", ["", "not-base64"])
def test_invalid_auth_stops_before_process_start(tmp_path: Path, encoded: str) -> None:
    paths = bridge_paths(tmp_path)
    env = source_env()
    env["PI_CODEX_AUTH_JSON_B64"] = encoded

    exit_code = run_bridge(
        problem_statement=tmp_path / "problem.md",
        problem_text="Fix the task",
        timeout_seconds=5,
        paths=paths,
        source_env=env,
    )

    assert exit_code == EXIT_AUTH
    assert read_json(paths.log_dir / "summary.json")["errorClass"] == "auth"


@pytest.mark.parametrize(
    ("mode", "expected"),
    [
        ("handshake-reject", EXIT_STARTUP),
        ("handshake-exit", EXIT_STARTUP),
        ("wrong-thinking", EXIT_STARTUP),
        ("missing-tool-state", EXIT_STARTUP),
        ("extra-active-tool", EXIT_STARTUP),
        ("reject", EXIT_PROTOCOL),
        ("settled-without-message", EXIT_PROTOCOL),
        ("stale-before-task-response", EXIT_PROTOCOL),
        ("stale-handshake-message", EXIT_PROTOCOL),
        ("whitespace-message", EXIT_PROTOCOL),
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
        timeout_seconds=5,
        paths=paths,
        source_env=source_env(),
    )

    assert exit_code == expected


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
            timeout_seconds=30,
            paths=paths,
            source_env=source_env(),
            stop_event=stop_event,
        )
    finally:
        timer.cancel()

    assert exit_code == EXIT_TIMEOUT
