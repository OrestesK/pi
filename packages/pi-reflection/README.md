# pi-reflection

Backend-neutral asynchronous Reflection lifecycle extension for Pi.

## Current status

Reflection is currently in metadata-only shadow mode. The extension observes configured lifecycle checkpoints and records bounded in-memory metadata, but the packaged semantic bundle is not ready. It does not launch reflection work, emit a parent-facing result, or discover the placeholder agent, prompt, or skill.

Recorded observations exclude request payloads, provider outputs, and working directories. At most 256 observations from the active session are retained.

## Package loading

The local runtime loads only the extension entry point:

```json
{
  "source": "packages/pi-reflection",
  "autoload": false,
  "extensions": ["+index.ts"],
  "skills": [],
  "prompts": [],
  "themes": []
}
```

The files under `agents/`, `prompts/`, and `skills/` are explicit inactive placeholders. Adding content to them does not make them discoverable.

## Public surface

The package root exports:

- the default Pi extension;
- `REFLECTION_PROVIDER_DISCOVERY_EVENT` and its discovery payload type;
- the `ReflectionProvider`, `ReflectionRequest`, and `ReflectionResult` types.

The `./contracts` export exposes the complete backend-neutral contract module.

At `session_start`, the extension emits `pi-reflection:providers:discover:v1`. Another loaded extension can listen for that event and register a provider through the supplied `register(provider)` callback. Registration returns an unregister callback. The Reflection extension owns provider selection, lifecycle scheduling, cancellation, stale-result rejection, and observation metadata; providers own execution at their backend boundary.

## Configuration

Configuration belongs under the `pi-reflection` key in `settings.json`.

| Key | Default | Contract |
| --- | --- | --- |
| `enabled` | `true` | Boolean. When false, the extension does not register its runtime. |
| `resourcesReady` | `false` | Boolean deployment gate. This alone cannot enable launches. |
| `providerId` | unset | Optional provider identifier: 1–128 letters, digits, `.`, `_`, or `-`, beginning with a letter or digit. |
| `promptStartTrigger` | `true` | Boolean. Records a prompt checkpoint after prompt-start invalidation. |
| `intervalTrigger` | `true` | Boolean. Records checkpoints at the configured turn cadence. |
| `turnInterval` | `4` | Positive safe integer number of completed turns between interval checkpoints. |
| `agentEndTrigger` | `true` | Boolean. Records a checkpoint after every low-level `agent_end`. |
| `readinessTimeoutMs` | `500` | Positive safe integer timeout in milliseconds, up to `2147483647`, for provider readiness probing. |

The loader reads global settings first from `$PI_CODING_AGENT_DIR/settings.json`, or `~/.pi/agent/settings.json` when that variable is unset. It then reads `<cwd>/.pi/settings.json`. Project values override global values by key. Unknown keys are ignored; known keys fail closed when their value does not satisfy the contract above.

## Lifecycle behavior

The extension currently handles:

- `session_start` — initializes session metadata, discovers providers, and refreshes built-in provider availability;
- `before_agent_start` — invalidates prior generations and optionally records a prompt checkpoint;
- `turn_end` — advances session state and interval cadence;
- `agent_end` — optionally records a checkpoint for each low-level run, including runs followed by Pi retry, compaction recovery, or queued continuation;
- `session_tree` and `session_compact` — invalidate active generations and interval cadence;
- `session_shutdown` — closes the session, cancels active work, and disposes providers.

Each lane (`prompt`, `interval`, and `agent_end`) allows one active generation. Repeated work for the same lane and state coalesces; newer state supersedes older work in that lane. Other lanes remain independent.

Because both deployment gates must pass, the current immutable semantic bundle keeps every checkpoint at `resources_not_ready` even when `resourcesReady` is set to `true`.

## Enabling semantic Reflection

Semantic activation must be one coordinated change. Do not enable only a placeholder or only `resourcesReady`.

The enabling change must provide all of the following together:

1. designed and discoverable prompt, agent, or skill resources;
2. a semantic bundle manifest and explicit request/result contract, with the package bundle marked ready;
3. an adapter launch path that invokes the selected provider and validates its result contract;
4. package discovery configuration for the intended resources;
5. `resourcesReady: true` in the intended deployment scope;
6. focused proof for launch, cancellation, stale results, privacy, and parent-facing delivery.

Until those pieces exist, the placeholders and adapter launch path must remain inactive.
