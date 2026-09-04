import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReflectionRequest } from "../src/contracts.ts";
import {
	PI_SUBAGENT_CHILD_ENV,
	PiSubagentsReflectionProvider,
	SUBAGENT_RPC_READY_EVENT,
	SUBAGENT_RPC_REQUEST_EVENT,
	type ReflectionEventBus,
} from "../src/providers/pi-subagents.ts";

const DELEGATION_REQUEST_EVENT = "prompt-template:subagent:request";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
	if (!isRecord(value)) throw new Error("Expected an event payload object");
	return value;
}

class FakeEvents implements ReflectionEventBus {
	readonly handlers = new Map<string, Set<(payload: unknown) => void>>();
	readonly emitted: Array<{ event: string; payload: unknown }> = [];

	on(event: string, handler: (payload: unknown) => void): () => void {
		const handlers = this.handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.handlers.set(event, handlers);
		return () => handlers.delete(handler);
	}

	emit(event: string, payload: unknown): void {
		this.emitted.push({ event, payload });
		for (const handler of this.handlers.get(event) ?? []) handler(payload);
	}

	listenerCount(event: string): number {
		return this.handlers.get(event)?.size ?? 0;
	}

	lastPayload(event: string): Record<string, unknown> {
		for (let index = this.emitted.length - 1; index >= 0; index--) {
			const entry = this.emitted[index];
			if (entry?.event === event) return record(entry.payload);
		}
		throw new Error(`No payload emitted for ${event}`);
	}
}

function request(): ReflectionRequest {
	return {
		version: 1,
		sessionId: "session-1",
		revision: 1,
		generationId: "generation-1",
		generationSequence: 1,
		laneId: "prompt",
		stateKey: "session-1:1:prompt:0",
		cwd: "/workspace",
		payload: { items: [] },
	};
}

function restoreChildEnvironment(previous: string | undefined): void {
	if (previous === undefined) delete process.env[PI_SUBAGENT_CHILD_ENV];
	else process.env[PI_SUBAGENT_CHILD_ENV] = previous;
}

test("tracks public readiness and excludes pi-subagents child processes", () => {
	const previous = process.env[PI_SUBAGENT_CHILD_ENV];
	delete process.env[PI_SUBAGENT_CHILD_ENV];
	try {
		const events = new FakeEvents();
		const provider = new PiSubagentsReflectionProvider(events);

		assert.equal(provider.isAvailable(), false);
		assert.equal(provider.isHostEligible(), true);
		events.emit(SUBAGENT_RPC_READY_EVENT, { version: 1, methods: ["ping"] });
		assert.equal(provider.isAvailable(), true);

		process.env[PI_SUBAGENT_CHILD_ENV] = "1";
		assert.equal(provider.isHostEligible(), false);
		provider.dispose();
		assert.equal(events.listenerCount(SUBAGENT_RPC_READY_EVENT), 0);
	} finally {
		restoreChildEnvironment(previous);
	}
});

test("recovers readiness through a correlated public RPC ping", async () => {
	const events = new FakeEvents();
	const provider = new PiSubagentsReflectionProvider(events);
	events.on(SUBAGENT_RPC_REQUEST_EVENT, (payload) => {
		const envelope = record(payload);
		const requestId = envelope.requestId;
		assert.equal(typeof requestId, "string");
		events.emit(`subagents:rpc:v1:reply:${requestId}`, {
			version: 1,
			requestId,
			method: "ping",
			success: true,
			data: { version: 1, methods: ["ping"] },
		});
	});

	assert.equal(await provider.refreshAvailability(), true);
	assert.equal(provider.isAvailable(), true);
	const requestId = events.lastPayload(
		SUBAGENT_RPC_REQUEST_EVENT,
	).requestId;
	assert.equal(
		events.listenerCount(`subagents:rpc:v1:reply:${String(requestId)}`),
		0,
	);
	provider.dispose();
});

test("timeout and disposal settle pending readiness and remove listeners", async () => {
	const timeoutEvents = new FakeEvents();
	const timeoutProvider = new PiSubagentsReflectionProvider(timeoutEvents, {
		pingTimeoutMs: 5,
	});
	assert.equal(await timeoutProvider.refreshAvailability(), false);
	const timeoutRequestId = timeoutEvents.lastPayload(
		SUBAGENT_RPC_REQUEST_EVENT,
	).requestId;
	assert.equal(
		timeoutEvents.listenerCount(`subagents:rpc:v1:reply:${String(timeoutRequestId)}`),
		0,
	);
	timeoutProvider.dispose();

	const disposeEvents = new FakeEvents();
	const disposeProvider = new PiSubagentsReflectionProvider(disposeEvents);
	const pending = disposeProvider.refreshAvailability();
	const disposeRequestId = disposeEvents.lastPayload(
		SUBAGENT_RPC_REQUEST_EVENT,
	).requestId;
	assert.equal(
		disposeEvents.listenerCount(`subagents:rpc:v1:reply:${String(disposeRequestId)}`),
		1,
	);
	disposeProvider.dispose();
	assert.equal(await pending, false);
	assert.equal(
		disposeEvents.listenerCount(`subagents:rpc:v1:reply:${String(disposeRequestId)}`),
		0,
	);
	assert.equal(disposeEvents.listenerCount(SUBAGENT_RPC_READY_EVENT), 0);
});

test("launch fails explicitly without emitting delegation", async () => {
	const events = new FakeEvents();
	const provider = new PiSubagentsReflectionProvider(events);

	await assert.rejects(
		provider.launch(request(), new AbortController().signal),
		/semantic resources are not ready/,
	);
	assert.equal(
		events.emitted.some((entry) => entry.event === DELEGATION_REQUEST_EVENT),
		false,
	);
	provider.dispose();
});
