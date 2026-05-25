/**
 * Compact Advisor
 *
 * Shows a non-blocking context-size notice when usage exceeds a threshold.
 * Core pi auto-compaction remains responsible for unattended compaction near
 * the model limit; this extension must not prompt or compact at agent_end.
 */

import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

const THRESHOLD_TOKENS = 150_000;
const COOLDOWN_MS = 5 * 60 * 1000;

function isStaleContextError(error: unknown) {
	return (
		error instanceof Error &&
		error.message.includes(
			"extension ctx is stale after session replacement or reload",
		)
	);
}

export default function (pi: ExtensionAPI) {
	let lastSuggested = 0;

	pi.on("agent_end", (_event, ctx) => {
		try {
			if (!ctx.hasUI) return;

			const usage = ctx.getContextUsage();
			if (!usage || usage.tokens < THRESHOLD_TOKENS) return;

			const now = Date.now();
			if (now - lastSuggested < COOLDOWN_MS) return;
			lastSuggested = now;

			ctx.ui.notify(
				`Context at ${Math.round(usage.tokens / 1000)}k tokens. Core auto-compaction is enabled; use /compact or /continue manually if you want an earlier reset.`,
				"info",
			);
		} catch (error) {
			if (isStaleContextError(error)) return;
			throw error;
		}
	});
}
