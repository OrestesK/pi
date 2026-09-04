import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_REFLECTION_CONFIG,
	type ReflectionConfig,
} from "../src/config.ts";
import {
	registerReflectionExtension,
	type ReflectionRuntime,
} from "../src/extension.ts";
import {
	SUBAGENT_RPC_READY_EVENT,
	SUBAGENT_RPC_REQUEST_EVENT,
} from "../src/providers/pi-subagents.ts";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;

class FakeEvents {
	readonly #handlers = new Map<string, Set<(payload: unknown) => void>>();
	readonly emitted: Array<{ event: string; payload: unknown }> = [];

	on(event: string, handler: (payload: unknown) => void): () => void {
		const handlers = this.#handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.#handlers.set(event, handlers);
		return () => handlers.delete(handler);
	}

	emit(event: string, payload: unknown): void {
		this.emitted.push({ event, payload });
		for (const handler of this.#handlers.get(event) ?? []) handler(payload);
	}

	listenerCount(event: string): number {
		return this.#handlers.get(event)?.size ?? 0;
	}

	lastPayload(event: string): unknown {
		return this.emitted.filter((entry) => entry.event === event).at(-1)?.payload;
	}
}

class FakePi {
	readonly events = new FakeEvents();
	readonly #handlers = new Map<string, Handler[]>();

	on(event: string, handler: Handler): void {
		const handlers = this.#handlers.get(event) ?? [];
		handlers.push(handler);
		this.#handlers.set(event, handlers);
	}

	fire(event: string, payload: unknown, ctx: ExtensionContext): unknown[] {
		return (this.#handlers.get(event) ?? []).map((handler) =>
			handler(payload, ctx),
		);
	}
}

function config(overrides: Partial<ReflectionConfig> = {}): ReflectionConfig {
	return { ...DEFAULT_REFLECTION_CONFIG, readinessTimeoutMs: 10_000, ...overrides };
}

function context(sessionId: string): ExtensionContext {
	return {
		cwd: "/repo",
		sessionManager: { getSessionId: () => sessionId },
	} as unknown as ExtensionContext;
}

function start(pi: FakePi): ReflectionRuntime {
	const runtime = registerReflectionExtension(
		pi as unknown as ExtensionAPI,
		config(),
	);
	if (!runtime) throw new Error("Reflection runtime did not register");
	return runtime;
}

describe("Reflection extension", () => {
	it("records every gated checkpoint without delegating and cleans up", () => {
		const pi = new FakePi();
		const runtime = start(pi);
		const ctx = context("session-1");

		assert.deepEqual(pi.fire(
			"session_start",
			{ type: "session_start", reason: "startup" },
			ctx,
		), [undefined]);
		const ping = pi.events.lastPayload(SUBAGENT_RPC_REQUEST_EVENT);
		if (
			!ping ||
			typeof ping !== "object" ||
			!("requestId" in ping) ||
			typeof ping.requestId !== "string"
		) {
			throw new Error("expected correlated readiness ping");
		}
		const replyEvent = `subagents:rpc:v1:reply:${ping.requestId}`;
		assert.equal(pi.events.listenerCount(replyEvent), 1);

		pi.fire(
			"before_agent_start",
			{ type: "before_agent_start", prompt: "ignored" },
			ctx,
		);
		for (let turnIndex = 1; turnIndex <= config().turnInterval; turnIndex += 1) {
			pi.fire("turn_end", { type: "turn_end", turnIndex }, ctx);
		}
		pi.fire("agent_end", { type: "agent_end" }, ctx);

		const gated = runtime.getObservations().filter(
			(observation) => observation.disposition === "resources_not_ready",
		);
		assert.deepEqual(
			gated.map(({ laneId }) => laneId),
			["prompt", "interval", "agent_end"],
		);
		for (const observation of gated) {
			assert.equal("payload" in observation, false);
			assert.equal("output" in observation, false);
		}
		assert.equal(
			pi.events.emitted.some(
				(entry) => entry.event === "prompt-template:subagent:request",
			),
			false,
		);

		pi.fire(
			"session_shutdown",
			{ type: "session_shutdown", reason: "reload" },
			ctx,
		);
		assert.equal(pi.events.listenerCount(replyEvent), 0);
		assert.equal(pi.events.listenerCount(SUBAGENT_RPC_READY_EVENT), 0);
	});
});
