import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { default: registerSubagentNotify } = await loadTs("../../src/runs/background/notify.ts");
const { SUBAGENT_ASYNC_COMPLETE_EVENT } = await loadTs("../../src/shared/types.ts");

function makePi() {
	const handlers = new Map();
	const messages = [];
	return {
		messages,
		pi: {
			events: {
				on(channel, handler) {
					handlers.set(channel, handler);
					return () => handlers.delete(channel);
				},
			},
			sendMessage(message, options) {
				messages.push({ message, options });
			},
		},
		emit(channel, data) {
			const handler = handlers.get(channel);
			assert.equal(typeof handler, "function");
			handler(data);
		},
	};
}

function makeTimers() {
	const scheduled = [];
	return {
		scheduled,
		timers: {
			setTimeout(handler, delayMs) {
				const timer = { handler, delayMs, cleared: false };
				scheduled.push(timer);
				return timer;
			},
			clearTimeout(timer) {
				timer.cleared = true;
			},
		},
		runNext() {
			const timer = scheduled.find((candidate) => !candidate.cleared);
			assert.ok(timer);
			timer.cleared = true;
			timer.handler();
		},
	};
}

function completion(overrides) {
	return {
		id: overrides.id ?? `id-${overrides.agent}`,
		agent: overrides.agent,
		success: true,
		summary: `${overrides.agent} done`,
		timestamp: 1000,
		sessionId: "session-one",
		...overrides,
	};
}

const batchConfig = {
	enabled: true,
	debounceMs: 25,
	maxWaitMs: 250,
	stragglerDebounceMs: 10,
	stragglerMaxWaitMs: 50,
	stragglerWindowMs: 500,
};

test("successful completions are grouped after the debounce window", () => {
	const harness = makePi();
	const clock = makeTimers();
	registerSubagentNotify(harness.pi, { currentSessionId: "session-one" }, { batchConfig, timers: clock.timers, now: () => 1000 });

	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ agent: "alpha" }));
	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ agent: "beta" }));

	assert.equal(harness.messages.length, 0);
	clock.runNext();

	assert.equal(harness.messages.length, 1);
	assert.equal(harness.messages[0].options.triggerTurn, true);
	assert.match(harness.messages[0].message.content, /Background tasks completed \(2\)/);
	assert.match(harness.messages[0].message.content, /alpha done/);
	assert.match(harness.messages[0].message.content, /beta done/);
});

test("failed completion flushes held successes then emits immediately", () => {
	const harness = makePi();
	const clock = makeTimers();
	registerSubagentNotify(harness.pi, { currentSessionId: "session-one" }, { batchConfig, timers: clock.timers, now: () => 2000 });

	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ id: "flush-alpha", agent: "alpha" }));
	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ id: "flush-beta", agent: "beta", success: false, summary: "boom", exitCode: 1 }));

	assert.equal(harness.messages.length, 2);
	assert.match(harness.messages[0].message.content, /Background task completed: \*\*alpha\*\*/);
	assert.match(harness.messages[1].message.content, /Background task failed: \*\*beta\*\*/);
	assert.match(harness.messages[1].message.content, /boom/);
});

test("paused completion flushes held successes then emits immediately", () => {
	const harness = makePi();
	const clock = makeTimers();
	registerSubagentNotify(harness.pi, { currentSessionId: "session-one" }, { batchConfig, timers: clock.timers, now: () => 2500 });

	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ id: "paused-alpha", agent: "alpha" }));
	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ id: "paused-beta", agent: "beta", success: false, summary: "Paused after interrupt.", exitCode: 0, state: "paused" }));

	assert.equal(harness.messages.length, 2);
	assert.match(harness.messages[0].message.content, /Background task completed: \*\*alpha\*\*/);
	assert.match(harness.messages[1].message.content, /Background task paused: \*\*beta\*\*/);
	assert.match(harness.messages[1].message.content, /Paused after interrupt\./);
});

test("notifications ignore completions from other sessions", () => {
	const harness = makePi();
	const clock = makeTimers();
	registerSubagentNotify(harness.pi, { currentSessionId: "session-one" }, { batchConfig, timers: clock.timers, now: () => 3000 });

	harness.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completion({ agent: "other", sessionId: "session-two" }));

	assert.equal(harness.messages.length, 0);
	assert.equal(clock.scheduled.length, 0);
});
