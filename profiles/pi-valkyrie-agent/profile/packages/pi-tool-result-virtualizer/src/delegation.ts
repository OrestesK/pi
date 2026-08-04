import { readFileSync } from "node:fs";
import { join } from "node:path";

import type {
	TextContent,
	ToolExecutionContextLike,
} from "./extension-types.ts";
import { PROTECTED_TOOL_OUTPUT_BYTE_LIMIT } from "./formatting.ts";
import {
	RESULT_ANALYST_RUNTIME_NAME,
	type PrepareGrantInput,
	type RunBoundGrantRegistry,
} from "./grants.ts";
import type { StoreAccessContext, ToolResultStore } from "./store.ts";
import {
	SubagentRpcClientError,
	supportsResultDelegation,
	type SubagentRpcPing,
	type SubagentSpawnParams,
} from "./subagent-rpc-client.ts";

export const DELEGATION_TOOL_CALL_BUDGET = 8;
export const DELEGATION_CHILD_TIMEOUT_MS = 4 * 60 * 1_000;
export const DELEGATION_GRANT_TTL_MS = 5 * 60 * 1_000;
const DELEGATION_FINAL_OUTPUT_BYTES = 8 * 1_024;
const DELEGATION_FINAL_OUTPUT_LINES = 200;
const ANALYST_MANIFEST_PATH = "agents/result-analyst.md";

export type DelegationInput = {
	sourceId: string;
	task: string;
};

export type DelegationRpc = {
	isReady(): boolean;
	ping(signal?: AbortSignal): Promise<SubagentRpcPing>;
	spawn(params: SubagentSpawnParams, signal?: AbortSignal): Promise<string>;
	interrupt(runId: string, signal?: AbortSignal): Promise<void>;
};

type DelegationServiceOptions = {
	store: ToolResultStore;
	resolveAccess: (
		context: ToolExecutionContextLike,
	) => Promise<StoreAccessContext>;
	grants: RunBoundGrantRegistry;
	rpc: DelegationRpc;
	packageRoot: string;
	now?: () => number;
};

type DelegationResult = {
	content: TextContent[];
	details: Record<string, unknown>;
};

type PreflightResult =
	| { ok: true; grant: PrepareGrantInput }
	| { ok: false; result: DelegationResult };

function analystManifestValid(text: string): boolean {
	const frontmatter = text.split("---", 3)[1] ?? "";
	return (
		/^name: result-analyst$/m.test(frontmatter) &&
		/^package: pi-tool-result-virtualizer$/m.test(frontmatter) &&
		/^tools: tool_result_outline, tool_result_search, tool_result_get$/m.test(
			frontmatter,
		) &&
		/^extensions: \.\/src\/index\.ts$/m.test(frontmatter) &&
		/^systemPromptMode: replace$/m.test(frontmatter) &&
		/^inheritProjectContext: false$/m.test(frontmatter) &&
		/^inheritSkills: false$/m.test(frontmatter) &&
		/^defaultContext: fresh$/m.test(frontmatter)
	);
}

function unavailable(reasonCode: string, message: string): DelegationResult {
	return {
		content: [{ type: "text", text: message }],
		details: {
			kind: "tool_result_delegation",
			status: "delegation_unavailable",
			reasonCode,
		},
	};
}

function sourceUnavailable(): DelegationResult {
	return {
		content: [
			{
				type: "text",
				text: "Delegation source is not available in the current scope.",
			},
		],
		details: {
			kind: "tool_result_delegation",
			status: "source_unavailable",
			reasonCode: "source_unavailable",
		},
	};
}

function managementActions(runId: string): Array<Record<string, unknown>> {
	return [
		{
			kind: "status",
			tool: "subagent",
			args: { action: "status", id: runId },
		},
		{
			kind: "interrupt",
			tool: "subagent",
			args: { action: "interrupt", id: runId },
		},
	];
}

function analystTask(input: DelegationInput): string {
	return [
		"Analyze the exact virtualized tool-result source named below.",
		`Source: ${input.sourceId}`,
		`Objective: ${input.task}`,
		"",
		"Required output contract:",
		"Access status: complete | partial | blocked",
		"Completion status: complete | incomplete",
		"Findings: concise bullets; every factual finding must include source line citations in [sourceId:startLine-endLine] form.",
		"Uncertainty: explicit unknowns or none.",
		"Residual risks: explicit remaining risks or none.",
		"Do not claim or quote evidence that you did not retrieve.",
	].join("\n");
}

export class ResultDelegationService {
	readonly #store: ToolResultStore;
	readonly #resolveAccess: DelegationServiceOptions["resolveAccess"];
	readonly #grants: RunBoundGrantRegistry;
	readonly #rpc: DelegationRpc;
	readonly #packageRoot: string;
	readonly #now: () => number;
	readonly #manifestAvailable: boolean;

