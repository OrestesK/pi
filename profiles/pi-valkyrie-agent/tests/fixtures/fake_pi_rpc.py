from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from typing import cast


FINAL_MARKER_PREFIX = "BENCHMARK_FINAL:"


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


def emit_tool_events(count: int) -> None:
    if count <= 0:
        return
    emit(
        {
            "type": "tool_execution_start",
            "toolCallId": "ignored-start",
            "toolName": "read",
            "args": {"path": "task.txt"},
        }
    )
    emit({"type": "queue_update", "action": "ignored-event"})
    for index in range(count):
        emit(
            {
                "type": "tool_execution_end",
                "toolCallId": f"tool-{index}",
                "toolName": "read",
                "result": {"content": "done"},
                "isError": False,
            }
        )


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
    elif mode == "missing-active-tool":
        active.pop()
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
    parser.add_argument("--abort-observed-path")
    parser.add_argument("--tool-end-count", type=int, default=0)
    parser.add_argument("--expected-agent-prompt")
    parser.add_argument("--expected-mcp-servers", default="context-mode,context7")
    args, unknown = parser.parse_known_args()

    if "PI_CODEX_AUTH_JSON_B64" in os.environ:
        sys.stderr.write("obsolete Codex auth leaked to child\n")
        return 90
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        sys.stderr.write("OpenAI API key missing from child\n")
        return 98
    if "AWS_SECRET_ACCESS_KEY" in os.environ:
        sys.stderr.write("unrelated credential leaked to child\n")
        return 92
    if "TASK_ID" in os.environ:
        sys.stderr.write("task identity leaked to child\n")
        return 95
    if os.environ.get("LANG") != "C.UTF-8" or os.environ.get("LC_ALL") != "C.UTF-8":
        sys.stderr.write("child locale is not pinned\n")
        return 99

    agent_dir = Path(os.environ["PI_CODING_AGENT_DIR"])
    if agent_dir.stat().st_mode & 0o777 != 0o700:
        return 93
    if (agent_dir / "auth.json").exists():
        sys.stderr.write("credential file unexpectedly exists\n")
        return 94
    if (agent_dir / "AGENTS.md").exists():
        sys.stderr.write("discovered AGENTS.md unexpectedly exists\n")
        return 96
    append_prompts = [
        Path(unknown[index + 1]).read_text()
        for index, value in enumerate(unknown[:-1])
        if value == "--append-system-prompt"
    ]
    if args.expected_agent_prompt is not None and args.expected_agent_prompt not in append_prompts:
        sys.stderr.write("selected prompt was not explicitly supplied\n")
        return 96
    for required_flag in (
        "--no-approve",
        "--no-context-files",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--mcp-ignore-project-config",
    ):
        if required_flag not in unknown:
            sys.stderr.write(f"missing isolation flag: {required_flag}\n")
            return 96
    try:
        mcp_path = Path(unknown[unknown.index("--mcp-config") + 1])
    except (ValueError, IndexError):
        sys.stderr.write("runtime MCP config argument missing\n")
        return 96
    if os.environ.get("PI_PROFILE_MCP_CONFIG") != str(mcp_path):
        sys.stderr.write("runtime MCP config environment mismatch\n")
        return 96
    if mcp_path.stat().st_mode & 0o777 != 0o600:
        sys.stderr.write("runtime MCP config is not private\n")
        return 96
    mcp_document = json.loads(mcp_path.read_text())
    if sorted(mcp_document) != ["mcpServers"]:
        sys.stderr.write("runtime MCP config has unexpected fields\n")
        return 96
    expected_mcp_servers = cast(str, args.expected_mcp_servers)
    expected_servers = sorted(name for name in expected_mcp_servers.split(",") if name)
    if sorted(mcp_document["mcpServers"]) != expected_servers:
        sys.stderr.write("runtime MCP inventory mismatch\n")
        return 96

    write_tool_state(args.fake_mode)
    sys.stderr.write(f"stderr contains {api_key}\n")
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
                            "provider": "openai",
                            "id": "gpt-5.6-sol",
                        },
                        "thinkingLevel": ("max" if args.fake_mode == "wrong-thinking" else "high"),
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

            if args.fake_mode == "step-limit":
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
                if args.fake_child_pid_path:
                    Path(args.fake_child_pid_path).write_text(str(child.pid))
                emit_tool_events(args.tool_end_count)
                continue

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

            emit_tool_events(args.tool_end_count)
            if args.fake_mode == "timeout":
                child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(300)"])
                if args.fake_child_pid_path:
                    Path(args.fake_child_pid_path).write_text(str(child.pid))
                time.sleep(300)
                return 0

            compaction = Path(os.environ["PI_VALKYRIE_TOOL_STATE_PATH"]).parent / "compactions"
            compaction.mkdir(exist_ok=True)
            (compaction / "direct-artifact.txt").write_text(f"artifact contains {api_key}\n")
            if args.fake_mode not in {
                "settled-without-message",
                "stale-before-task-response",
                "stale-handshake-message",
            }:
                if args.fake_mode == "whitespace-message":
                    final_text = f"{final_marker}\n \n "
                elif args.fake_mode == "malformed-final":
                    final_text = f"not-the-start {final_marker}\nTask finished: {api_key}"
                else:
                    final_text = f"{final_marker}\nTask finished: {api_key}"
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
            if args.abort_observed_path:
                Path(args.abort_observed_path).write_text("abort observed\n")
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
