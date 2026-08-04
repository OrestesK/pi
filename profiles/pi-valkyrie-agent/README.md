# ok-pi-agent

Private, pinned Pi agent profile for unattended benchmark execution through Valkyrie. Agent-facing instructions are benchmark-neutral; each Valkyrie contract owns its timeout and network policy.

The historical two-task run is diagnostic only. One task retrieved the exact upstream patch through hosted web tools that are no longer part of this profile.

## Runtime contract

- Valkyrie installs the bundle with `bash /bundle/ok-pi-agent/setup.sh`.
- Valkyrie executes `/usr/local/bin/python3 /bundle/ok-pi-agent/run_agent.py` from the benchmark workspace.
- ValSmith supplies `/workspace/problem_statement.md`.
- Valkyrie substitutes task identity into `--task-id`; the bridge keeps it in parent-side accounting and does not pass it to Pi.
- Every run must declare the Vals model key `openai/gpt-5.6-sol`; the bridge runs the pinned direct Pi model `openai/gpt-5.6-sol` and rejects other labels.
- Every run must explicitly supply `prompt_profile=simple` or `prompt_profile=adapted`; neither contract has a default.
- The restricted contract deadline is 7,200 seconds.
- The SREBench contract has a 14,400-second primary-bridge deadline and a 500-primary-tool-completion default.
- ValSmith owns task resolution; bridge settlement or step-limit termination is not a correctness verdict.

The raw `{problem_statement_path}` replacement is safe only for the Valkyrie-owned fixed path above. Other benchmark providers require a separately reviewed contract.

### Vibe Code Bench contract

`contract.vcb.yaml` defines a separate unrestricted-network policy with an 18,000-second deadline. It uses the same benchmark-neutral profile and requires `trusted_mcp_config_path`, an infrastructure-owned regular file mounted outside the task workspace. The bridge validates and copies that file into the isolated runtime; task-workspace `.mcp.json`, `.pi/mcp.json`, and ambient imports are always ignored.

Infrastructure that previously wrote MCP configuration inside `/workspace` must migrate to an external mount before using this contract. Missing, workspace-contained, symlinked, malformed, or conflicting configuration fails before Pi starts. The profile does not name or special-case any benchmark MCP service.

For publication, `contract.vcb.yaml` must be selected as `contract.yaml` in a disposable bundle named `ok-pi-agent-vcb`. Agent publication, infrastructure migration, and benchmark execution remain separate protected actions.

The corresponding run shape must include an external path, for example:

```text
valk run start --benchmark vcb --agent ok-pi-agent-vcb --model openai/gpt-5.6-sol -k prompt_profile=adapted -k trusted_mcp_config_path=/run/benchmark/mcp.json --concurrency 40 --lambda vcb-final-view-lambda
```

### SREBench contract

`contract.srebench.yaml` retains the restricted contract's complete Pi tool, package, npm, Context7, model, prompt, and egress surface. It has a 14,400-second primary-bridge deadline and defaults `max_steps` to 500. For publication, it must be selected as `contract.yaml` in a disposable bundle named `ok-pi-agent-srebench`.

The trusted SREBench contract identifies `/workspace/mcp.json` as benchmark-owned input created by the pinned sandbox generator before Pi starts. That file is a bare MCP server map, so `--trusted-mcp-server-map` wraps it in memory under `mcpServers` and merges it with the two bundled servers. This explicit input is the only task-workspace MCP exception: Pi still performs no project MCP discovery, and the existing `--trusted-mcp-config` path continues to reject workspace-contained files. The bridge validates regular-file handling and server-name collisions but does not verify generator provenance; infrastructure owns the pinned-source assertion.

`max_steps` counts completed tools observed on the primary Pi RPC stream. Each top-level `subagent` or MCP gateway call counts once. Tool calls inside detached subagents are excluded, and detached work is not guaranteed to stop when the primary limit is reached. The four-hour deadline therefore bounds the primary bridge, not aggregate child work or total cost. Reaching the limit aborts and cleans up the primary Pi process group, writes a gradeable `max_steps_reached` result, and exits `0` without requiring a final message or `agent_settled`.

## Architecture

1. `setup.sh` verifies the anchored profile manifest and vendored source hashes, installs the pinned Node 26.4.0 runtime, npm lock, `rg`, and `fd`, then runs the prompt-free MCP/RPC startup check.
2. `run_agent.py` validates the required prompt profile, creates an isolated mode-`0700` Pi directory, and links only the selected prompt as runtime `AGENTS.md` alongside the common verified resources.
3. The bridge requires Valkyrie's injected `OPENAI_API_KEY`, passes it only through the narrow Pi child environment, excludes unrelated credentials, and launches pinned Pi 0.80.6 in RPC mode without creating a credential file.
4. Pi starts with project settings, context files, extensions, skills, templates, themes, agents, chains, packages, and MCP discovery disabled. The bridge supplies only pinned profile resources, and a dedicated extension writes atomic `tool-state.json` attestation.
5. The bridge submits the problem statement with a unique final-response token, cancels dialog UI requests, waits for `agent_settled`, accepts exactly one task response bearing that token, ignores unmarked notification-only follow-ups, redacts every observability artifact, and terminates the complete process group.

