from __future__ import annotations

import argparse
from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
import os
from pathlib import Path
import queue
import secrets
import shutil
import signal
import stat
import subprocess
import tempfile
import threading
import time
from typing import IO, Final, Mapping, cast
from urllib.parse import unquote, urlsplit


EXIT_OK: Final = 0
EXIT_TIMEOUT: Final = 124
EXIT_AUTH: Final = 20
EXIT_STARTUP: Final = 21
EXIT_PROTOCOL: Final = 22
EXIT_UNEXPECTED_PI_EXIT: Final = 23

BUNDLE_ROOT: Final = Path(__file__).resolve().parent
STATIC_PROFILE: Final = BUNDLE_ROOT / "profile"
NODE_BINARY: Final = STATIC_PROFILE / "runtime" / "node-v26.4.0-linux-x64" / "bin" / "node"
PI_ENTRYPOINT: Final = (
    STATIC_PROFILE / "node_modules" / "@earendil-works" / "pi-coding-agent" / "dist" / "cli.js"
)
LOG_DIR: Final = Path("/logs/ok-pi-agent")
RUNTIME_PARENT: Final = Path("/tmp/ok-pi-agent")
MODEL_PROVIDER: Final = "openai"
MODEL_ID: Final = "gpt-5.6-sol"
VALS_MODEL_ID: Final = "openai/gpt-5.6-sol"
THINKING_LEVEL: Final = "high"
EFFECTIVE_THINKING_LEVELS: Final = frozenset({"high"})
DIALOG_METHODS: Final = frozenset({"select", "confirm", "input", "editor"})
FINAL_MARKER_PREFIX: Final = "BENCHMARK_FINAL:"
PROMPT_PROFILES: Final = ("simple", "adapted")
MAX_TRUSTED_MCP_BYTES: Final = 1024 * 1024
BASE_MCP_SERVER_NAMES: Final = frozenset({"context7", "context-mode"})
PROFILE_MCP_CONFIG_ENV: Final = "PI_PROFILE_MCP_CONFIG"
SUBAGENT_PROJECT_RESOURCES_ENV: Final = "PI_SUBAGENT_PROJECT_RESOURCES"
SUBAGENT_RUNTIME_EXTENSIONS_ENV: Final = "PI_SUBAGENT_RUNTIME_EXTENSIONS"
SUBAGENT_MCP_EXTENSION_ENV: Final = "PI_SUBAGENT_MCP_EXTENSION"
SUBAGENT_SKILLS_ROOT_ENV: Final = "PI_SUBAGENT_SKILLS_ROOT"
PRIMARY_EXTENSION_PATHS: Final = (
    "extensions/compact-advisor.ts",
    "extensions/stop.ts",
    "extensions/tool-attestation.ts",
    "packages/pi-mcp-adapter/index.ts",
    "packages/pi-lens/dist/index.js",
    "packages/pi-intercom/index.ts",
    "packages/pi-subagents/src/extension/index.ts",
    "packages/pi-fff/src/index.ts",
    "packages/pi-tool-result-virtualizer/src/index.ts",
    "packages/context-mode/build/pi-extension.js",
    "packages/pi-slipstream-compact-valkyrie/src/index.ts",
)
CHILD_EXTENSION_PATHS: Final = (
    "extensions/compact-advisor.ts",
    "extensions/stop.ts",
    "packages/pi-lens/dist/index.js",
    "packages/pi-fff/src/index.ts",
    "packages/pi-tool-result-virtualizer/src/index.ts",
    "packages/context-mode/build/pi-extension.js",
    "packages/pi-slipstream-compact-valkyrie/src/index.ts",
)
PROFILE_LINKS: Final = (
    "settings.json",
    "APPEND_SYSTEM.md",
    "allowed-tools.json",
    "sources.lock.json",
    "runtime",
    "extensions",
    "agents",
    "skills",
    "packages",
    "node_modules",
)
PASSTHROUGH_ENV: Final = (
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "NODE_EXTRA_CA_CERTS",
)

JsonObject = dict[str, object]
EventQueue = queue.Queue[tuple[str, JsonObject | None]]


class BridgeFailure(Exception):
    def __init__(self, exit_code: int, error_class: str, message: str) -> None:
        super().__init__(message)
        self.exit_code = exit_code
        self.error_class = error_class


class PrimaryStepLimitReached(Exception):
    pass


@dataclass(frozen=True)
class BridgePaths:
    static_profile: Path = STATIC_PROFILE
    log_dir: Path = LOG_DIR
    pi_command: tuple[str, ...] = (str(NODE_BINARY), str(PI_ENTRYPOINT))
    runtime_parent: Path = RUNTIME_PARENT


@dataclass(frozen=True)
class PromptSelection:
    name: str
    path: Path
    sha256: str


@dataclass(frozen=True)
class Redactor:
    secrets: tuple[str, ...]

    @classmethod
    def from_values(cls, values: set[str]) -> Redactor:
        secrets: set[str] = set()
        for value in values:
            if not value:
                continue
            secrets.add(value)
            secrets.add(json.dumps(value)[1:-1])
        return cls(tuple(sorted(secrets, key=len, reverse=True)))

    def with_values(self, values: set[str]) -> Redactor:
        return Redactor.from_values(set(self.secrets) | values)

    def redact(self, value: str) -> str:
        result = value
        for secret in self.secrets:
            result = result.replace(secret, "[REDACTED]")
        return result

    def redact_bytes(self, value: bytes) -> bytes:
        result = value
        for secret in self.secrets:
            result = result.replace(secret.encode(), b"[REDACTED]")
        return result


