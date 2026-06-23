import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const {
	findLiveSteeringCompletionFailure,
	findLiveSteeringReviewerPulseFailures,
} = await loadTs("../../src/shared/live-steering.ts");

function message(overrides) {
	return {
		id: "msg",
		runId: "run",
		from: "reviewer-1",
		to: "worker-0",
		text: "steer",
		urgent: true,
		read: false,
		createdAt: new Date(1000).toISOString(),
		...overrides,
	};
}

test("live steering completion fails on pre-completion unacknowledged reviewer message", () => {
	const failure = findLiveSteeringCompletionFailure([
		message({ id: "pre", createdAt: new Date(1000).toISOString(), read: true }),
	], 2000);

	assert.equal(failure?.kind, "unacknowledged");
	assert.deepEqual(failure?.messageIds, ["pre"]);
	assert.match(failure?.reason ?? "", /unacknowledged live steering: pre from reviewer-1/);
});

test("live steering completion ignores post-completion reviewer message", () => {
	const failure = findLiveSteeringCompletionFailure([
		message({ id: "post", createdAt: new Date(3000).toISOString(), read: false }),
	], 2000);

	assert.equal(failure, null);
});

test("live steering completion fails on pre-completion blocked acknowledgement", () => {
	const failure = findLiveSteeringCompletionFailure([
		message({
			id: "blocked",
			createdAt: new Date(1000).toISOString(),
			read: true,
			ackAction: "blocked",
			acknowledgedBy: "worker-0",
			acknowledgedAt: new Date(1500).toISOString(),
			ackReason: "blocked",
		}),
	], 2000);

	assert.equal(failure?.kind, "blocked");
	assert.deepEqual(failure?.messageIds, ["blocked"]);
});

test("live steering completion passes accepted pre-completion acknowledgement", () => {
	const failure = findLiveSteeringCompletionFailure([
		message({
			id: "accepted",
			createdAt: new Date(1000).toISOString(),
			read: true,
			ackAction: "accepted",
			acknowledgedBy: "worker-0",
			acknowledgedAt: new Date(1500).toISOString(),
			ackReason: "accepted",
		}),
	], 2000);

	assert.equal(failure, null);
});

function decision(overrides) {
	return {
		id: "decision",
		runId: "run",
		from: "reviewer-1",
		action: "nothing",
		reason: "watching",
		urgent: false,
		createdAt: new Date(1000).toISOString(),
		...overrides,
	};
}

test("reviewer pulse protocol fails when a reviewer never pulses while worker is active", () => {
	const failures = findLiveSteeringReviewerPulseFailures({
		decisions: [decision({ from: "reviewer-1", createdAt: new Date(1500).toISOString() })],
		reviewerNames: ["reviewer-1", "reviewer-2"],
		workerStartedAtMs: 1000,
		workerCompletedAtMs: 10_000,
	});

	assert.deepEqual(failures.map((failure) => failure.reviewer), ["reviewer-2"]);
	assert.match(failures[0].reason, /no active team_decide pulse/);
});

test("reviewer pulse protocol fails when the first pulse is too late", () => {
	const failures = findLiveSteeringReviewerPulseFailures({
		decisions: [
			decision({ from: "reviewer-1", createdAt: new Date(80_000).toISOString() }),
			decision({ from: "reviewer-2", createdAt: new Date(2000).toISOString() }),
		],
		reviewerNames: ["reviewer-1", "reviewer-2"],
		workerStartedAtMs: 1000,
		workerCompletedAtMs: 100_000,
		firstPulseWithinMs: 30_000,
	});

	assert.deepEqual(failures.map((failure) => failure.reviewer), ["reviewer-1"]);
	assert.match(failures[0].reason, /first active team_decide pulse was too late/);
});

test("reviewer pulse protocol fails when a long worker run has only one passive pulse", () => {
	const failures = findLiveSteeringReviewerPulseFailures({
		decisions: [
			decision({ from: "reviewer-1", action: "nothing", createdAt: new Date(2000).toISOString() }),
			decision({ from: "reviewer-2", action: "steer", createdAt: new Date(3000).toISOString() }),
		],
		reviewerNames: ["reviewer-1", "reviewer-2"],
		workerStartedAtMs: 1000,
		workerCompletedAtMs: 200_000,
		longRunMs: 120_000,
	});

	assert.deepEqual(failures.map((failure) => failure.reviewer), ["reviewer-1"]);
	assert.match(failures[0].reason, /only one passive team_decide pulse/);
});

test("reviewer pulse protocol passes sustained active pulses during worker run", () => {
	const failures = findLiveSteeringReviewerPulseFailures({
		decisions: [
			decision({ from: "reviewer-1", action: "nothing", createdAt: new Date(2000).toISOString() }),
			decision({ from: "reviewer-1", action: "steer", createdAt: new Date(60_000).toISOString(), messageId: "m1" }),
			decision({ from: "reviewer-2", action: "nothing", createdAt: new Date(3000).toISOString() }),
			decision({ from: "reviewer-2", action: "nothing", createdAt: new Date(70_000).toISOString() }),
		],
		reviewerNames: ["reviewer-1", "reviewer-2"],
		workerStartedAtMs: 1000,
		workerCompletedAtMs: 200_000,
		longRunMs: 120_000,
	});

	assert.deepEqual(failures, []);
});
