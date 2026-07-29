import { spawn } from "node:child_process";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ZJ_RADAR = "/home/orestes/.local/bin/zj-radar";

type RadarStatus = "running" | "done" | "error" | "idle";

function endedWithError(messages: unknown[]): boolean {
	for (let index = messages.length - 1; index >= 0; index--) {
		const message = messages[index];
		if (!message || typeof message !== "object") continue;
		if (!("role" in message) || message.role !== "assistant") continue;
		const stopReason =
			"stopReason" in message ? message.stopReason : undefined;
		return stopReason === "error" || stopReason === "aborted";
	}
	return false;
}

function notify(status: RadarStatus, message: string, cwd: string): void {
	if (!process.env.ZELLIJ || !process.env.ZELLIJ_PANE_ID) return;

	const child = spawn(
		ZJ_RADAR,
		[
			"notify",
			"generic",
			"--status",
			status,
			"--msg",
			message,
			"--source",
			"pi",
		],
		{ cwd, detached: true, stdio: "ignore" },
	);
	child.on("error", () => {});
	child.unref();
}

export default function (pi: ExtensionAPI) {
	let failed = false;

	pi.on("session_start", (_event, ctx) => notify("idle", "", ctx.cwd));
	pi.on("agent_start", (_event, ctx) => {
		failed = false;
		notify("running", "working", ctx.cwd);
	});
	pi.on("agent_end", (event) => {
		failed = endedWithError(event.messages);
	});
	pi.on("agent_settled", (_event, ctx) => {
		if (!ctx.isIdle()) return;
		notify(failed ? "error" : "done", failed ? "failed" : "ready", ctx.cwd);
	});
	pi.on("session_shutdown", (_event, ctx) => notify("idle", "", ctx.cwd));
}
