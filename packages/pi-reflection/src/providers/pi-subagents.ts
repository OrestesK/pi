import { randomUUID } from "node:crypto";

import type {
	ReflectionProvider,
	ReflectionRequest,
	ReflectionResult,
} from "../contracts.ts";

export const PI_SUBAGENTS_PROVIDER_ID = "pi-subagents";
export const PI_SUBAGENT_CHILD_ENV = "PI_SUBAGENT_CHILD";

export const SUBAGENT_RPC_REQUEST_EVENT = "subagents:rpc:v1:request";
export const SUBAGENT_RPC_READY_EVENT = "subagents:rpc:v1:ready";
const SUBAGENT_RPC_REPLY_EVENT_PREFIX = "subagents:rpc:v1:reply:";

const DEFAULT_PING_TIMEOUT_MS = 250;

export interface ReflectionEventBus {
	on(event: string, handler: (payload: unknown) => void): () => void;
	emit(event: string, payload: unknown): void;
}

interface PiSubagentsProviderOptions {
	pingTimeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isReadyDocument(value: unknown): boolean {
	return isRecord(value) &&
		value.version === 1 &&
		Array.isArray(value.methods) &&
		value.methods.includes("ping");
}

function rpcReplyEvent(requestId: string): string {
	return `${SUBAGENT_RPC_REPLY_EVENT_PREFIX}${requestId}`;
}

export class PiSubagentsReflectionProvider implements ReflectionProvider {
	readonly id = PI_SUBAGENTS_PROVIDER_ID;
	readonly priority = 100;

	readonly #events: ReflectionEventBus;
	readonly #pingTimeoutMs: number;
	readonly #unsubscribeReady: () => void;
	readonly #pendingPings = new Set<() => void>();
	#ready = false;
	#disposed = false;

	constructor(events: ReflectionEventBus, options: PiSubagentsProviderOptions = {}) {
		this.#events = events;
		this.#pingTimeoutMs = options.pingTimeoutMs ?? DEFAULT_PING_TIMEOUT_MS;
		this.#unsubscribeReady = events.on(SUBAGENT_RPC_READY_EVENT, (payload) => {
			this.#ready = isReadyDocument(payload);
		});
	}

	isAvailable(): boolean {
		return !this.#disposed && this.#ready;
	}

	isHostEligible(): boolean {
		return process.env[PI_SUBAGENT_CHILD_ENV] !== "1";
	}

	async refreshAvailability(): Promise<boolean> {
		if (this.#disposed || !this.isHostEligible()) {
			this.#ready = false;
			return false;
		}
		this.#ready = await this.#ping();
		return this.#ready;
	}

	async launch(
		_request: ReflectionRequest,
		_signal: AbortSignal,
	): Promise<ReflectionResult> {
		throw new Error("Reflection semantic resources are not ready");
	}

	dispose(): void {
		this.#disposed = true;
		this.#ready = false;
		this.#unsubscribeReady();
		for (const cancel of [...this.#pendingPings]) cancel();
	}

	#ping(): Promise<boolean> {
		const requestId = `reflection-ping-${randomUUID()}`;
		return new Promise<boolean>((resolve) => {
			let settled = false;
			let unsubscribe = (): void => {};
			const finish = (ready: boolean) => {
				if (settled) return;
				settled = true;
				clearTimeout(timer);
				unsubscribe();
				this.#pendingPings.delete(onDispose);
				resolve(ready);
			};
			const onDispose = () => finish(false);
			const timer = setTimeout(() => finish(false), this.#pingTimeoutMs);
			unsubscribe = this.#events.on(rpcReplyEvent(requestId), (payload) => {
				if (
					!isRecord(payload) ||
					payload.version !== 1 ||
					payload.requestId !== requestId ||
					payload.method !== "ping"
				) return;
				if (payload.success === true) finish(isReadyDocument(payload.data));
				else if (payload.success === false) finish(false);
			});
			this.#pendingPings.add(onDispose);
			try {
				this.#events.emit(SUBAGENT_RPC_REQUEST_EVENT, {
					version: 1,
					requestId,
					method: "ping",
					source: { extension: "pi-reflection" },
				});
			} catch {
				finish(false);
			}
		});
	}
}
