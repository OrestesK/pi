# pi-openai-service-tier

[![CI](https://github.com/OrestesK/pi-openai-service-tier/actions/workflows/ci.yml/badge.svg)](https://github.com/OrestesK/pi-openai-service-tier/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Cost-correct OpenAI service tier / fast mode for [Pi](https://github.com/earendil-works/pi). This fork follows Pi's configurable agent directory and enables Priority processing by default for the configured model allow-list.

Most fast-mode extensions only patch the outgoing JSON payload:

```ts
{ service_tier: "priority" }
```

That can route the request correctly, but Pi's displayed cost accounting uses its internal provider option named `serviceTier`. This extension wraps Pi's built-in OpenAI provider calls and passes:

```ts
{ ...options, serviceTier: "priority" }
```

So Pi gets both the OpenAI request field and the matching Pi-side service-tier cost multiplier.

## Features

- `/fast` toggles cost-correct `priority` tier.
- `/openai-tier` selects `priority`, `flex`, `default`, `auto`, or `scale`.
- Works with Pi's OpenAI Responses and OpenAI Codex Responses providers.
- Avoids sending tiers that a provider does not support.
- Includes `gpt-5.4` and `gpt-5.5` OpenAI/Codex models plus GPT-5.6 Sol, Terra, and Luna Codex models by default.
- Does **not** change model, reasoning level, prompts, tools, or `text.verbosity`.
- Does **not** make network calls of its own.
- Stores simple JSON config with project-over-global precedence.

## Install

```bash
pi install https://github.com/OrestesK/pi-openai-service-tier
```

Then start Pi normally; Priority processing is enabled by default for supported models:

```bash
pi --provider openai-codex --model gpt-5.6-sol
```

`--fast` remains available when an explicit startup flag is preferred:

```bash
pi --provider openai-codex --model gpt-5.6-sol --fast
```

Try without installing:

```bash
pi -e https://github.com/OrestesK/pi-openai-service-tier --provider openai-codex --model gpt-5.6-sol --fast
```

## Commands

### Fast mode

```text
/fast
/fast on
/fast off
/fast status
```

`/fast` toggles `priority` service tier on/off.

### Explicit service tier

```text
/openai-tier priority
/openai-tier flex
/openai-tier default
/openai-tier auto
/openai-tier scale
/openai-tier off
/openai-tier status
```

`/openai-tier <tier>` enables that tier for supported models.

## Configuration

The extension uses project-over-global config:

```text
<repo>/.pi/extensions/pi-openai-service-tier.json
$PI_CODING_AGENT_DIR/extensions/pi-openai-service-tier.json
```

When `PI_CODING_AGENT_DIR` is unset, Pi's default `~/.pi/agent` directory is used. If neither file exists, the extension creates this global default on session start:

```json
{
  "persistState": true,
  "active": true,
  "serviceTier": "priority",
  "supportedModels": [
    "openai/gpt-5.4",
    "openai/gpt-5.5",
    "openai-codex/gpt-5.4",
    "openai-codex/gpt-5.5",
    "openai-codex/gpt-5.6-sol",
    "openai-codex/gpt-5.6-terra",
    "openai-codex/gpt-5.6-luna"
  ]
}
```

### Config fields

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `persistState` | boolean | `true` | Whether `/fast` and `/openai-tier` persist state across sessions. |
| `active` | boolean | `true` | Whether a service tier is active. |
| `serviceTier` | `priority` \| `flex` \| `default` \| `auto` \| `scale` | `priority` | Service tier passed to Pi's OpenAI provider option when supported by the current provider. |
| `supportedModels` | string[] | see above | Allow-list of `provider/model-id` pairs that should receive `serviceTier`. |

Add/remove allow-listed models by editing `supportedModels`.

## Supported providers/APIs

The extension applies tiers only when all of these are true:

1. the model appears in `supportedModels`,
2. the model uses one of these Pi APIs:
   - `openai-responses`
   - `openai-codex-responses`, and
3. the selected tier is supported by that API.

Provider-specific tier support:

| Pi API | Supported tiers |
| --- | --- |
| `openai-responses` | `priority`, `flex`, `default`, `auto`, `scale` |
| `openai-codex-responses` | `priority` |

If a tier is configured but unsupported by the current model/provider, the extension leaves `serviceTier` unset for that request instead of sending an invalid value.

[OpenAI Priority processing](https://openai.com/api-priority-processing/) lists GPT-5.6 Sol, Terra, and Luna as supported. GPT-5.6 long-context requests are currently excluded from Priority processing.

## Compatibility notes

This extension overrides Pi's API stream handlers for:

- `openai-responses`
- `openai-codex-responses`

It delegates back to Pi's built-in OpenAI implementations, adding `serviceTier` only for configured/supported OpenAI models. If another extension also overrides those API handlers, whichever extension loads last wins.

Requires Pi `>=0.80.6` and Node.js `>=22.19`. The package installs matching `@earendil-works/pi-ai` code under the `pi-ai-runtime` dependency alias so direct path loading can resolve provider API modules without Pi rewriting those imports through its compatibility alias.

## Updating

For git installs, re-run:

```bash
pi install https://github.com/OrestesK/pi-openai-service-tier
```

## Uninstall

```bash
pi remove https://github.com/OrestesK/pi-openai-service-tier
```

If desired, remove config files manually from the project or configured Pi agent directory.

## Development

```bash
git clone https://github.com/OrestesK/pi-openai-service-tier.git
cd pi-openai-service-tier
npm install
npm run check
```

Local Pi smoke test:

```bash
pi -e ./index.ts --list-models
pi -e ./index.ts --provider openai-codex --model gpt-5.6-sol --fast
```

## Security

Pi extensions run with your local user permissions. This extension only reads/writes its config JSON files and delegates LLM calls to Pi's built-in OpenAI providers; it does not perform independent network requests.

## License

MIT
