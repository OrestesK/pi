import assert from "node:assert/strict";
import { test } from "node:test";
import {
	buildContinuationContent,
	queueContinuation,
} from "../src/continuation.ts";
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

test("continuation content preserves normal tools and marker contracts", () => {
	const state = createInitialState({
		objective: "finish safely",
		cwd: "/tmp/project",
		now: "2026-06-03T00:00:00.000Z",
	});

	const content = buildContinuationContent(state, "nonce-1", "turn_end");

	assert.match(content, /normal Pi tools\/extensions/i);
	assert.match(content, /GOAL_DONE:/);
	assert.match(content, /GOAL_BLOCKED:/);
	assert.match(content, /finish safely/);
	assert.match(content, /id=nonce-1/);
	assert.match(content, /100% blocked/i);
	assert.match(content, /internal plan approval/i);
	assert.match(content, /routine local work/i);
	assert.match(content, /minor\/reversible local edits/i);
	assert.match(content, /tests, docs, formatting/i);
	assert.match(content, /routine implementation choices/i);
	assert.match(content, /safe local\/read-only\/reversible/i);
	assert.match(content, /Take the next concrete step now when one exists/i);
	assert.match(content, /unapproved production\/remote\/external-account mutation/i);
	assert.match(content, /sudo, mutating git, or destructive filesystem\/data changes/i);
	assert.match(content, /private\/external-account reads or cross-source discovery/i);
	assert.match(content, /material product\/API\/scope decision not implied by the goal/i);
	assert.match(content, /missing required permission, tool, or credential/i);
	assert.match(
		content,
		/GOAL_BLOCKED: <specific 100% blocker and smallest safe requested human decision>/i,
	);
	assert.doesNotMatch(content, /required approval/i);
	assert.doesNotMatch(content, /ambiguous product\/API decision/i);
});
