import { randomUUID } from "node:crypto";

import type { ExtensionEventBusLike } from "./extension-types.ts";

export const SUBAGENT_RPC_PROTOCOL_VERSION = 1;
export const SUBAGENT_RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
export const SUBAGENT_RPC_READY_EVENT = "subagents:rpc:v1:ready";
const SUBAGENT_RPC_REPLY_EVENT_PREFIX = "subagents:rpc:v1:reply:";

export type SubagentRpcMethod =
	| "ping"
	| "status"
	| "spawn"
	| "interrupt"
	| "stop";

export type SubagentRpcPing = {
	version: 1;
	methods: SubagentRpcMethod[];
	capabilities: {
		status: boolean;
		asyncSpawn: boolean;
		interrupt: boolean;
		stop: boolean;
	};
};

export type SubagentSpawnParams = {
	agent: string;
	task: string;
	context: "fresh";
	async: true;
	cwd: string;
	artifacts: false;
	output: false;
	progress: false;
	reads: false;
	skill: false;
	timeoutMs: number;
	toolBudget: {
		soft: number;
		hard: number;
		block: "*";
	};
	maxOutput: {
		bytes: number;
		lines: number;
	};
};

export type SubagentRpcClientErrorCode =
	| "timeout"
	| "aborted"
	| "unavailable"
	| "invalid_reply"
	| "rpc_error";

export class SubagentRpcClientError extends Error {
	readonly code: SubagentRpcClientErrorCode;
	readonly rpcCode: string | undefined;

	constructor(
		code: SubagentRpcClientErrorCode,
		message: string,
		rpcCode?: string,
	) {
		super(message);
		this.name = "SubagentRpcClientError";
		this.code = code;
		this.rpcCode = rpcCode;
	}
}

