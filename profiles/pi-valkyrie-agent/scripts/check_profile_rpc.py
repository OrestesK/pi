from __future__ import annotations

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from typing import cast

from run_agent import (
    BridgePaths,
    EFFECTIVE_THINKING_LEVELS,
    MODEL_ID,
    MODEL_PROVIDER,
    PROFILE_LINKS,
    THINKING_LEVEL,
    build_pi_argv,
    load_allowed_tools,
    validate_tool_state,
)


MCP_PROTOCOL_VERSION = "2025-03-26"
CONTEXT7_CONFIG: dict[str, object] = {
    "url": "https://mcp.context7.com/mcp",
    "auth": False,
    "oauth": False,
    "lifecycle": "lazy",
}
EXPECTED_LOCAL_MCP_TOOLS = {
    "context-mode": {
        "ctx_execute",
        "ctx_execute_file",
        "ctx_index",
        "ctx_search",
        "ctx_fetch_and_index",
        "ctx_batch_execute",
        "ctx_stats",
        "ctx_doctor",
        "ctx_upgrade",
        "ctx_purge",
        "ctx_insight",
    },
}


def checked_json_lines(output: str, server_name: str) -> list[dict[str, object]]:
    values: list[dict[str, object]] = []
    for line in output.splitlines():
        if not line.strip():
            continue
        try:
            value = cast(object, json.loads(line))
        except json.JSONDecodeError as error:
            raise RuntimeError(f"{server_name} emitted non-JSON protocol output") from error
        if not isinstance(value, dict):
            raise RuntimeError(f"{server_name} emitted a non-object protocol message")
        values.append(cast(dict[str, object], value))
    return values


def check_mcp_servers(profile: Path, env: dict[str, str]) -> dict[str, list[str]]:
    document = cast(object, json.loads((profile / "mcp.json").read_text()))
    if not isinstance(document, dict):
        raise RuntimeError("mcp.json must be an object")
    raw_servers = cast(dict[str, object], document).get("mcpServers")
    if not isinstance(raw_servers, dict):
        raise RuntimeError("mcp.json has no mcpServers object")
    servers = cast(dict[str, object], raw_servers)
    if set(servers) != set(EXPECTED_LOCAL_MCP_TOOLS) | {"context7"}:
        raise RuntimeError("unexpected MCP server inventory")
    if servers["context7"] != CONTEXT7_CONFIG:
        raise RuntimeError("invalid Context7 MCP definition")

    raw_context_mode = servers["context-mode"]
    if not isinstance(raw_context_mode, dict):
        raise RuntimeError("invalid context-mode MCP definition")
    context_mode = cast(dict[str, object], raw_context_mode)
    if context_mode.get("excludeTools") != ["ctx_fetch_and_index"]:
        raise RuntimeError("context-mode URL fetch exclusion is missing")

    observed: dict[str, list[str]] = {}
    for server_name, expected_tools in EXPECTED_LOCAL_MCP_TOOLS.items():
        raw_definition = servers[server_name]
        if not isinstance(raw_definition, dict):
            raise RuntimeError(f"invalid MCP definition: {server_name}")
        definition = cast(dict[str, object], raw_definition)
        command = definition.get("command")
        raw_args = definition.get("args")
        if not isinstance(command, str) or not isinstance(raw_args, list):
            raise RuntimeError(f"invalid MCP command: {server_name}")
        args = cast(list[object], raw_args)
        if not all(isinstance(arg, str) for arg in args):
            raise RuntimeError(f"invalid MCP arguments: {server_name}")
        argv = [command, *(cast(str, arg) for arg in args)]
        requests: list[dict[str, object]] = [
            {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": MCP_PROTOCOL_VERSION,
                    "capabilities": {},
                    "clientInfo": {"name": "ok-pi-agent-check", "version": "1"},
                },
            },
            {"jsonrpc": "2.0", "method": "notifications/initialized"},
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}},
        ]
        completed = subprocess.run(
            argv,
            env=env,
            input="".join(f"{json.dumps(request)}\n" for request in requests),
            text=True,
            capture_output=True,
            timeout=20,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"{server_name} MCP check exited {completed.returncode}: {completed.stderr[-2000:]}"
            )
        messages = checked_json_lines(completed.stdout, server_name)
        responses = {
            message.get("id"): message for message in messages if message.get("id") in {1, 2}
        }
        initialize = responses.get(1)
        if not initialize or not isinstance(initialize.get("result"), dict):
            raise RuntimeError(f"{server_name} failed MCP initialize")
        initialize_result = cast(dict[str, object], initialize["result"])
        if initialize_result.get("protocolVersion") != MCP_PROTOCOL_VERSION:
            raise RuntimeError(f"{server_name} returned the wrong MCP protocol")
        tools_response = responses.get(2)
        if not tools_response or not isinstance(tools_response.get("result"), dict):
            raise RuntimeError(f"{server_name} failed MCP tools/list")
        tools_result = cast(dict[str, object], tools_response["result"])
        raw_tools = tools_result.get("tools")
        if not isinstance(raw_tools, list):
            raise RuntimeError(f"{server_name} returned invalid MCP tools")
        names: list[str] = []
        for raw_tool in cast(list[object], raw_tools):
            if not isinstance(raw_tool, dict):
                raise RuntimeError(f"{server_name} returned an invalid MCP tool")
            tool = cast(dict[str, object], raw_tool)
            name = tool.get("name")
            if not isinstance(name, str):
                raise RuntimeError(f"{server_name} returned an invalid MCP tool")
            names.append(name)
        if set(names) != expected_tools:
            raise RuntimeError(f"{server_name} returned an unexpected MCP tool inventory")
        observed[server_name] = sorted(names)
    return observed