The `simple` prompt is the compact benchmark baseline. The `adapted` prompt extracts portable engineering methodology from Pi config commit `c4ea355` while removing personal style, machine preferences, unavailable capabilities, and human approval waits. Both use the same benchmark-only `APPEND_SYSTEM.md` and otherwise share the exact model, thinking, package, tool, MCP, and network configuration. The selected profile and prompt SHA-256 are written to `summary.json`.

The profile uses direct `openai/gpt-5.6-sol`, high thinking, OpenAI's default service tier, retries, native compaction, Slipstream auto-triggering, Pi Lens with 12 offline grammars, FFF-backed `find` and `grep`, current subagents and selected current role/skill resources, the local Pi Intercom relay, Context Mode, and anonymous Context7. Pi 0.80.6 supplies built-in Sol/Terra/Luna metadata with a 272,000-token short-context limit and 128,000-token output limit. The public `intercom` tool remains outside the startup allowlist. Context Mode URL fetching is excluded.

### Current-config snapshot deviations

- The adapted role set contains `clone`, `context-builder`, `oracle`, `planner`, `researcher`, `reviewer`, and `scout`. `run-monitor` is excluded because its parent-managed tmux and acknowledgement lifecycle is unavailable. Legacy `delegate`, `general-purpose`, and `worker` are disabled or absent.
- Portable engineering, design, delegation, planning, review, and verification skills are retained with unattended decision rules. Browser, desktop, GitHub/PR, AWS/private-service, host-session, commit, and interactive-only skills are excluded.
- `pi-goal-supervisor` is excluded because its continuation turns and `GOAL_DONE` judge protocol conflict with the bridge's exactly-one final marker plus `agent_settled` contract.
- Role frontmatter uses only direct OpenAI models and tools in the closed profile allowlist. Scheduled subagent runs are disabled and the public `intercom` alias remains outside the model tool surface.

Bootstrap is not network-restricted: `setup.sh` requires the Node distribution, GitHub release assets, and npm registry. During restricted task execution only direct OpenAI and Context7 egress are declared. The VCB contract remains unrestricted because VCB requires package installation and a dynamic local service endpoint.

## Runtime secret

The contract maps:

```text
OPENAI_API_KEY -> prodBenchmarksInfraApiKeys
```

Valkyrie resolves the referenced secret and injects the environment variable before the bridge starts. The bridge does not query AWS Secrets Manager or write the key to disk. The key remains readable to same-UID Pi tools and child processes; output redaction is not a credential-isolation boundary.

## Output

The bridge writes under `/logs/ok-pi-agent`:

- `trajectory.jsonl`
- `raw_output.txt`
- `stderr.txt`
- `final_message.txt`
- `summary.json`, including `promptProfile`, `promptSha256`, `maxSteps`, and `primaryToolCompletions`
- `metrics.json`, including `terminationReason`, `maxSteps`, and `primaryToolCompletions`
- `tool-state.json`
- `compactions/`

Valkyrie archives existing output and continues evaluation for exits `0`, `124`, and `137`. Bridge exits `20`–`23` are runtime errors and do not reach final-output archive handling.

## Exit codes

| Code | Meaning |
|---:|---|
| 0 | Pi either produced one marked final response and reached `agent_settled`, or reached the configured primary tool-completion limit with outcome `max_steps_reached`; ValSmith still determines task resolution |
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

The profile RPC check performs a direct MCP `initialize` and `tools/list` exchange for context-mode, validates the lazy anonymous Context7 configuration, then starts pinned Pi, calls `get_state`, verifies that the Intercom extension does not expose a model tool, validates startup tool attestation, and exits without submitting a prompt.

## Security boundary

- The restricted contract declares task-time egress only to `api.openai.com` and `mcp.context7.com`. Context Mode's explicit URL-fetch method remains excluded.
- The VCB contract has unrestricted task-time egress and requires an infrastructure-owned MCP config outside the task workspace. Pi, subagents, and local tool subprocesses share a UID and can read `OPENAI_API_KEY`; agent-facing policy and artifact redaction reduce accidental disclosure but are not a hard credential-isolation boundary.
- The SREBench contract retains restricted egress and explicitly trusts only its infrastructure-selected `/workspace/mcp.json` bare server map. Other project MCP files remain untrusted and undiscovered.
- Repository `AGENTS.md`, `CLAUDE.md`, `.pi` resources, package declarations, agents, chains, and MCP files are untrusted and are not loaded by the primary or child Pi runtimes.
- Only the selected bundled prompt is injected as runtime `AGENTS.md`. The alternate immutable prompt remains readable under `/bundle`, so the single-bundle design is not treatment-blind.
- Slipstream auto-compaction remains enabled and may use its configured summary and judge models when its threshold is reached; this behavior must be disclosed with benchmark results.

## Provenance and rollout

The synchronized profile is based on Pi config commit `c4ea35540681a4240eae84e3f1eb61c28e6fd9f6`. `profile/sources.lock.json` pins both prompt variants, exact current vendor sources and overlays, profile content, and downloaded binary hashes. Historical results without `promptProfile` and `promptSha256` are unlabeled and must not be assigned a variant from the agent name alone. Comparative runs should precommit or pair profile assignments and must not claim treatment blindness.

A live Valkyrie run, credential use, merge, and release remain separate approval boundaries.