@dataclass
class RuntimeProfile:
    root: Path
    mcp_config: Path
    child_env: dict[str, str]
    redactor: Redactor

    def cleanup(self) -> None:
        shutil.rmtree(self.root, ignore_errors=True)


@dataclass
class StreamLogs:
    trajectory: IO[str]
    raw_output: IO[str]
    stderr: IO[str]

    def flush(self) -> None:
        for stream in (self.trajectory, self.raw_output, self.stderr):
            stream.flush()
            os.fsync(stream.fileno())


@dataclass
class EventState:
    final_marker: str
    max_steps: int | None = None
    final_message: str = ""
    settled: bool = False
    step_counting_started: bool = False
    primary_tool_completions: int = 0
    max_steps_reached: bool = False


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def load_allowed_tools(profile: Path) -> tuple[str, ...]:
    path = profile / "allowed-tools.json"
    try:
        value: object = json.loads(path.read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise BridgeFailure(EXIT_STARTUP, "startup", "invalid allowed-tools.json") from error
    if not isinstance(value, dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "allowed-tools.json must be an object")
    document = cast(JsonObject, value)
    raw_tools = document.get("tools")
    if document.get("version") != 1 or not isinstance(raw_tools, list) or not raw_tools:
        raise BridgeFailure(
            EXIT_STARTUP,
            "startup",
            "allowed-tools.json must contain a nonempty version-1 tools list",
        )
    tools: list[str] = []
    items = cast(list[object], raw_tools)
    for item in items:
        if not isinstance(item, str) or not item or "," in item:
            raise BridgeFailure(EXIT_STARTUP, "startup", "invalid tool name in allowlist")
        tools.append(item)
    if len(set(tools)) != len(tools):
        raise BridgeFailure(EXIT_STARTUP, "startup", "duplicate tool name in allowlist")
    return tuple(tools)


def select_prompt_profile(static_profile: Path, prompt_profile: str) -> PromptSelection:
    if prompt_profile not in PROMPT_PROFILES:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "invalid prompt profile")
    prompt_path = static_profile / "prompts" / prompt_profile / "AGENTS.md"
    if not prompt_path.is_file():
        raise BridgeFailure(
            EXIT_STARTUP,
            "startup",
            f"prompt profile resource missing: {prompt_profile}",
        )
    return PromptSelection(
        name=prompt_profile,
        path=prompt_path,
        sha256=hashlib.sha256(prompt_path.read_bytes()).hexdigest(),
    )


def _open_absolute_directory_chain(
    path: Path, label: str
) -> list[tuple[int, os.stat_result, Path]]:
    if not path.is_absolute() or ".." in path.parts:
        raise BridgeFailure(EXIT_STARTUP, "startup", f"{label} path is ambiguous")

    flags = os.O_RDONLY | os.O_CLOEXEC | os.O_DIRECTORY | os.O_NOFOLLOW
    opened: list[tuple[int, os.stat_result, Path]] = []
    expected = Path("/")
    try:
        descriptor = os.open("/", flags)
        opened.append((descriptor, os.fstat(descriptor), expected))
        for component in path.parts[1:]:
            descriptor = os.open(component, flags, dir_fd=descriptor)
            expected /= component
            opened.append((descriptor, os.fstat(descriptor), expected))
    except OSError as error:
        for descriptor, _, _ in reversed(opened):
            os.close(descriptor)
        raise BridgeFailure(EXIT_STARTUP, "startup", f"cannot open {label}") from error
    return opened


def _validate_descriptor_path(descriptor: int, expected: Path, label: str) -> Path:
    try:
        opened_path = Path(os.readlink(f"/proc/self/fd/{descriptor}"))
    except OSError as error:
        raise BridgeFailure(EXIT_STARTUP, "startup", f"cannot verify opened {label}") from error
    if opened_path != expected or " (deleted)" in str(opened_path):
        raise BridgeFailure(EXIT_STARTUP, "startup", f"opened {label} path changed")
    return opened_path