def main() -> int:
    root = Path(__file__).resolve().parents[1]
    profile = root / "profile"
    paths = BridgePaths(
        static_profile=profile,
        log_dir=root / ".scratch" / "profile-rpc-logs",
        pi_command=(
            str(profile / "runtime" / "node-v26.4.0-linux-x64" / "bin" / "node"),
            str(
                profile / "node_modules" / "@earendil-works" / "pi-coding-agent" / "dist" / "cli.js"
            ),
        ),
        runtime_parent=root / ".scratch" / "profile-rpc-runtime",
    )
    allowed_tools = load_allowed_tools(profile)
    paths.runtime_parent.mkdir(parents=True, exist_ok=True)
    runtime = Path(tempfile.mkdtemp(prefix="check-", dir=paths.runtime_parent))
    os.chmod(runtime, 0o700)

    try:
        for name in PROFILE_LINKS:
            (runtime / name).symlink_to(profile / name)
        home = runtime / "home"
        cache = runtime / "cache"
        config = runtime / "config"
        state = runtime / "state"
        temp = runtime / "tmp"
        for directory in (home, cache, config, state, temp):
            directory.mkdir(mode=0o700)
        env = {
            "PATH": ":".join(
                [
                    str(profile / "runtime" / "node-v26.4.0-linux-x64" / "bin"),
                    str(profile / "runtime" / "toolchain" / "bin"),
                    str(profile / "node_modules" / ".bin"),
                    "/usr/local/bin",
                    "/usr/bin",
                    "/bin",
                ]
            ),
            "HOME": str(home),
            "XDG_CACHE_HOME": str(cache),
            "XDG_CONFIG_HOME": str(config),
            "XDG_STATE_HOME": str(state),
            "TMPDIR": str(temp),
            "PI_CODING_AGENT_DIR": str(runtime),
            "PI_VALKYRIE_TOOL_STATE_PATH": str(runtime / "tool-state.json"),
            "PYTHONSAFEPATH": "1",
            "LANG": "C.UTF-8",
        }
        mcp_tools = check_mcp_servers(profile, env)
        completed = subprocess.run(
            build_pi_argv(paths, allowed_tools),
            cwd=root,
            env=env,
            input='{"id":"profile-check","type":"get_state"}\n',
            text=True,
            capture_output=True,
            timeout=60,
            check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError(
                f"Pi profile check exited {completed.returncode}: {completed.stderr[-2000:]}"
            )

        response: dict[str, object] | None = None
        for line in completed.stdout.splitlines():
            value = cast(object, json.loads(line))
            if not isinstance(value, dict):
                continue
            candidate = cast(dict[str, object], value)
            if candidate.get("type") == "response" and candidate.get("id") == "profile-check":
                response = candidate
                break
        if response is None or response.get("success") is not True:
            raise RuntimeError("Pi profile check did not return a successful get_state response")
        data = response.get("data")
        if not isinstance(data, dict):
            raise RuntimeError("Pi profile check returned invalid state")
        state = cast(dict[str, object], data)
        model = state.get("model")
        if not isinstance(model, dict):
            raise RuntimeError("Pi profile check returned no model")
        model_state = cast(dict[str, object], model)
        if model_state.get("provider") != MODEL_PROVIDER or model_state.get("id") != MODEL_ID:
            raise RuntimeError("Pi profile check loaded the wrong model")
        effective_thinking = state.get("thinkingLevel")
        if effective_thinking not in EFFECTIVE_THINKING_LEVELS:
            raise RuntimeError("Pi profile check loaded the wrong thinking level")
        tool_state = validate_tool_state(runtime / "tool-state.json", allowed_tools)
        raw_active_tools = tool_state["activeTools"]
        if not isinstance(raw_active_tools, list):
            raise RuntimeError("Pi profile check returned invalid active tools")
        active_tools = cast(list[object], raw_active_tools)

        print(
            json.dumps(
                {
                    "piVersion": "0.80.6",
                    "model": f"{MODEL_PROVIDER}/{MODEL_ID}",
                    "requestedThinkingLevel": THINKING_LEVEL,
                    "effectiveThinkingLevel": effective_thinking,
                    "toolAllowlistCount": len(allowed_tools),
                    "activeToolCount": len(active_tools),
                    "localMcpToolCounts": {
                        name: len(tools) for name, tools in sorted(mcp_tools.items())
                    },
                    "remoteMcpServers": ["context7"],
                },
                sort_keys=True,
            )
        )
        return 0
    finally:
        shutil.rmtree(runtime, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
