from __future__ import annotations

import argparse
import base64
import binascii
from dataclasses import dataclass
from datetime import UTC, datetime
import json
import os
from pathlib import Path
import queue
import shutil
import signal
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

BUNDLE_ROOT: Final = Path("/bundle/ok-pi-agent")
STATIC_PROFILE: Final = BUNDLE_ROOT / "profile"
NODE_BINARY: Final = STATIC_PROFILE / "runtime" / "node-v26.4.0-linux-x64" / "bin" / "node"
PI_ENTRYPOINT: Final = (
    STATIC_PROFILE / "node_modules" / "@earendil-works" / "pi-coding-agent" / "dist" / "cli.js"
)
LOG_DIR: Final = Path("/logs/ok-pi-agent")
RUNTIME_PARENT: Final = Path("/tmp/ok-pi-agent")
MODEL_PROVIDER: Final = "openai-codex"
MODEL_ID: Final = "gpt-5.6-sol"
THINKING_LEVEL: Final = "max"
EFFECTIVE_THINKING_LEVELS: Final = frozenset({"max", "xhigh"})
DIALOG_METHODS: Final = frozenset({"select", "confirm", "input", "editor"})
PROFILE_LINKS: Final = (
    "settings.json",
    "models.json",
    "mcp.json",
    "AGENTS.md",
    "APPEND_SYSTEM.md",
    "allowed-tools.json",
    "sources.lock.json",
    "runtime",
    "extensions",
    "themes",
    "packages",
    "node_modules",
)
PASSTHROUGH_ENV: Final = (
    "LANG",
    "LC_ALL",
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


@dataclass(frozen=True)
class BridgePaths:
    static_profile: Path = STATIC_PROFILE
    log_dir: Path = LOG_DIR
    pi_command: tuple[str, ...] = (str(NODE_BINARY), str(PI_ENTRYPOINT))
    runtime_parent: Path = RUNTIME_PARENT


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
    final_message: str = ""
    settled: bool = False


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def collect_auth_values(value: object) -> set[str]:
    values: set[str] = set()
    if isinstance(value, str):
        if value:
            values.add(value)
    elif isinstance(value, dict):
        mapping = cast(dict[object, object], value)
        for nested in mapping.values():
            values.update(collect_auth_values(nested))
    elif isinstance(value, list):
        sequence = cast(list[object], value)
        for nested in sequence:
            values.update(collect_auth_values(nested))
    return values


def decode_auth(encoded: str) -> tuple[bytes, Redactor]:
    if not encoded:
        raise BridgeFailure(EXIT_AUTH, "auth", "PI_CODEX_AUTH_JSON_B64 is required")
    try:
        decoded = base64.b64decode(encoded, validate=True)
        parsed = cast(object, json.loads(decoded))
    except (binascii.Error, UnicodeDecodeError, json.JSONDecodeError) as error:
        raise BridgeFailure(EXIT_AUTH, "auth", "invalid base64 auth JSON") from error
    if not isinstance(parsed, dict):
        raise BridgeFailure(EXIT_AUTH, "auth", "auth JSON must be an object")
    auth_values = collect_auth_values(cast(dict[object, object], parsed))
    auth_values.add(encoded)
    return decoded, Redactor.from_values(auth_values)


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


def prepare_runtime_profile(
    paths: BridgePaths,
    source_env: Mapping[str, str],
) -> RuntimeProfile:
    encoded = source_env.get("PI_CODEX_AUTH_JSON_B64", "")
    decoded_auth, redactor = decode_auth(encoded)

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

        auth_path = root / "auth.json"
        descriptor = os.open(auth_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(decoded_auth)
            stream.flush()
            os.fsync(stream.fileno())
        os.chmod(auth_path, 0o600)

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
            "PYTHONSAFEPATH": "1",
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
            child_env=child_env,
            redactor=redactor.with_values(proxy_secrets),
        )
    except Exception:
        shutil.rmtree(root, ignore_errors=True)
        raise


def build_pi_argv(paths: BridgePaths, allowed_tools: tuple[str, ...]) -> list[str]:
    return [
        *paths.pi_command,
        "--mode",
        "rpc",
        "--no-session",
        "--no-approve",
        "--model",
        f"{MODEL_PROVIDER}/{MODEL_ID}",
        "--thinking",
        THINKING_LEVEL,
        "--append-system-prompt",
        str(paths.static_profile / "APPEND_SYSTEM.md"),
        "--tools",
        ",".join(allowed_tools),
    ]


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


def process_event(
    process: subprocess.Popen[str],
    event: JsonObject,
    state: EventState,
    *,
    capture_completion: bool = True,
) -> None:
    event_type = event.get("type")
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
        if text:
            state.final_message = text
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
    if not active.issubset(allowed):
        raise BridgeFailure(EXIT_STARTUP, "startup", "unexpected active startup tools")
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
    timeout_seconds: float,
    paths: BridgePaths,
    source_env: Mapping[str, str],
    stop_event: threading.Event | None = None,
) -> int:
    started_at = utc_now()
    started_monotonic = time.monotonic()
    paths.log_dir.mkdir(parents=True, exist_ok=True)
    stop = stop_event or threading.Event()
    initial_redactor = Redactor(
        (source_env["PI_CODEX_AUTH_JSON_B64"],) if source_env.get("PI_CODEX_AUTH_JSON_B64") else ()
    )
    redactor = initial_redactor
    runtime: RuntimeProfile | None = None
    process: subprocess.Popen[str] | None = None
    logs: StreamLogs | None = None
    stdout_thread: threading.Thread | None = None
    stderr_thread: threading.Thread | None = None
    state = EventState()
    tool_state: JsonObject | None = None
    initial_state: JsonObject | None = None
    final_state: JsonObject | None = None
    error_class: str | None = None
    error_message: str | None = None
    exit_code = EXIT_OK

    try:
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
        task_id = source_env.get("TASK_ID", "")
        if not task_id:
            raise BridgeFailure(EXIT_PROTOCOL, "protocol", "TASK_ID is required")
        allowed_tools = load_allowed_tools(paths.static_profile)
        runtime = prepare_runtime_profile(paths, source_env)
        redactor = runtime.redactor
        logs = open_stream_logs(paths.log_dir)
        argv = build_pi_argv(paths, allowed_tools)
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

        send_command(
            process,
            {"id": "task", "type": "prompt", "message": problem_text},
        )
        _ = await_response(
            process,
            events,
            state,
            "task",
            deadline,
            stop,
            capture_completion=False,
        )
        state.final_message = ""
        state.settled = False

        while not state.settled:
            event = next_event(process, events, deadline, stop)
            process_event(process, event, state)

        if not state.final_message.strip():
            raise BridgeFailure(EXIT_PROTOCOL, "protocol", "settled without final assistant text")

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
        write_json_atomic(
            paths.log_dir / "metrics.json",
            {
                "initialState": initial_state,
                "finalState": final_state,
                "agentSettled": state.settled,
                "finalMessageObserved": bool(state.final_message),
                "durationSeconds": round(time.monotonic() - started_monotonic, 3),
            },
        )
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
                abort_rpc=exit_code != EXIT_OK,
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

        task_id = source_env.get("TASK_ID", "")
        summary: dict[str, object] = {
            "version": 2,
            "taskId": task_id,
            "problemStatementPath": str(problem_statement),
            "startedAt": started_at,
            "endedAt": utc_now(),
            "durationSeconds": round(time.monotonic() - started_monotonic, 3),
            "timeoutSeconds": timeout_seconds,
            "exitCode": exit_code,
            "outcome": "agent_settled" if exit_code == EXIT_OK else "failed",
            "agentSettled": state.settled,
            "finalMessageObserved": bool(state.final_message),
            "errorClass": error_class,
            "error": error_message,
            "toolState": tool_state,
            "model": f"{MODEL_PROVIDER}/{MODEL_ID}",
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


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run pinned Pi in unattended Valkyrie RPC mode")
    parser.add_argument("--problem-statement", type=Path, required=True)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--timeout-seconds", type=float, default=7200)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    problem_path = cast(Path, args.problem_statement)
    try:
        problem_text = problem_path.read_text()
    except OSError as error:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        write_json_atomic(
            LOG_DIR / "summary.json",
            {
                "version": 1,
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
        timeout_seconds=cast(float, args.timeout_seconds),
        paths=BridgePaths(),
        source_env=source_env,
        stop_event=stop_event,
    )


if __name__ == "__main__":
    raise SystemExit(main())