def read_trusted_mcp_config(
    path: Path,
    workspace: Path,
    *,
    allow_workspace: bool = False,
    bare_server_map: bool = False,
) -> JsonObject:
    if not path.is_absolute():
        raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config path must be absolute")
    if not path.name or ".." in path.parts:
        raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config path is ambiguous")

    workspace_chain = _open_absolute_directory_chain(workspace, "task workspace")
    config_chain = _open_absolute_directory_chain(path.parent, "trusted MCP config parent")
    descriptor = -1
    try:
        workspace_descriptor, workspace_stat, workspace_path = workspace_chain[-1]
        _validate_descriptor_path(workspace_descriptor, workspace_path, "task workspace")
        workspace_identity = (workspace_stat.st_dev, workspace_stat.st_ino)
        if not allow_workspace and any(
            (directory_stat.st_dev, directory_stat.st_ino) == workspace_identity
            for _, directory_stat, _ in config_chain
        ):
            raise BridgeFailure(
                EXIT_STARTUP,
                "startup",
                "trusted MCP config must be outside the task workspace",
            )
        for directory_descriptor, _, expected in config_chain:
            _validate_descriptor_path(directory_descriptor, expected, "trusted MCP config parent")

        flags = os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
        try:
            descriptor = os.open(path.name, flags, dir_fd=config_chain[-1][0])
        except OSError as error:
            raise BridgeFailure(
                EXIT_STARTUP, "startup", "cannot open trusted MCP config"
            ) from error
        opened_path = _validate_descriptor_path(descriptor, path, "trusted MCP config")
        if not allow_workspace and opened_path.is_relative_to(workspace_path):
            raise BridgeFailure(
                EXIT_STARTUP,
                "startup",
                "trusted MCP config must be outside the task workspace",
            )

        before = os.fstat(descriptor)
        if not stat.S_ISREG(before.st_mode):
            raise BridgeFailure(
                EXIT_STARTUP, "startup", "trusted MCP config must be a regular file"
            )
        if before.st_size > MAX_TRUSTED_MCP_BYTES:
            raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config is too large")
        chunks: list[bytes] = []
        size = 0
        while chunk := os.read(descriptor, min(65536, MAX_TRUSTED_MCP_BYTES + 1 - size)):
            chunks.append(chunk)
            size += len(chunk)
            if size > MAX_TRUSTED_MCP_BYTES:
                raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config is too large")
        after = os.fstat(descriptor)
        if (before.st_dev, before.st_ino, before.st_size) != (
            after.st_dev,
            after.st_ino,
            after.st_size,
        ):
            raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config changed while reading")
        _validate_descriptor_path(descriptor, path, "trusted MCP config")
        _validate_descriptor_path(workspace_descriptor, workspace_path, "task workspace")
        for directory_descriptor, _, expected in config_chain:
            _validate_descriptor_path(directory_descriptor, expected, "trusted MCP config parent")
    finally:
        if descriptor >= 0:
            os.close(descriptor)
        for directory_descriptor, _, _ in reversed(config_chain):
            os.close(directory_descriptor)
        for directory_descriptor, _, _ in reversed(workspace_chain):
            os.close(directory_descriptor)

    try:
        raw: object = json.loads(b"".join(chunks))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BridgeFailure(
            EXIT_STARTUP, "startup", "trusted MCP config is invalid JSON"
        ) from error
    if not isinstance(raw, dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP config must be an object")
    document: JsonObject
    if bare_server_map:
        document = {"mcpServers": cast(JsonObject, raw)}
    else:
        document = cast(JsonObject, raw)
    if set(document) != {"mcpServers"}:
        raise BridgeFailure(
            EXIT_STARTUP,
            "startup",
            "trusted MCP config may contain only mcpServers",
        )
    servers = document.get("mcpServers")
    if not isinstance(servers, dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP mcpServers must be an object")
    server_map = cast(dict[str, object], servers)
    for name, definition in server_map.items():
        if not name or not isinstance(definition, dict):
            raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP server entries are invalid")
        if name in BASE_MCP_SERVER_NAMES:
            raise BridgeFailure(
                EXIT_STARTUP, "startup", "trusted MCP config cannot replace base servers"
            )
    return {"mcpServers": server_map}


def build_runtime_mcp_config(
    static_profile: Path,
    trusted_mcp_config: Path | None,
    trusted_mcp_server_map: Path | None,
    workspace: Path,
) -> JsonObject:
    try:
        raw_base: object = json.loads((static_profile / "mcp.json").read_text())
    except (OSError, json.JSONDecodeError) as error:
        raise BridgeFailure(EXIT_STARTUP, "startup", "invalid bundled MCP config") from error
    if not isinstance(raw_base, dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "bundled MCP config must be an object")
    base = cast(JsonObject, raw_base)
    if set(base) != {"mcpServers"} or not isinstance(base.get("mcpServers"), dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "bundled MCP config has invalid shape")
    base_servers = cast(dict[str, object], base["mcpServers"])
    if frozenset(base_servers) != BASE_MCP_SERVER_NAMES:
        raise BridgeFailure(EXIT_STARTUP, "startup", "bundled MCP server inventory is invalid")

    if trusted_mcp_config is not None and trusted_mcp_server_map is not None:
        raise BridgeFailure(EXIT_STARTUP, "startup", "trusted MCP inputs are mutually exclusive")

    merged = dict(base_servers)
    if trusted_mcp_config is not None:
        trusted = read_trusted_mcp_config(trusted_mcp_config, workspace)
        merged.update(cast(dict[str, object], trusted["mcpServers"]))
    elif trusted_mcp_server_map is not None:
        trusted = read_trusted_mcp_config(
            trusted_mcp_server_map,
            workspace,
            allow_workspace=True,
            bare_server_map=True,
        )
        merged.update(cast(dict[str, object], trusted["mcpServers"]))
    return {"mcpServers": merged}


def prepare_runtime_profile(
    paths: BridgePaths,
    source_env: Mapping[str, str],
    trusted_mcp_config: Path | None,
    trusted_mcp_server_map: Path | None,
    workspace: Path,
) -> RuntimeProfile:
    api_key = source_env.get("OPENAI_API_KEY", "")
    if not api_key:
        raise BridgeFailure(EXIT_AUTH, "auth", "OPENAI_API_KEY is required")
    redactor = Redactor.from_values({api_key})

    for name in PROFILE_LINKS:
        if not (paths.static_profile / name).exists():
            raise BridgeFailure(EXIT_STARTUP, "startup", f"profile resource missing: {name}")

    paths.runtime_parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(paths.runtime_parent, 0o700)
    root = Path(tempfile.mkdtemp(prefix="run-", dir=paths.runtime_parent))
    os.chmod(root, 0o700)

    try:
        for name in PROFILE_LINKS:
            (root / name).symlink_to(paths.static_profile / name)
        mcp_config = root / "mcp.runtime.json"
        write_json_atomic(
            mcp_config,
            build_runtime_mcp_config(
                paths.static_profile,
                trusted_mcp_config,
                trusted_mcp_server_map,
                workspace,
            ),
        )
        os.chmod(mcp_config, 0o600)

        home = root / "home"
        cache = root / "cache"
        config = root / "config"
        state = root / "state"
        temp = root / "tmp"
        for directory in (home, cache, config, state, temp):
            directory.mkdir(mode=0o700)

        path_entries = [
            str(paths.static_profile / "runtime" / "node-v26.4.0-linux-x64" / "bin"),
            str(paths.static_profile / "runtime" / "toolchain" / "bin"),
            str(paths.static_profile / "node_modules" / ".bin"),
            "/usr/local/bin",
            "/usr/bin",
            "/bin",
        ]
        child_env = {
            "PATH": ":".join(path_entries),
            "HOME": str(home),
            "XDG_CACHE_HOME": str(cache),
            "XDG_CONFIG_HOME": str(config),
            "XDG_STATE_HOME": str(state),
            "TMPDIR": str(temp),
            "PI_CODING_AGENT_DIR": str(root),
            "PI_VALKYRIE_TOOL_STATE_PATH": str(paths.log_dir / "tool-state.json"),
            PROFILE_MCP_CONFIG_ENV: str(mcp_config),
            SUBAGENT_PROJECT_RESOURCES_ENV: "ignore",
            SUBAGENT_RUNTIME_EXTENSIONS_ENV: os.pathsep.join(
                str(paths.static_profile / relative_path) for relative_path in CHILD_EXTENSION_PATHS
            ),
            SUBAGENT_MCP_EXTENSION_ENV: str(
                paths.static_profile / "packages/pi-mcp-adapter/index.ts"
            ),
            SUBAGENT_SKILLS_ROOT_ENV: str(paths.static_profile / "skills"),
            "OPENAI_API_KEY": api_key,
            "PYTHONSAFEPATH": "1",
            "LANG": "C.UTF-8",
            "LC_ALL": "C.UTF-8",
        }
        proxy_secrets: set[str] = set()
        for name in PASSTHROUGH_ENV:
            if value := source_env.get(name):
                child_env[name] = value
                if name in {"HTTP_PROXY", "HTTPS_PROXY"}:
                    proxy_secrets.add(value)
                    try:
                        proxy = urlsplit(value)
                    except ValueError:
                        continue
                    proxy_secrets.add(unquote(proxy.username or ""))
                    proxy_secrets.add(unquote(proxy.password or ""))
        return RuntimeProfile(
            root=root,
            mcp_config=mcp_config,
            child_env=child_env,
            redactor=redactor.with_values(proxy_secrets),
        )
    except Exception:
        shutil.rmtree(root, ignore_errors=True)
        raise


def build_pi_argv(
    paths: BridgePaths,
    allowed_tools: tuple[str, ...],
    prompt: PromptSelection,
    mcp_config: Path,
) -> list[str]:
    argv = [
        *paths.pi_command,
        "--mode",
        "rpc",
        "--no-session",
        "--no-approve",
        "--no-context-files",
        "--no-extensions",
        "--no-skills",
        "--no-prompt-templates",
        "--no-themes",
        "--model",
        f"{MODEL_PROVIDER}/{MODEL_ID}",
        "--thinking",
        THINKING_LEVEL,
        "--append-system-prompt",
        str(prompt.path),
        "--append-system-prompt",
        str(paths.static_profile / "APPEND_SYSTEM.md"),
        "--skill",
        str(paths.static_profile / "skills"),
        "--mcp-config",
        str(mcp_config),
        "--mcp-ignore-project-config",
        "--tools",
        ",".join(allowed_tools),
    ]
    for relative_path in PRIMARY_EXTENSION_PATHS:
        argv.extend(("--extension", str(paths.static_profile / relative_path)))
    return argv


def write_json_atomic(path: Path, payload: Mapping[str, object]) -> None:
    temporary = path.with_suffix(f"{path.suffix}.tmp")
    temporary.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
    temporary.replace(path)


def open_stream_logs(log_dir: Path) -> StreamLogs:
    return StreamLogs(
        trajectory=(log_dir / "trajectory.jsonl").open("w", encoding="utf-8"),
        raw_output=(log_dir / "raw_output.txt").open("w", encoding="utf-8"),
        stderr=(log_dir / "stderr.txt").open("w", encoding="utf-8"),
    )


def drain_stdout(
    stream: IO[str],
    events: EventQueue,
    logs: StreamLogs,
    redactor: Redactor,
) -> None:
    try:
        for line in stream:
            try:
                parsed: object = json.loads(line)
            except json.JSONDecodeError:
                logs.raw_output.write(redactor.redact(line))
                logs.raw_output.flush()
                continue
            if not isinstance(parsed, dict):
                logs.raw_output.write(redactor.redact(line))
                logs.raw_output.flush()
                continue
            event = cast(JsonObject, parsed)
            logs.trajectory.write(redactor.redact(json.dumps(event, separators=(",", ":"))) + "\n")
            logs.trajectory.flush()
            events.put(("event", event))
    finally:
        events.put(("stdout_eof", None))


def drain_stderr(stream: IO[str], events: EventQueue, logs: StreamLogs, redactor: Redactor) -> None:
    try:
        for line in stream:
            logs.stderr.write(redactor.redact(line))
            logs.stderr.flush()
    finally:
        events.put(("stderr_eof", None))


def send_command(process: subprocess.Popen[str], payload: Mapping[str, object]) -> None:
    if process.stdin is None:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "Pi stdin is unavailable")
    try:
        process.stdin.write(json.dumps(payload, separators=(",", ":")) + "\n")
        process.stdin.flush()
    except (BrokenPipeError, OSError) as error:
        raise BridgeFailure(EXIT_UNEXPECTED_PI_EXIT, "pi_exit", "Pi RPC stdin closed") from error


def extract_assistant_text(message: object) -> str:
    if not isinstance(message, dict):
        return ""
    message_object = cast(JsonObject, message)
    if message_object.get("role") != "assistant":
        return ""
    content = message_object.get("content")
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts: list[str] = []
    blocks = cast(list[object], content)
    for block in blocks:
        if isinstance(block, dict):
            block_object = cast(JsonObject, block)
            if block_object.get("type") != "text":
                continue
            text = block_object.get("text")
            if isinstance(text, str):
                parts.append(text)
    return "\n".join(parts)


def extract_marked_final(text: str, marker: str) -> str | None:
    occurrences = text.count(marker)
    if occurrences == 0:
        return None
    if occurrences != 1:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "duplicate final response marker")
    lines = text.splitlines()
    if not lines or lines[0] != marker:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "malformed final response marker")
    final_message = "\n".join(lines[1:]).strip()
    if not final_message:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "final response marker has no content")
    return final_message