	constructor(options: DelegationServiceOptions) {
		this.#store = options.store;
		this.#resolveAccess = options.resolveAccess;
		this.#grants = options.grants;
		this.#rpc = options.rpc;
		this.#packageRoot = options.packageRoot;
		this.#now = options.now ?? Date.now;
		try {
			this.#manifestAvailable = analystManifestValid(
				readFileSync(join(this.#packageRoot, ANALYST_MANIFEST_PATH), "utf8"),
			);
		} catch {
			this.#manifestAvailable = false;
		}
	}

	receiptActionAvailable(): boolean {
		return this.#manifestAvailable && this.#rpc.isReady();
	}

	async delegate(
		input: DelegationInput,
		context: ToolExecutionContextLike,
		signal?: AbortSignal,
	): Promise<DelegationResult> {
		const preflight = await this.#preflight(input, context, signal);
		if (!preflight.ok) return preflight.result;
		const pending = this.#grants.prepare(preflight.grant);
		let runId: string;
		try {
			runId = await this.#rpc.spawn(this.#spawnParams(input), signal);
		} catch (error) {
			this.#grants.abort(pending);
			const outcomeUnknown =
				error instanceof SubagentRpcClientError &&
				(error.code === "timeout" || error.code === "aborted");
			return unavailable(
				outcomeUnknown ? "spawn_outcome_unknown" : "spawn_failed",
				outcomeUnknown
					? "Delegation spawn outcome is unknown. No source grant was committed."
					: "Delegation could not start. No source grant was committed.",
			);
		}

		try {
			await this.#grants.commit(pending, runId);
		} catch {
			let cleanupStatus = "interrupt_requested";
			try {
				await this.#rpc.interrupt(runId);
			} catch {
				cleanupStatus = "interrupt_failed";
			}
			return {
				content: [
					{
						type: "text",
						text: `Delegation run ${runId} started without source access; interruption was ${cleanupStatus === "interrupt_requested" ? "requested" : "not confirmed"}.`,
					},
				],
				details: {
					kind: "tool_result_delegation",
					status: "delegation_failed",
					reasonCode: "grant_commit_failed",
					runId,
					cleanupStatus,
					actions: managementActions(runId),
				},
			};
		}

		return {
			content: [
				{
					type: "text",
					text: `Delegation started as asynchronous run ${runId}. Use the returned status or interrupt action to manage it.`,
				},
			],
			details: {
				kind: "tool_result_delegation",
				status: "started",
				runId,
				actions: managementActions(runId),
			},
		};
	}

	async #preflight(
		input: DelegationInput,
		context: ToolExecutionContextLike,
		signal: AbortSignal | undefined,
	): Promise<PreflightResult> {
		const access = await this.#resolveAccess(context);
		if (access.actor === "subagent")
			return {
				ok: false,
				result: unavailable(
					"parent_only",
					"Delegation is available only from the parent session.",
				),
			};
		if (!this.#manifestAvailable)
			return {
				ok: false,
				result: unavailable(
					"analyst_unavailable",
					"Delegation analyst package is unavailable.",
				),
			};
		try {
			await this.#store.getSourceMetadata(input.sourceId, access);
		} catch {
			return { ok: false, result: sourceUnavailable() };
		}
		let ping: SubagentRpcPing;
		try {
			ping = await this.#rpc.ping(signal);
		} catch {
			return {
				ok: false,
				result: unavailable(
					"rpc_unavailable",
					"Delegation RPC bridge is unavailable.",
				),
			};
		}
		if (!supportsResultDelegation(ping))
			return {
				ok: false,
				result: unavailable(
					"rpc_capability_missing",
					"Delegation RPC bridge lacks a required capability.",
				),
			};
		const grant: PrepareGrantInput = {
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			sourceIds: [input.sourceId],
			operations: ["outline", "search", "get"],
			budget: {
				calls: DELEGATION_TOOL_CALL_BUDGET,
				outputBytes:
					PROTECTED_TOOL_OUTPUT_BYTE_LIMIT * DELEGATION_TOOL_CALL_BUDGET,
			},
			expiresAt: this.#now() + DELEGATION_GRANT_TTL_MS,
		};
		try {
			this.#grants.assertFeasible(grant);
		} catch {
			return {
				ok: false,
				result: unavailable(
					"grant_unavailable",
					"Delegation grant is not feasible.",
				),
			};
		}
		return { ok: true, grant };
	}

	#spawnParams(input: DelegationInput): SubagentSpawnParams {
		return {
			agent: RESULT_ANALYST_RUNTIME_NAME,
			task: analystTask(input),
			context: "fresh",
			async: true,
			cwd: this.#packageRoot,
			artifacts: false,
			output: false,
			progress: false,
			reads: false,
			skill: false,
			timeoutMs: DELEGATION_CHILD_TIMEOUT_MS,
			toolBudget: {
				soft: DELEGATION_TOOL_CALL_BUDGET - 2,
				hard: DELEGATION_TOOL_CALL_BUDGET,
				block: "*",
			},
			maxOutput: {
				bytes: DELEGATION_FINAL_OUTPUT_BYTES,
				lines: DELEGATION_FINAL_OUTPUT_LINES,
			},
		};
	}
}
