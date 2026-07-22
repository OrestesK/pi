from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import cast


FINAL_MARKER_PREFIX = "VALKYRIE_FINAL:"


def emit(payload: dict[str, object]) -> None:
    sys.stdout.write(json.dumps(payload) + "\n")
    sys.stdout.flush()


def read_command() -> dict[str, object] | None:
    line = sys.stdin.readline()
    if not line:
        return None
    value = cast(object, json.loads(line))
    assert isinstance(value, dict)
    return cast(dict[str, object], value)


def auth_values() -> tuple[str, str]:
    agent_dir = Path(os.environ["PI_CODING_AGENT_DIR"])
    auth = json.loads((agent_dir / "auth.json").read_text())
    credential = auth["openai-codex"]
    return credential["access"], credential["refresh"]


def write_tool_state(mode: str) -> None:
    if mode == "missing-tool-state":
        return
    agent_dir = Path(os.environ["PI_CODING_AGENT_DIR"])
    allowed_document = json.loads((agent_dir / "allowed-tools.json").read_text())
    allowed = allowed_document["tools"]
    active = list(allowed)
    registered = list(allowed)
    if mode == "extra-active-tool":
        active.append("future_unknown")
        registered.append("future_unknown")
    Path(os.environ["PI_VALKYRIE_TOOL_STATE_PATH"]).write_text(
        json.dumps(
            {
                "version": 1,
                "allowedTools": allowed,
                "registeredTools": registered,
                "activeTools": active,
            }
        )
    )


def main() -> int:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--fake-mode", default="success")
    parser.add_argument("--fake-child-pid-path")
    args, _ = parser.parse_known_args()

    if "PI_CODEX_AUTH_JSON_B64" in os.environ:
        sys.stderr.write("base64 auth leaked to child\n")
        return 90
    if "AWS_SECRET_ACCESS_KEY" in os.environ:
        sys.stderr.write("unrelated credential leaked to child\n")
        return 92
    if "TASK_ID" in os.environ:
        sys.stderr.write("task identity leaked to child\n")
        return 95

    agent_dir = Path(os.environ["PI_CODING_AGENT_DIR"])
    if agent_dir.stat().st_mode & 0o777 != 0o700:
        return 93
    if (agent_dir / "auth.json").stat().st_mode & 0o777 != 0o600:
        return 94

    access, refresh = auth_values()
    write_tool_state(args.fake_mode)
    sys.stderr.write(f"stderr contains {refresh}\n")
    if proxy := os.environ.get("HTTPS_PROXY"):
        sys.stderr.write(f"proxy contains {proxy} and proxy-secret\n")
    sys.stderr.flush()

    while command := read_command():
        command_type = command.get("type")
        request_id = command.get("id")

        if command_type == "get_state":
            if args.fake_mode == "handshake-reject":
                emit(
                    {
                        "id": request_id,
                        "type": "response",
                        "command": "get_state",
                        "success": False,
                        "error": "handshake rejected",
                    }
                )
                continue
            if args.fake_mode == "handshake-exit":
                return 8
            if args.fake_mode == "stale-handshake-message" and request_id == "handshake":
                emit(
                    {
                        "type": "message_end",
                        "message": {
                            "role": "assistant",
                            "content": [{"type": "text", "text": "stale startup text"}],
                        },
                    }
                )
                emit({"type": "agent_settled"})
            emit(
                {
                    "id": request_id,
                    "type": "response",
                    "command": "get_state",
                    "success": True,
                    "data": {
                        "model": {
                            "provider": "openai-codex",
                            "id": "gpt-5.6-sol",
                        },
                        "thinkingLevel": (
                            "high" if args.fake_mode == "wrong-thinking" else "xhigh"
                        ),
                        "isStreaming": False,
                        "messageCount": 1,
                    },
                }
            )
            continue

        if command_type == "prompt":
            task_message = command.get("message")
            if not isinstance(task_message, str) or not task_message.startswith("Fix the task\n\n"):
                sys.stderr.write("unexpected task prompt\n")
                return 96
            final_markers = [
                line for line in task_message.splitlines() if line.startswith(FINAL_MARKER_PREFIX)
            ]
            if len(final_markers) != 1:
                sys.stderr.write("missing or duplicate final marker\n")
                return 97
            final_marker = final_markers[0]
            if args.fake_mode == "reject":
                emit(
                    {
                        "id": request_id,
                        "type": "response",
                        "command": "prompt",
                        "success": False,
                        "error": "prompt rejected",
                    }
                )
                continue

            if args.fake_mode == "unexpected-exit":
                return 7
            if args.fake_mode == "exit-with-child":
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
                if args.fake_child_pid_path:
                    Path(args.fake_child_pid_path).write_text(str(child.pid))
                return 8

            if args.fake_mode == "dialog":
                emit(
                    {
                        "type": "extension_ui_request",
                        "id": "dialog-1",
                        "method": "select",
                        "title": "Should not wait",
                        "options": ["yes", "no"],
                    }
                )
                response = read_command()
                if response != {
                    "type": "extension_ui_response",
                    "id": "dialog-1",
                    "cancelled": True,
                }:
                    return 91

            if args.fake_mode == "stale-before-task-response":
                emit(
                    {
                        "type": "message_end",
                        "message": {
                            "role": "assistant",
                            "content": [{"type": "text", "text": "stale pre-ack text"}],
                        },
                    }
                )
                emit({"type": "agent_settled"})

            emit(
                {
                    "id": request_id,
                    "type": "response",
                    "command": "prompt",
                    "success": True,
                }
            )

            if args.fake_mode == "malformed":
                sys.stdout.write("not-json-output\n")
                sys.stdout.flush()

            if args.fake_mode == "timeout":
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
                if args.fake_child_pid_path:
                    Path(args.fake_child_pid_path).write_text(str(child.pid))
                time.sleep(300)
                return 0

            compaction = Path(os.environ["PI_VALKYRIE_TOOL_STATE_PATH"]).parent / "compactions"
            compaction.mkdir(exist_ok=True)
            (compaction / "direct-artifact.txt").write_text(f"artifact contains {access}\n")
            if args.fake_mode not in {
                "settled-without-message",
                "stale-before-task-response",
                "stale-handshake-message",
            }:
                if args.fake_mode == "whitespace-message":
                    final_text = f"{final_marker}\n \n "
                elif args.fake_mode == "malformed-final":
                    final_text = f"not-the-start {final_marker}\nTask finished: {access}"
                else:
                    final_text = f"{final_marker}\nTask finished: {access}"
                emit(
                    {
                        "type": "message_end",
                        "message": {
                            "role": "assistant",
                            "content": [{"type": "text", "text": final_text}],
                        },
                    }
                )
                if args.fake_mode == "duplicate-final":
                    emit(
                        {
                            "type": "message_end",
                            "message": {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": f"{final_marker}\nDuplicate final response",
                                    }
                                ],
                            },
                        }
                    )
                if args.fake_mode == "stale-after-final":
                    emit(
                        {
                            "type": "message_end",
                            "message": {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": "Notifications are stale; no additional changes needed.",
                                    }
                                ],
                            },
                        }
                    )
            emit({"type": "agent_settled"})
            continue

        if command_type == "abort":
            emit(
                {
                    "id": request_id,
                    "type": "response",
                    "command": "abort",
                    "success": True,
                }
            )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
