# ok-pi-agent

Private, pinned Pi agent profile for unattended Valkyrie execution. The benchmark task runtime has an explicit egress allowlist; ValSmith owns workspace diff capture and semantic evaluation.

The historical two-task run is diagnostic only. One task retrieved the exact upstream patch through hosted web tools that are no longer part of this profile.

## Runtime contract

- Valkyrie installs the bundle with `bash /bundle/ok-pi-agent/setup.sh`.
- Valkyrie executes `/usr/local/bin/python3 /bundle/ok-pi-agent/run_agent.py` from the benchmark workspace.
- ValSmith supplies `/workspace/problem_statement.md`.
- Valkyrie substitutes task identity into `--task-id`; the bridge keeps it in parent-side accounting and does not pass it to Pi.
- The default unattended deadline is 7,200 seconds.
- ValSmith owns task resolution; bridge settlement is not a correctness verdict.

The raw `{problem_statement_path}` replacement is safe only for the ValSmith-owned fixed path above. Other benchmark providers require a separately reviewed contract.

## Architecture

1. `setup.sh` verifies the anchored profile manifest and vendored source hashes, installs the pinned Node 26.4.0 runtime, npm lock, `rg`, and `fd`, then runs the prompt-free MCP/RPC startup check.
2. `run_agent.py` creates an isolated mode-`0700` Pi directory and links only curated profile resources, including the verified runtime.
3. The bridge decodes the runtime Codex secret into mode-`0600` `auth.json`, removes the base64 value and unrelated credentials from the Pi child, and launches pinned Pi 0.80.6 in RPC mode.
4. Pi starts with project `.pi` resources disabled and the exact startup tool allowlist. A dedicated extension writes atomic `tool-state.json` attestation.
5. The bridge submits the problem statement as an ordinary prompt, cancels dialog UI requests, waits for `agent_settled`, requires non-empty final assistant text, redacts every observability artifact, and terminates the complete process group.

The profile preserves `openai-codex/gpt-5.6-sol`, max thinking, priority service tier, retries, native compaction, Slipstream auto-triggering, coding rules, Pi Lens, subagents, context-mode MCP, and anonymous Context7 MCP. Context-mode URL fetching is excluded. Broad hosted web search, Docent, personal memory, human interaction, private/OAuth MCP, desktop, guardrails, and image/UI surfaces are excluded.

Bootstrap is not network-restricted: `setup.sh` requires the Node distribution, GitHub release assets, and the npm registry. During task execution Valkyrie permits only ChatGPT model traffic, OpenAI token refresh, and Context7.

## Runtime secret

The contract maps:

```text
PI_CODEX_AUTH_JSON_B64 -> ok-pi-agent-codex-auth-json-b64
```

The value is the complete Codex `auth.json` encoded as base64. Valkyrie may override the AWS Secrets Manager reference at run creation. Never persist or expose the decoded value outside the temporary runtime profile.

## Output

The bridge writes under `/logs/ok-pi-agent`:

- `trajectory.jsonl`
- `raw_output.txt`
- `stderr.txt`
- `final_message.txt`
- `summary.json`
- `metrics.json`
- `tool-state.json`
- `compactions/`

Valkyrie archives existing output and continues evaluation for exits `0`, `124`, and `137`. Bridge exits `20`–`23` are runtime errors and do not reach final-output archive handling.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Pi emitted final assistant text and reached `agent_settled`; ValSmith still determines task resolution |
| 20 | Missing or invalid auth secret |
| 21 | Pinned profile, startup, tool attestation, or handshake failure |
| 22 | RPC, prompt, or final-message protocol failure |
| 23 | Unexpected Pi process exit |
| 124 | Bridge deadline or termination signal after process-group cleanup |

## Local verification

No command below reads credentials or invokes a model.

```bash
XDG_CACHE_HOME=$PWD/.scratch/cache UV_CACHE_DIR=$PWD/.scratch/cache/uv uv run pytest -q
uv run ruff format --check run_agent.py scripts/check_profile_rpc.py tests
uv run basedpyright run_agent.py scripts/check_profile_rpc.py tests
shellcheck setup.sh
npm --prefix profile run check
uv run python -m scripts.verify_profile profile
uv run python -m scripts.check_profile_rpc
```

The profile RPC check performs a direct MCP `initialize` and `tools/list` exchange for context-mode, validates the lazy anonymous Context7 configuration, then starts pinned Pi, calls `get_state`, validates startup tool attestation, and exits without submitting a prompt.

## Security boundary

- Valkyrie permits task-time egress only to `chatgpt.com`, `auth.openai.com`, and `mcp.context7.com`. Context-mode's explicit URL-fetch method remains excluded.
- Pi, subagents, and local tool subprocesses share a UID and can read runtime `auth.json`; the network allowlist reduces but does not eliminate credential-exposure risk.
- Repository `AGENTS.md` and `CLAUDE.md` files are untrusted prompt input. They cannot expand the startup tool or network allowlists.
- Slipstream auto-compaction remains enabled and may use its configured summary and judge models when its threshold is reached; this behavior must be disclosed with benchmark results.

## Provenance and rollout

The source lives on `feat/valkyrie-benchmark-safe`, based on Pi config commit `ef04d8c`. `profile/sources.lock.json` pins vendored profile content and downloaded binary hashes.

A live Valkyrie run, credential use, merge, and release remain separate approval boundaries.