def process_event(
    process: subprocess.Popen[str],
    event: JsonObject,
    state: EventState,
    *,
    capture_completion: bool = True,
) -> None:
    event_type = event.get("type")
    if (
        state.step_counting_started
        and not state.max_steps_reached
        and event_type == "tool_execution_end"
    ):
        state.primary_tool_completions += 1
        if state.max_steps is not None and state.primary_tool_completions >= state.max_steps:
            state.max_steps_reached = True

    if event_type == "extension_ui_request":
        method = event.get("method")
        request_id = event.get("id")
        if method in DIALOG_METHODS and isinstance(request_id, str):
            send_command(
                process,
                {
                    "type": "extension_ui_response",
                    "id": request_id,
                    "cancelled": True,
                },
            )
    elif capture_completion and event_type == "message_end":
        text = extract_assistant_text(event.get("message"))
        marked_final = extract_marked_final(text, state.final_marker)
        if marked_final is not None:
            if state.final_message:
                raise BridgeFailure(EXIT_PROTOCOL, "protocol", "duplicate marked final response")
            state.final_message = marked_final
    elif capture_completion and event_type == "agent_settled":
        state.settled = True


def next_event(
    process: subprocess.Popen[str],
    events: EventQueue,
    deadline: float,
    stop_event: threading.Event,
) -> JsonObject:
    while True:
        if stop_event.is_set() or time.monotonic() >= deadline:
            raise BridgeFailure(EXIT_TIMEOUT, "timeout", "agent deadline reached")
        try:
            kind, payload = events.get(timeout=min(0.1, max(0.01, deadline - time.monotonic())))
        except queue.Empty:
            if process.poll() is not None:
                raise BridgeFailure(
                    EXIT_UNEXPECTED_PI_EXIT,
                    "pi_exit",
                    f"Pi exited unexpectedly with code {process.returncode}",
                )
            continue
        if kind == "event" and payload is not None:
            return payload
        if kind == "stdout_eof" and process.poll() is not None:
            raise BridgeFailure(
                EXIT_UNEXPECTED_PI_EXIT,
                "pi_exit",
                f"Pi exited unexpectedly with code {process.returncode}",
            )


