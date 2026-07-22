/**
 * Subagent completion notifications.
 *
 * Successful (completed) async results that need a full fallback are held
 * briefly and emitted as a single grouped message when sibling jobs finish
 * within a short window (see `completion-batcher.ts`). Delivered results need
 * no fallback, while uncertain delivery timeouts emit metadata-only retrieval
 * notices. Failed and paused full fallbacks bypass grouping and fire immediately.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import * as fs from "node:fs";
import {
	MODEL_VISIBLE_COMPLETION_BUDGET,
	boundCompletionOutput,
	completionItemBudget,
} from "../../shared/completion-output.ts";
import { buildCompletionKey, getGlobalSeenMap, markSeenWithTtl } from "./completion-dedupe.ts";
import {
	type CompletionBatchConfig,
	type CompletionBatcher,
	createCompletionBatcher,
	resolveCompletionBatchConfig,
} from "./completion-batcher.ts";
import {
	SUBAGENT_ASYNC_COMPLETE_EVENT,
	type SubagentResultDeliveryState,
	type SubagentState,
} from "../../shared/types.ts";

interface ChainStepResult {
	agent: string;
	output: string;
	success: boolean;
	artifactPath?: string;
	artifactPaths?: { outputPath?: string };
}

export interface SubagentNotifyDetails {
	agent: string;
	status: "completed" | "failed" | "paused";
	taskInfo?: string;
	resultPreview: string;
	runId?: string;
	cwd?: string;
	launchedAt?: number;
	outputPath?: string;
	durationMs?: number;
	sessionLabel?: string;
	sessionValue?: string;
}

interface SubagentResult {
	id: string | null;
	runId?: string | null;
	agent: string | null;
	success: boolean;
	summary: string;
	exitCode?: number;
	state?: string;
	timestamp: number;
	durationMs?: number;
	cwd?: string;
	sessionFile?: string;
	shareUrl?: string;
	gistUrl?: string;
	shareError?: string;
	results?: ChainStepResult[];
	taskIndex?: number;
	totalTasks?: number;
	sessionId?: string | null;
	deliveryState?: SubagentResultDeliveryState;
}

interface NotifyTimerApi {
	setTimeout(handler: () => void, delayMs: number): unknown;
	clearTimeout(handle: unknown): void;
}

export interface RegisterSubagentNotifyOptions {
	batchConfig?: CompletionBatchConfig;
	timers?: NotifyTimerApi;
	now?: () => number;
	existsSync?: (path: string) => boolean;
}

function formatSessionLine(details: SubagentNotifyDetails): string | undefined {
	if (!details.sessionValue) return undefined;
	return details.sessionLabel ? `${details.sessionLabel}: ${details.sessionValue}` : details.sessionValue;
}

function formatMetadataLines(details: SubagentNotifyDetails): string[] {
	return [
		details.runId ? `Run: ${details.runId}` : undefined,
		`Role: ${details.agent}`,
		details.cwd ? `Cwd: ${details.cwd}` : undefined,
		typeof details.launchedAt === "number" ? `Launched: ${new Date(details.launchedAt).toISOString()}` : undefined,
		`Output: ${details.outputPath ?? "(not configured)"}`,
	].filter((line): line is string => line !== undefined);
}

export function formatSingleCompletion(details: SubagentNotifyDetails): string {
	const sessionLine = formatSessionLine(details);
	return [
		`Background task ${details.status}: **${details.agent}**${details.taskInfo ?? ""}`,
		...formatMetadataLines(details),
		"",
		details.resultPreview.trim() ? details.resultPreview : "(no output)",
		sessionLine ? "" : undefined,
		sessionLine,
	]
		.filter((line) => line !== undefined)
		.join("\n");
}

export function formatGroupedCompletion(details: SubagentNotifyDetails[]): string {
	const header = `Background tasks completed (${details.length}): ${details.map((d) => `**${d.agent}**${d.taskInfo ?? ""}`).join(", ")}`;
	const blocks: string[] = [header, ""];
	for (let index = 0; index < details.length; index++) {
		const detail = details[index];
		if (!detail) continue;
		const sessionLine = formatSessionLine(detail);
		blocks.push(`${index + 1}. ${detail.agent}${detail.taskInfo ?? ""}`);
		blocks.push(...formatMetadataLines(detail));
		blocks.push("");
		blocks.push(detail.resultPreview.trim() ? detail.resultPreview : "(no output)");
		if (sessionLine) blocks.push(sessionLine);
		blocks.push("");
	}
	return blocks.join("\n").trimEnd();
}

function sendNotification(pi: Pick<ExtensionAPI, "sendMessage">, content: string, display = true): void {
	const bounded = boundCompletionOutput(
		content,
		MODEL_VISIBLE_COMPLETION_BUDGET,
		"Use the listed run IDs with subagent status to retrieve full output",
	);
	pi.sendMessage(
		{
			customType: "subagent-notify",
			content: bounded.text,
			display,
		},
		{ triggerTurn: true, deliverAs: "followUp" },
	);
}

function completionRecoveryHint(details: SubagentNotifyDetails): string | undefined {
	if (details.outputPath) return `Full output: ${details.outputPath}`;
	if (details.sessionValue) return `${details.sessionLabel ?? "Session"}: ${details.sessionValue}`;
	if (details.runId) return `Inspect: subagent({ action: "status", id: "${details.runId}" })`;
	return undefined;
}

function sendCompletion(pi: Pick<ExtensionAPI, "sendMessage">, details: SubagentNotifyDetails[], display = true): void {
	if (details.length === 0) return;
	const itemBudget = completionItemBudget(details.length);
	const boundedDetails = details.map((detail) => ({
		...detail,
		resultPreview: boundCompletionOutput(detail.resultPreview, itemBudget, completionRecoveryHint(detail)).text,
	}));
	const content = boundedDetails.length === 1
		? formatSingleCompletion(boundedDetails[0]!)
		: formatGroupedCompletion(boundedDetails);
	sendNotification(pi, content, display);
}

function sendTimedOutCompletion(pi: Pick<ExtensionAPI, "sendMessage">, details: SubagentNotifyDetails): void {
	const sessionLine = formatSessionLine(details);
	const content = [
		`Background task ${details.status} (intercom delivery timed out): **${details.agent}**${details.taskInfo ?? ""}`,
		...formatMetadataLines(details),
		details.runId ? `Inspect: subagent({ action: "status", id: "${details.runId}" })` : undefined,
		sessionLine ? "" : undefined,
		sessionLine,
	]
		.filter((line) => line !== undefined)
		.join("\n");
	sendNotification(pi, content);
}

function completionBatchKey(result: SubagentResult): string {
	const sessionId = typeof result.sessionId === "string" ? result.sessionId.trim() : "";
	if (sessionId) return `session:${sessionId}`;
	const cwd = typeof result.cwd === "string" ? result.cwd.trim() : "";
	return cwd ? `cwd:${cwd}` : "unknown";
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function resolveOutputPath(result: SubagentResult, existsSync: (path: string) => boolean): string | undefined {
	for (const child of result.results ?? []) {
		const outputPath = nonEmptyString(child.artifactPath) ?? nonEmptyString(child.artifactPaths?.outputPath);
		if (outputPath && existsSync(outputPath)) return outputPath;
	}
	return undefined;
}

export function buildCompletionDetails(
	result: SubagentResult,
	existsSync: (path: string) => boolean = fs.existsSync,
): SubagentNotifyDetails {
	const agent = result.agent ?? "unknown";
	const summary = typeof result.summary === "string" ? result.summary : "";
	const paused = !result.success && (
		result.exitCode === 0
		|| result.state === "paused"
		|| summary.startsWith("Paused after interrupt.")
	);
	const status = paused ? "paused" : result.success ? "completed" : "failed";

	const taskInfo =
		result.taskIndex !== undefined && result.totalTasks !== undefined
			? ` (${result.taskIndex + 1}/${result.totalTasks})`
			: undefined;

	const session =
		result.shareUrl
			? { label: "Session", value: result.shareUrl }
			: result.shareError
				? { label: "Session share error", value: result.shareError }
				: result.sessionFile
					? { label: "Session file", value: result.sessionFile }
					: undefined;

	const runId = nonEmptyString(result.runId) ?? nonEmptyString(result.id);
	const outputPath = resolveOutputPath(result, existsSync);
	const durationMs = typeof result.durationMs === "number" && Number.isFinite(result.durationMs) ? result.durationMs : undefined;
	const launchedAt = typeof result.timestamp === "number" && Number.isFinite(result.timestamp)
		? result.timestamp - (durationMs ?? 0)
		: undefined;

	return {
		agent,
		status,
		...(taskInfo ? { taskInfo } : {}),
		resultPreview: summary,
		...(runId ? { runId } : {}),
		...(nonEmptyString(result.cwd) ? { cwd: nonEmptyString(result.cwd) } : {}),
		...(launchedAt !== undefined ? { launchedAt } : {}),
		...(outputPath ? { outputPath } : {}),
		...(durationMs !== undefined ? { durationMs } : {}),
		...(session ? { sessionLabel: session.label, sessionValue: session.value } : {}),
	};
}

export default function registerSubagentNotify(
	pi: ExtensionAPI,
	state: Pick<SubagentState, "currentSessionId">,
	options: RegisterSubagentNotifyOptions = {},
): void {
	const unsubscribeStoreKey = "__pi_subagents_notify_unsubscribe__";
	const batcherStoreKey = "__pi_subagents_notify_batcher__";
	const globalStore = globalThis as Record<string, unknown>;
	const previousUnsubscribe = globalStore[unsubscribeStoreKey];
	if (typeof previousUnsubscribe === "function") {
		try {
			previousUnsubscribe();
		} catch {
			// Best effort cleanup for stale handlers from an older reload.
		}
	}
	const previousBatcher = globalStore[batcherStoreKey];
	if (previousBatcher && typeof (previousBatcher as { dispose?: () => void }).dispose === "function") {
		try {
			(previousBatcher as { dispose: () => void }).dispose();
		} catch {
			// Best effort cleanup for a stale batcher from an older reload.
		}
	}

	const seen = getGlobalSeenMap("__pi_subagents_notify_seen__");
	const ttlMs = 10 * 60 * 1000;
	const nowFn = options.now ?? Date.now;
	const batchConfig = resolveCompletionBatchConfig(options.batchConfig);
	const batchers = new Map<string, CompletionBatcher<SubagentNotifyDetails>>();
	globalStore[batcherStoreKey] = {
		dispose() {
			for (const batcher of batchers.values()) {
				batcher.flush();
				batcher.dispose();
			}
			batchers.clear();
		},
	};

	const handleComplete = (data: unknown) => {
		const result = data as SubagentResult;
		if (typeof result.sessionId !== "string" || result.sessionId !== state.currentSessionId) return;
		const now = nowFn();
		if (typeof result.timestamp === "number" && Number.isFinite(result.timestamp) && now - result.timestamp > ttlMs) return;
		const key = buildCompletionKey(result, "notify");
		if (markSeenWithTtl(seen, key, now, ttlMs)) return;

		const details = buildCompletionDetails(result, options.existsSync ?? fs.existsSync);
		switch (result.deliveryState ?? "not_requested") {
			case "delivered":
				sendCompletion(pi, [details], false);
				return;
			case "timed_out":
				sendTimedOutCompletion(pi, details);
				return;
			case "failed":
			case "not_requested":
				break;
		}

		const batchKey = completionBatchKey(result);
		let batcher = batchers.get(batchKey);
		if (!batcher) {
			batcher = createCompletionBatcher<SubagentNotifyDetails>({
				config: batchConfig,
				emit: (items) => sendCompletion(pi, items),
				...(options.timers ? { timers: options.timers } : {}),
				now: nowFn,
			});
			batchers.set(batchKey, batcher);
		}
		if (details.status !== "completed") {
			// Failures and paused runs bypass grouping. Flush any held
			// successes for the same owner first so they are not stranded
			// behind this signal, then emit the non-completion result immediately.
			batcher.flush();
			sendCompletion(pi, [details]);
			return;
		}
		batcher.push(details);
	};

	globalStore[unsubscribeStoreKey] = pi.events.on(SUBAGENT_ASYNC_COMPLETE_EVENT, handleComplete);
}
