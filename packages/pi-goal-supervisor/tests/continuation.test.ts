import assert from "node:assert/strict";
import { test } from "node:test";
import { queueContinuation } from "../src/continuation.ts";
import { createInitialState } from "../src/state.ts";
import type { SendMessageCall } from "../src/types.ts";

function createRuntime() {
	const calls: SendMessageCall[] = [];
	return {
		calls,
		api: {
			sendMessage(
				message: SendMessageCall["message"],
				options: SendMessageCall["options"],
			) {
				calls.push({ message, options });
			},
			appendEntry(_customType: string, _data: unknown) {},
		},
	};
}

test("queues exactly one follow-up while latch is pending", () => {
	const { api, calls } = createRuntime();
	const state = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		now: "2026-06-03T00:00:00.000Z",
	});

	const first = queueContinuation(state, api, {
		idle: true,
		pendingMessages: false,
		now: "2026-06-03T00:01:00.000Z",
		reason: "start",
	});
	const second = queueContinuation(first, api, {
		idle: true,
		pendingMessages: false,
		now: "2026-06-03T00:01:01.000Z",
		reason: "turn_end",
	});

	assert.equal(calls.length, 1);
	assert.equal(first.pendingContinuation?.reason, "start");
	assert.equal(second.pendingContinuation?.id, first.pendingContinuation?.id);
	assert.deepEqual(calls[0]?.options, {
		deliverAs: "followUp",
		triggerTurn: true,
	});
});

test("does not queue when not idle or pending messages exist", () => {
	const { api, calls } = createRuntime();
	const state = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		now: "2026-06-03T00:00:00.000Z",
	});

	queueContinuation(state, api, {
		idle: false,
		pendingMessages: false,
		now: "2026-06-03T00:01:00.000Z",
		reason: "start",
	});
	queueContinuation(state, api, {
		idle: true,
		pendingMessages: true,
		now: "2026-06-03T00:01:00.000Z",
		reason: "start",
	});

	assert.equal(calls.length, 0);
});

test("send failure does not persist a phantom pending continuation", () => {
	const appended: unknown[] = [];
	const state = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		now: "2026-06-03T00:00:00.000Z",
	});
	const api = {
		sendMessage() {
			throw new Error("send failed");
		},
		appendEntry(_customType: string, data: unknown) {
			appended.push(data);
		},
	};

	assert.throws(
		() =>
			queueContinuation(state, api, {
				idle: true,
				pendingMessages: false,
				now: "2026-06-03T00:01:00.000Z",
				reason: "start",
			}),
		/send failed/,
	);
	assert.equal(appended.length, 0);
});