def await_response(
    process: subprocess.Popen[str],
    events: EventQueue,
    state: EventState,
    request_id: str,
    deadline: float,
    stop_event: threading.Event,
    *,
    capture_completion: bool = True,
) -> JsonObject:
    while True:
        event = next_event(process, events, deadline, stop_event)
        if event.get("type") == "response" and event.get("id") == request_id:
            if event.get("success") is not True:
                message = event.get("error")
                raise BridgeFailure(
                    EXIT_PROTOCOL,
                    "protocol",
                    message if isinstance(message, str) else "RPC command rejected",
                )
            return event
        process_event(
            process,
            event,
            state,
            capture_completion=capture_completion,
        )
        if state.max_steps_reached:
            raise PrimaryStepLimitReached


def validate_state_response(response: JsonObject) -> JsonObject:
    data = response.get("data")
    if not isinstance(data, dict):
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "get_state returned no data")
    data_object = cast(JsonObject, data)
    model = data_object.get("model")
    if not isinstance(model, dict):
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "get_state returned no model")
    model_object = cast(JsonObject, model)
    if model_object.get("provider") != MODEL_PROVIDER or model_object.get("id") != MODEL_ID:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "unexpected Pi model")
    if data_object.get("thinkingLevel") not in EFFECTIVE_THINKING_LEVELS:
        raise BridgeFailure(EXIT_PROTOCOL, "protocol", "unexpected Pi thinking level")
    return data_object