type SubagentRpcClientOptions = {
	timeoutMs?: number;
	spawnTimeoutMs?: number;
	requestId?: () => string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMethod(value: unknown): value is SubagentRpcMethod {
	return (
		value === "ping" ||
		value === "status" ||
		value === "spawn" ||
		value === "interrupt" ||
		value === "stop"
	);
}

function parsePing(value: unknown): SubagentRpcPing | undefined {
	if (!isRecord(value) || value.version !== SUBAGENT_RPC_PROTOCOL_VERSION)
		return undefined;
	if (!Array.isArray(value.methods) || !value.methods.every(isMethod))
		return undefined;
	if (!isRecord(value.capabilities)) return undefined;
	const { status, asyncSpawn, interrupt, stop } = value.capabilities;
	if (
		typeof status !== "boolean" ||
		typeof asyncSpawn !== "boolean" ||
		typeof interrupt !== "boolean" ||
		typeof stop !== "boolean"
	)
		return undefined;
	return {
		version: SUBAGENT_RPC_PROTOCOL_VERSION,
		methods: [...value.methods],
		capabilities: { status, asyncSpawn, interrupt, stop },
	};
}

export function supportsResultDelegation(ping: SubagentRpcPing): boolean {
	return (
		ping.methods.includes("ping") &&
		ping.methods.includes("spawn") &&
		ping.methods.includes("status") &&
		ping.methods.includes("interrupt") &&
		ping.capabilities.asyncSpawn &&
		ping.capabilities.status &&
		ping.capabilities.interrupt
	);
}

export function subagentRpcReplyEvent(requestId: string): string {
	return `${SUBAGENT_RPC_REPLY_EVENT_PREFIX}${requestId}`;
}

function validRequestId(requestId: string): boolean {
	return /^[A-Za-z0-9_-]{1,128}$/.test(requestId);
}

function validRunId(runId: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(runId);
}

export class SubagentRpcClient {
	readonly #events: ExtensionEventBusLike | undefined;
	readonly #timeoutMs: number;
	readonly #spawnTimeoutMs: number;
	readonly #requestId: () => string;
	readonly #unsubscribeReady: (() => void) | undefined;
	#ready = false;

	constructor(
		events: ExtensionEventBusLike | undefined,
		options: SubagentRpcClientOptions = {},
	) {
		this.#events = events;
		this.#timeoutMs = options.timeoutMs ?? 250;
		this.#spawnTimeoutMs = options.spawnTimeoutMs ?? 15_000;
		this.#requestId = options.requestId ?? randomUUID;
		const unsubscribe = events?.on(SUBAGENT_RPC_READY_EVENT, (data) => {
			const ping = parsePing(data);
			this.#ready = ping !== undefined && supportsResultDelegation(ping);
		});
		this.#unsubscribeReady =
			typeof unsubscribe === "function" ? unsubscribe : undefined;
	}

	isReady(): boolean {
		return this.#ready;
	}

	dispose(): void {
		this.#unsubscribeReady?.();
		this.#ready = false;
	}

	async ping(signal?: AbortSignal): Promise<SubagentRpcPing> {
		const data = await this.#request(
			"ping",
			undefined,
			signal,
			this.#timeoutMs,
		);
		const ping = parsePing(data);
		if (ping === undefined)
			throw new SubagentRpcClientError(
				"invalid_reply",
				"Subagent RPC ping returned an invalid capability document",
			);
		this.#ready = supportsResultDelegation(ping);
		return ping;
	}

	async spawn(
		params: SubagentSpawnParams,
		signal?: AbortSignal,
	): Promise<string> {
		const data = await this.#request(
			"spawn",
			params,
			signal,
			this.#spawnTimeoutMs,
		);
		if (!isRecord(data) || !isRecord(data.details))
			throw new SubagentRpcClientError(
				"invalid_reply",
				"Subagent RPC spawn reply omitted run details",
			);
		const runId = data.details.asyncId;
		if (typeof runId !== "string" || !validRunId(runId))
			throw new SubagentRpcClientError(
				"invalid_reply",
				"Subagent RPC spawn reply omitted a valid run id",
			);
		return runId;
	}

	async interrupt(runId: string, signal?: AbortSignal): Promise<void> {
		if (!validRunId(runId))
			throw new SubagentRpcClientError(
				"invalid_reply",
				"Cannot interrupt an invalid run id",
			);
		await this.#request("interrupt", { id: runId }, signal, this.#timeoutMs);
	}

	async #request(
		method: SubagentRpcMethod,
		params: unknown,
		signal: AbortSignal | undefined,
		timeoutMs: number,
	): Promise<unknown> {
		if (this.#events === undefined)
			throw new SubagentRpcClientError(
				"unavailable",
				"Subagent RPC event bus is unavailable",
			);
		if (signal?.aborted)
			throw new SubagentRpcClientError(
				"aborted",
				"Subagent RPC request aborted",
			);
		const requestId = this.#requestId();
		if (!validRequestId(requestId))
			throw new SubagentRpcClientError(
				"invalid_reply",
				"Subagent RPC request id is invalid",
			);
		const replyEvent = subagentRpcReplyEvent(requestId);
		return new Promise<unknown>((resolve, reject) => {
			let settled = false;
			let unsubscribe: (() => void) | undefined;
			const finish = (result: { data?: unknown; error?: Error }) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				unsubscribe?.();
				signal?.removeEventListener("abort", onAbort);
				if (result.error) reject(result.error);
				else resolve(result.data);
			};
			const onAbort = () =>
				finish({
					error: new SubagentRpcClientError(
						"aborted",
						"Subagent RPC request aborted",
					),
				});
			const timer = setTimeout(
				() =>
					finish({
						error: new SubagentRpcClientError(
							"timeout",
							"Subagent RPC request timed out",
						),
					}),
				timeoutMs,
			);
			const maybeUnsubscribe = this.#events?.on(replyEvent, (raw) => {
				if (!isRecord(raw)) {
					finish({
						error: new SubagentRpcClientError(
							"invalid_reply",
							"Subagent RPC returned a malformed reply",
						),
					});
					return;
				}
				if (
					raw.requestId !== requestId ||
					raw.version !== SUBAGENT_RPC_PROTOCOL_VERSION ||
					raw.method !== method
				)
					return;
				if (raw.success === true) {
					finish({ data: raw.data });
					return;
				}
				if (
					raw.success === false &&
					isRecord(raw.error) &&
					typeof raw.error.code === "string" &&
					typeof raw.error.message === "string"
				) {
					finish({
						error: new SubagentRpcClientError(
							"rpc_error",
							"Subagent RPC request failed",
							raw.error.code,
						),
					});
					return;
				}
				finish({
					error: new SubagentRpcClientError(
						"invalid_reply",
						"Subagent RPC returned a malformed reply",
					),
				});
			});
			unsubscribe =
				typeof maybeUnsubscribe === "function" ? maybeUnsubscribe : undefined;
			signal?.addEventListener("abort", onAbort, { once: true });
			try {
				this.#events?.emit(SUBAGENT_RPC_REQUEST_EVENT, {
					version: SUBAGENT_RPC_PROTOCOL_VERSION,
					requestId,
					method,
					...(params === undefined ? {} : { params }),
					source: { extension: "pi-tool-result-virtualizer" },
				});
			} catch {
				finish({
					error: new SubagentRpcClientError(
						"unavailable",
						"Subagent RPC event bus rejected the request",
					),
				});
			}
		});
	}
}
