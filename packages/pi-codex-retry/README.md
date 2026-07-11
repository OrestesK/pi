# pi-codex-retry

Retries recoverable OpenAI Codex transport failures while preserving live streaming.

## Install

> Pi packages run with full local permissions. Review the source before installing.

From this package directory:

```sh
pi install "$PWD"
```

## Usage

No command is required. Once installed, the extension wraps the `openai-codex-responses` provider automatically.

Defaults are three total attempts with a 1,000 ms base exponential-backoff delay.

## Configuration

| Setting | CLI flag | Environment variable |
| --- | --- | --- |
| Total attempts | `--codex-retry-max-attempts <n>` | `PI_CODEX_RETRY_MAX_ATTEMPTS=<n>` |
| Base delay in milliseconds | `--codex-retry-base-delay-ms <ms>` | `PI_CODEX_RETRY_BASE_DELAY_MS=<ms>` |

A valid finite, non-negative CLI value takes precedence over its environment variable. Decimal values are truncated; total attempts are clamped to at least one.

## Retry behavior

- Streams successful attempts live.
- Retries recoverable failures before visible progress, including WebSocket close failures, connection-ended and network errors, timeouts, and HTTP 502/503/504 responses.
- Uses `transport: "sse"` after the first failed attempt so the same WebSocket path is not retried repeatedly.
- Does not retry aborts or failures after a `start`, text, thinking, or tool-call progress event.
- Covers raw and simple provider streams, including direct `complete()` callers and compaction extensions.

## Development

```sh
npm ci
npm test
npm run typecheck
```

## License

MIT