def validate_tool_state(path: Path, allowed_tools: tuple[str, ...]) -> JsonObject:
    try:
        value = cast(object, json.loads(path.read_text()))
    except (OSError, json.JSONDecodeError) as error:
        raise BridgeFailure(EXIT_STARTUP, "startup", "startup tool state is missing") from error
    if not isinstance(value, dict):
        raise BridgeFailure(EXIT_STARTUP, "startup", "startup tool state must be an object")
    tool_state = cast(JsonObject, value)

    lists: dict[str, tuple[str, ...]] = {}
    for name in ("allowedTools", "registeredTools", "activeTools"):
        raw = tool_state.get(name)
        if not isinstance(raw, list):
            raise BridgeFailure(EXIT_STARTUP, "startup", f"invalid startup tool state: {name}")
        raw_items = cast(list[object], raw)
        if not all(isinstance(item, str) for item in raw_items):
            raise BridgeFailure(EXIT_STARTUP, "startup", f"invalid startup tool state: {name}")
        items = tuple(cast(str, item) for item in raw_items)
        if len(set(items)) != len(items):
            raise BridgeFailure(EXIT_STARTUP, "startup", f"duplicate startup tool state: {name}")
        lists[name] = items

    if tool_state.get("version") != 1 or lists["allowedTools"] != allowed_tools:
        raise BridgeFailure(EXIT_STARTUP, "startup", "startup tool allowlist mismatch")
    registered = set(lists["registeredTools"])
    active = set(lists["activeTools"])
    allowed = set(allowed_tools)
    if not allowed.issubset(registered):
        raise BridgeFailure(EXIT_STARTUP, "startup", "allowed startup tools are unregistered")
    if active != allowed:
        raise BridgeFailure(EXIT_STARTUP, "startup", "active startup tools differ from allowlist")
    return tool_state


