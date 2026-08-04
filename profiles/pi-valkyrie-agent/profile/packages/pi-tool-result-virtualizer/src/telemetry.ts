import { randomUUID } from "node:crypto";
import { appendFile, chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { ToolDefinitionLike } from "./extension-types.ts";

export type VirtualizationOutcome = "skipped" | "stored" | "failed";
export type VirtualizationReason =
	| "content_threshold"
	| "details_threshold"
	| "below_threshold"
	| "non_text"
	| "protected_result"
	| "skill_read"
	| "already_virtualized"
	| "storage_failure";
export type RetrievalOperation =
	| "outline"
	| "get"
	| "search"
	| "delegate"
	| "list"
	| "diagnostics"
	| "retention_preview";
export type RetrievalOutcome = "success" | "error";

export type TelemetryEventInput =
	| {
			type: "tool_result_observed";
			visibleBytes: number;
			lineCount: number;
	  }
	| {
			type: "virtualization_decision";
			outcome: VirtualizationOutcome;
			reason: VirtualizationReason;
			visibleBytesBefore: number;
			visibleBytesAfter: number;
			storedBytes: number;
			durationMs: number;
	  }
	| {
			type: "retrieval_attempt";
			operation: RetrievalOperation;
	  }
	| {
			type: "retrieval_outcome";
			operation: RetrievalOperation;
			outcome: RetrievalOutcome;
			durationMs: number;
	  }
	| {
			type: "context_compaction_candidate";
			argumentCount: number;
			originalBytes: number;
			returnedBytes: number;
	  };

export interface TelemetrySink {
	record(event: TelemetryEventInput): Promise<void>;
}

type TelemetryDependencies = {
	now?: () => number;
	randomId?: () => string;
};

const disabledTelemetry: TelemetrySink = {
	async record() {},
};

const retrievalOperations = new Map<string, RetrievalOperation>([
	["tool_result_outline", "outline"],
	["tool_result_get", "get"],
	["tool_result_search", "search"],
	["tool_result_delegate", "delegate"],
	["tool_result_list", "list"],
	["tool_result_diagnostics", "diagnostics"],
	["tool_result_retention_preview", "retention_preview"],
]);

export async function recordTelemetry(
	sink: TelemetrySink,
	event: TelemetryEventInput,
): Promise<void> {
	try {
		await sink.record(event);
	} catch {
		// Telemetry must never alter tool behavior.
	}
}

export function instrumentToolDefinition(
	tool: ToolDefinitionLike,
	telemetry: TelemetrySink,
): ToolDefinitionLike {
	const operation = retrievalOperations.get(tool.name);
	if (!operation) return tool;
	return {
		...tool,
		async execute(toolCallId, params, signal, onUpdate, ctx) {
			await recordTelemetry(telemetry, {
				type: "retrieval_attempt",
				operation,
			});
			const startedAt = performance.now();
			try {
				const result = await tool.execute(
					toolCallId,
					params,
					signal,
					onUpdate,
					ctx,
				);
				await recordTelemetry(telemetry, {
					type: "retrieval_outcome",
					operation,
					outcome: "success",
					durationMs: performance.now() - startedAt,
				});
				return result;
			} catch (error) {
				await recordTelemetry(telemetry, {
					type: "retrieval_outcome",
					operation,
					outcome: "error",
					durationMs: performance.now() - startedAt,
				});
				throw error;
			}
		},
	};
}

export function resolveTelemetryEnabled(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env.PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY === "1";
}

function safeTelemetryEvent(
	event: TelemetryEventInput,
	createdAt: number,
	eventId: string,
): Record<string, unknown> | undefined {
	const base = { version: 1, eventId, createdAt, type: event.type };
	switch (event.type) {
		case "tool_result_observed":
			return {
				...base,
				visibleBytes: event.visibleBytes,
				lineCount: event.lineCount,
			};
		case "virtualization_decision":
			return {
				...base,
				outcome: event.outcome,
				reason: event.reason,
				visibleBytesBefore: event.visibleBytesBefore,
				visibleBytesAfter: event.visibleBytesAfter,
				storedBytes: event.storedBytes,
				durationMs: event.durationMs,
			};
		case "retrieval_attempt":
			return { ...base, operation: event.operation };
		case "retrieval_outcome":
			return {
				...base,
				operation: event.operation,
				outcome: event.outcome,
				durationMs: event.durationMs,
			};
		case "context_compaction_candidate":
			return {
				...base,
				argumentCount: event.argumentCount,
				originalBytes: event.originalBytes,
				returnedBytes: event.returnedBytes,
			};
		default:
			return undefined;
	}
}

export function createTelemetrySink(
	root: string,
	env: NodeJS.ProcessEnv = process.env,
	dependencies: TelemetryDependencies = {},
): TelemetrySink {
	if (!resolveTelemetryEnabled(env)) return disabledTelemetry;
	const telemetryDir = join(root, "telemetry");
	const telemetryPath = join(telemetryDir, "events.jsonl");
	const now = dependencies.now ?? Date.now;
	const makeEventId = dependencies.randomId ?? randomUUID;
	return {
		async record(event) {
			try {
				const safeEvent = safeTelemetryEvent(event, now(), makeEventId());
				if (!safeEvent) return;
				await mkdir(telemetryDir, { recursive: true, mode: 0o700 });
				await chmod(telemetryDir, 0o700);
				await appendFile(telemetryPath, `${JSON.stringify(safeEvent)}\n`, {
					encoding: "utf8",
					mode: 0o600,
				});
				await chmod(telemetryPath, 0o600);
			} catch {
				// Telemetry must never alter tool behavior.
			}
		},
	};
}