def process_group_exists(process_group_id: int) -> bool:
    try:
        os.killpg(process_group_id, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def terminate_process_group(
    process: subprocess.Popen[str],
    *,
    abort_rpc: bool,
    grace_seconds: float = 2.0,
) -> None:
    process_group_id = process.pid
    if process.poll() is None:
        if abort_rpc:
            try:
                send_command(process, {"id": "abort-final", "type": "abort"})
            except BridgeFailure:
                pass
        if process.stdin is not None:
            try:
                process.stdin.close()
            except OSError:
                pass
        try:
            process.wait(timeout=grace_seconds)
        except subprocess.TimeoutExpired:
            pass

    if not process_group_exists(process_group_id):
        return
    try:
        os.killpg(process_group_id, signal.SIGTERM)
    except ProcessLookupError:
        return
    deadline = time.monotonic() + grace_seconds
    while time.monotonic() < deadline:
        if not process_group_exists(process_group_id):
            return
        time.sleep(0.02)
    try:
        os.killpg(process_group_id, signal.SIGKILL)
    except ProcessLookupError:
        return
    if process.poll() is None:
        try:
            process.wait(timeout=grace_seconds)
        except subprocess.TimeoutExpired:
            pass


def redact_artifact_tree(root: Path, redactor: Redactor) -> None:
    for path in root.rglob("*"):
        if path.is_symlink() or not path.is_file():
            continue
        original = path.read_bytes()
        redacted = redactor.redact_bytes(original)
        if redacted == original:
            continue
        temporary = path.with_name(f".{path.name}.redacting")
        temporary.write_bytes(redacted)
        os.chmod(temporary, path.stat().st_mode & 0o777)
        temporary.replace(path)


def write_text(path: Path, value: str, redactor: Redactor) -> None:
    path.write_text(redactor.redact(value).rstrip() + "\n")


def run_bridge(
    *,
    problem_statement: Path,
    problem_text: str,
    prompt_profile: str,
    timeout_seconds: float,
    paths: BridgePaths,
    source_env: Mapping[str, str],
    trusted_mcp_config: Path | None = None,
    trusted_mcp_server_map: Path | None = None,
    max_steps: int | None = None,
    stop_event: threading.Event | None = None,
) -> int:
    started_at = utc_now()
    started_monotonic = time.monotonic()
    paths.log_dir.mkdir(parents=True, exist_ok=True)
    stop = stop_event or threading.Event()
    initial_redactor = Redactor(
        (source_env["OPENAI_API_KEY"],) if source_env.get("OPENAI_API_KEY") else ()
    )
    redactor = initial_redactor
    prompt: PromptSelection | None = None
    runtime: RuntimeProfile | None = None
    process: subprocess.Popen[str] | None = None
    logs: StreamLogs | None = None
    stdout_thread: threading.Thread | None = None
    stderr_thread: threading.Thread | None = None
    final_marker = f"{FINAL_MARKER_PREFIX}{secrets.token_hex(16)}"
    state = EventState(final_marker=final_marker, max_steps=max_steps)
    tool_state: JsonObject | None = None
    initial_state: JsonObject | None = None
    final_state: JsonObject | None = None
    error_class: str | None = None
    error_message: str | None = None
    exit_code = EXIT_OK

    try:
        prompt = select_prompt_profile(paths.static_profile, prompt_profile)
        try:
            (paths.log_dir / "tool-state.json").unlink(missing_ok=True)
        except OSError as error:
            raise BridgeFailure(
                EXIT_STARTUP,
                "startup",
                "cannot reset startup tool state",
            ) from error
        if timeout_seconds <= 0:
            raise BridgeFailure(EXIT_PROTOCOL, "protocol", "timeout must be positive")
        if max_steps is not None and max_steps <= 0:
            raise BridgeFailure(EXIT_PROTOCOL, "protocol", "max steps must be positive")
        task_id = source_env.get("TASK_ID", "")
        if not task_id:
            raise BridgeFailure(EXIT_PROTOCOL, "protocol", "TASK_ID is required")
        allowed_tools = load_allowed_tools(paths.static_profile)
        runtime = prepare_runtime_profile(
            paths,
            source_env,
            trusted_mcp_config,
            trusted_mcp_server_map,
            Path.cwd(),
        )
        redactor = runtime.redactor
        logs = open_stream_logs(paths.log_dir)
        argv = build_pi_argv(paths, allowed_tools, prompt, runtime.mcp_config)
        try:
            process = subprocess.Popen(
                argv,
                cwd=Path.cwd(),
                env=runtime.child_env,
                stdin=subprocess.PIPE,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                bufsize=1,
                start_new_session=True,
            )
        except OSError as error:
            raise BridgeFailure(EXIT_STARTUP, "startup", "failed to start Pi") from error
        if process.stdout is None or process.stderr is None:
            raise BridgeFailure(EXIT_STARTUP, "startup", "Pi pipes are unavailable")

        events: EventQueue = queue.Queue()
        stdout_thread = threading.Thread(
            target=drain_stdout,
            args=(process.stdout, events, logs, redactor),
            name="pi-rpc-stdout",
            daemon=True,
        )
        stderr_thread = threading.Thread(
            target=drain_stderr,
            args=(process.stderr, events, logs, redactor),
            name="pi-rpc-stderr",
            daemon=True,
        )
        stdout_thread.start()
        stderr_thread.start()

        deadline = started_monotonic + timeout_seconds
        try:
            send_command(process, {"id": "handshake", "type": "get_state"})
            initial_state = validate_state_response(
                await_response(
                    process,
                    events,
                    state,
                    "handshake",
                    deadline,
                    stop,
                    capture_completion=False,
                )
            )
            tool_state = validate_tool_state(
                paths.log_dir / "tool-state.json",
                allowed_tools,
            )
        except BridgeFailure as error:
            if error.exit_code == EXIT_TIMEOUT:
                raise
            raise BridgeFailure(
                EXIT_STARTUP,
                "startup",
                f"Pi handshake failed: {error}",
            ) from error

        task_prompt = (
            f"{problem_text.rstrip()}\n\n"
            "Completion protocol: only when the task is complete, begin the final "
            "response with this exact line:\n"
            f"{final_marker}\n"
            "Use that line exactly once. Do not include it in progress updates or "
            "responses to background notifications."
        )
        state.step_counting_started = True
        send_command(
            process,
            {"id": "task", "type": "prompt", "message": task_prompt},
        )
        try:
            _ = await_response(
                process,
                events,
                state,
                "task",
                deadline,
                stop,
                capture_completion=False,
            )
        except PrimaryStepLimitReached:
            state.step_counting_started = False

        if not state.max_steps_reached:
            state.final_message = ""
            state.settled = False
            while not state.settled and not state.max_steps_reached:
                event = next_event(process, events, deadline, stop)
                process_event(process, event, state)

        if not state.max_steps_reached:
            state.step_counting_started = False
            if not state.final_message:
                raise BridgeFailure(
                    EXIT_PROTOCOL, "protocol", "settled without marked final response"
                )

            send_command(process, {"id": "final-state", "type": "get_state"})
            final_state = validate_state_response(
                await_response(
                    process,
                    events,
                    state,
                    "final-state",
                    deadline,
                    stop,
                    capture_completion=False,
                )
            )
            write_text(paths.log_dir / "final_message.txt", state.final_message, redactor)

    except BridgeFailure as error:
        exit_code = error.exit_code
        error_class = error.error_class
        error_message = redactor.redact(str(error))
    except Exception as error:
        exit_code = EXIT_PROTOCOL
        error_class = "internal"
        error_message = redactor.redact(f"{type(error).__name__}: {error}")
    finally:
        if process is not None:
            terminate_process_group(
                process,
                abort_rpc=exit_code != EXIT_OK or state.max_steps_reached,
            )
        for thread in (stdout_thread, stderr_thread):
            if thread is not None:
                thread.join(timeout=2)
        if logs is not None:
            logs.flush()
            for stream in (logs.trajectory, logs.raw_output, logs.stderr):
                stream.close()
        try:
            redact_artifact_tree(paths.log_dir, redactor)
        except OSError as error:
            exit_code = EXIT_PROTOCOL
            error_class = "redaction"
            error_message = f"artifact redaction failed: {type(error).__name__}"
        if runtime is not None:
            runtime.cleanup()

        if process is not None:
            if exit_code == EXIT_OK:
                termination_reason = (
                    "max_steps_reached" if state.max_steps_reached else "agent_settled"
                )
            else:
                termination_reason = error_class or "failed"
            metrics: dict[str, object] = {
                "initialState": initial_state,
                "finalState": final_state,
                "agentSettled": state.settled,
                "finalMessageObserved": bool(state.final_message),
                "terminationReason": termination_reason,
                "maxSteps": max_steps,
                "primaryToolCompletions": state.primary_tool_completions,
                "durationSeconds": round(time.monotonic() - started_monotonic, 3),
            }
            redacted_metrics_value = cast(object, json.loads(redactor.redact(json.dumps(metrics))))
            redacted_metrics = (
                cast(JsonObject, redacted_metrics_value)
                if isinstance(redacted_metrics_value, dict)
                else {
                    "terminationReason": "internal",
                    "maxSteps": max_steps,
                    "primaryToolCompletions": state.primary_tool_completions,
                }
            )
            try:
                write_json_atomic(paths.log_dir / "metrics.json", redacted_metrics)
            except OSError as error:
                exit_code = EXIT_PROTOCOL
                error_class = "metrics"
                error_message = f"metrics write failed: {type(error).__name__}"

        task_id = source_env.get("TASK_ID", "")
        if exit_code != EXIT_OK:
            outcome = "failed"
        elif state.max_steps_reached:
            outcome = "max_steps_reached"
        else:
            outcome = "agent_settled"
        summary: dict[str, object] = {
            "version": 2,
            "taskId": task_id,
            "promptProfile": prompt.name if prompt is not None else prompt_profile,
            "promptSha256": prompt.sha256 if prompt is not None else None,
            "problemStatementPath": str(problem_statement),
            "startedAt": started_at,
            "endedAt": utc_now(),
            "durationSeconds": round(time.monotonic() - started_monotonic, 3),
            "timeoutSeconds": timeout_seconds,
            "exitCode": exit_code,
            "outcome": outcome,
            "agentSettled": state.settled,
            "finalMessageObserved": bool(state.final_message),
            "finalMessagePresent": bool(state.final_message),
            "maxSteps": max_steps,
            "primaryToolCompletions": state.primary_tool_completions,
            "errorClass": error_class,
            "error": error_message,
            "toolState": tool_state,
            "model": f"{MODEL_PROVIDER}/{MODEL_ID}",
            "valsModel": VALS_MODEL_ID,
            "requestedThinkingLevel": THINKING_LEVEL,
            "effectiveThinkingLevel": (
                final_state.get("thinkingLevel") if final_state is not None else None
            ),
        }
        redacted_value = cast(object, json.loads(redactor.redact(json.dumps(summary))))
        if isinstance(redacted_value, dict):
            redacted_summary = cast(JsonObject, redacted_value)
        else:
            redacted_summary = {"exitCode": exit_code, "errorClass": "internal"}
        write_json_atomic(paths.log_dir / "summary.json", redacted_summary)

    return exit_code


def positive_int(value: str) -> int:
    try:
        parsed = int(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("must be an integer") from error
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run pinned Pi in unattended benchmark RPC mode")
    parser.add_argument("--problem-statement", type=Path, required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--declared-model", choices=(VALS_MODEL_ID,), required=True)
    parser.add_argument("--prompt-profile", choices=PROMPT_PROFILES, required=True)
    mcp_input = parser.add_mutually_exclusive_group()
    mcp_input.add_argument("--trusted-mcp-config", type=Path)
    mcp_input.add_argument("--trusted-mcp-server-map", type=Path)
    parser.add_argument("--max-steps", type=positive_int)
    parser.add_argument("--timeout-seconds", type=float, default=7200)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    problem_path = cast(Path, args.problem_statement)
    try:
        problem_text = problem_path.read_text()
    except OSError as error:
        prompt = select_prompt_profile(STATIC_PROFILE, cast(str, args.prompt_profile))
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        write_json_atomic(
            LOG_DIR / "summary.json",
            {
                "version": 1,
                "promptProfile": prompt.name,
                "promptSha256": prompt.sha256,
                "valsModel": VALS_MODEL_ID,
                "exitCode": EXIT_PROTOCOL,
                "errorClass": "protocol",
                "error": f"cannot read problem statement: {error}",
            },
        )
        return EXIT_PROTOCOL

    source_env = dict(os.environ)
    source_env["TASK_ID"] = cast(str, args.task_id)
    stop_event = threading.Event()

    def request_stop(_signum: int, _frame: object) -> None:
        stop_event.set()

    signal.signal(signal.SIGTERM, request_stop)
    signal.signal(signal.SIGINT, request_stop)
    return run_bridge(
        problem_statement=problem_path,
        problem_text=problem_text,
        prompt_profile=cast(str, args.prompt_profile),
        timeout_seconds=cast(float, args.timeout_seconds),
        paths=BridgePaths(),
        source_env=source_env,
        trusted_mcp_config=cast(Path | None, args.trusted_mcp_config),
        trusted_mcp_server_map=cast(Path | None, args.trusted_mcp_server_map),
        max_steps=cast(int | None, args.max_steps),
        stop_event=stop_event,
    )


if __name__ == "__main__":
    raise SystemExit(main())
