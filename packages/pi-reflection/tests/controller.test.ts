import assert from "node:assert/strict";
import test from "node:test";

import {
	REFLECTION_PROTOCOL_VERSION,
	type ReflectionLaneId,
	type ReflectionProvider,
	type ReflectionRequest,
	type ReflectionResult,
	type ReflectionWork,
} from "../src/contracts.ts";
import {
	MAX_REFLECTION_OBSERVATIONS,
	ReflectionController,
} from "../src/controller.ts";
import { ReflectionProviderRegistry } from "../src/registry.ts";

type Deferred<T> = {
	promise: Promise<T>;
	resolve(value: T): void;
	reject(error: Error): void;
};

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise;
		reject = rejectPromise;
	});
	return { promise, resolve, reject };
}

type Launch = {
	request: ReflectionRequest;
	signal: AbortSignal;
	completion: Deferred<ReflectionResult>;
};

class FakeProvider implements ReflectionProvider {
	readonly id = "fake";
	readonly priority = 0;
	available = true;
	hostEligible = true;
	throwOnLaunch = false;
	cancelRejects = false;
	readonly launches: Launch[] = [];
	readonly cancellations: Array<{ generationId: string; signalAborted: boolean }> = [];

	isAvailable(): boolean {
		return this.available;
	}

	isHostEligible(): boolean {
		return this.hostEligible;
	}

	launch(request: ReflectionRequest, signal: AbortSignal): Promise<ReflectionResult> {
		if (this.throwOnLaunch) throw new Error("launch failed");
		const completion = deferred<ReflectionResult>();
		this.launches.push({ request, signal, completion });
		return completion.promise;
	}

	async cancel(generationId: string): Promise<void> {
		const launch = this.launches.find(
			(candidate) => candidate.request.generationId === generationId,
		);
		if (!launch) throw new Error(`Missing launch ${generationId}`);
		this.cancellations.push({
			generationId,
			signalAborted: launch.signal.aborted,
		});
		if (this.cancelRejects) throw new Error("cancel failed");
	}
}

function work(
	laneId: ReflectionLaneId,
	stateKey: string,
	overrides: Partial<ReflectionWork> = {},
): ReflectionWork {
	return {
		laneId,
		stateKey,
		cwd: "/project",
		payload: { private: "not observable" },
		...overrides,
	};
}

function matchingResult(
	launch: Launch,
	overrides: Partial<ReflectionResult> = {},
): ReflectionResult {
	return {
		version: REFLECTION_PROTOCOL_VERSION,
		sessionId: launch.request.sessionId,
		revision: launch.request.revision,
		generationId: launch.request.generationId,
		laneId: launch.request.laneId,
		output: { private: "not observable" },
		...overrides,
	};
}

function setup(provider = new FakeProvider()) {
	const registry = new ReflectionProviderRegistry();
	registry.register(provider);
	const controller = new ReflectionController(registry);
	controller.startSession("session-1");
	return { controller, provider };
}

function launchAt(provider: FakeProvider, index: number): Launch {
	const launch = provider.launches[index];
	if (!launch) throw new Error(`Missing launch at index ${index}`);
	return launch;
}

async function settle(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function last<T>(items: readonly T[]): T | undefined {
	return items[items.length - 1];
}

test("submit launches synchronously and accepts only matching terminal identity", async () => {
	const { controller, provider } = setup();
	const submission = controller.submit(work("prompt", "state-1"));

	assert.equal(submission.status, "launched");
	assert.equal(provider.launches.length, 1);

	const launch = launchAt(provider, 0);
	launch.completion.resolve(matchingResult(launch));
	await settle();

	assert.equal(last(controller.getObservations())?.disposition, "accepted");
	for (const observation of controller.getObservations()) {
		assert.equal("payload" in observation, false);
		assert.equal("output" in observation, false);
	}
});

test("same lane and descriptor coalesces while changed work supersedes only that lane", async () => {
	const { controller, provider } = setup();
	const first = controller.submit(work("interval", "state-1"));
	const coalesced = controller.submit(work("interval", "state-1"));

	assert.equal(first.status, "launched");
	assert.deepEqual(coalesced, {
		status: "coalesced",
		generationId: first.status === "launched" ? first.generationId : "",
	});
	assert.equal(provider.launches.length, 1);

	const second = controller.submit(work("interval", "state-2"));
	assert.equal(second.status, "launched");
	assert.equal(provider.launches.length, 2);
	assert.equal(launchAt(provider, 0).signal.aborted, true);
	assert.equal(provider.cancellations[0]?.signalAborted, true);

	const oldLaunch = launchAt(provider, 0);
	oldLaunch.completion.resolve(matchingResult(oldLaunch));
	await settle();
	const stale = last(controller.getObservations());
	assert.equal(stale?.disposition, "stale");
	assert.equal(stale?.errorCode, undefined);

	const currentLaunch = launchAt(provider, 1);
	currentLaunch.completion.resolve(matchingResult(currentLaunch));
	await settle();
	assert.equal(last(controller.getObservations())?.disposition, "accepted");
});

test("the three reflection lanes run concurrently", () => {
	const { controller, provider } = setup();
	const lanes: ReflectionLaneId[] = ["prompt", "interval", "agent_end"];
	for (const laneId of lanes) {
		assert.equal(
			controller.submit(work(laneId, `${laneId}-state`)).status,
			"launched",
		);
	}

	assert.deepEqual(
		provider.launches.map(({ request }) => request.laneId),
		lanes,
	);
});

test("revision advance aborts every lane before requesting cancellation", () => {
	const { controller, provider } = setup();
	controller.submit(work("prompt", "prompt-state"));
	controller.submit(work("interval", "interval-state"));

	assert.equal(controller.advanceRevision(), 1);
	assert.equal(provider.cancellations.length, 2);
	assert.equal(
		provider.cancellations.every((item) => item.signalAborted),
		true,
	);
});

test("mismatched results and rejected providers never become accepted", async () => {
	const { controller, provider } = setup();
	controller.submit(work("prompt", "state-1"));
	const mismatched = launchAt(provider, 0);
	mismatched.completion.resolve(
		matchingResult(mismatched, { generationId: "wrong-generation" }),
	);
	await settle();
	const stale = last(controller.getObservations());
	assert.equal(stale?.disposition, "stale");
	assert.equal(stale?.errorCode, "identity_mismatch");

	controller.submit(work("prompt", "state-2"));
	launchAt(provider, 1).completion.reject(new Error("provider failed"));
	await settle();
	assert.equal(
		last(controller.getObservations())?.disposition,
		"provider_failed",
	);
	assert.equal(
		controller.getObservations().some((item) => item.disposition === "accepted"),
		false,
	);
});

test("resources-not-ready checkpoints record only current metadata", () => {
	const { controller } = setup();
	controller.advanceRevision();
	controller.recordResourcesNotReady({ laneId: "prompt" });

	const observation = last(controller.getObservations());
	assert.equal(observation?.sessionId, "session-1");
	assert.equal(observation?.revision, 1);
	assert.equal(observation?.laneId, "prompt");
	assert.equal(observation?.disposition, "resources_not_ready");
	assert.equal(observation?.errorCode, "resources_not_ready");
	assert.equal("payload" in (observation ?? {}), false);
});

test("provider availability and host eligibility fail closed", () => {
	const provider = new FakeProvider();
	const { controller } = setup(provider);
	provider.available = false;
	assert.equal(
		controller.submit(work("prompt", "offline")).status,
		"provider_unavailable",
	);
	provider.available = true;
	provider.hostEligible = false;
	assert.equal(
		controller.submit(work("prompt", "child")).status,
		"host_ineligible",
	);
});

test("synchronous launch and asynchronous cancellation failures are bounded observations", async () => {
	const provider = new FakeProvider();
	const { controller } = setup(provider);
	provider.throwOnLaunch = true;
	assert.equal(
		controller.submit(work("prompt", "sync-failure")).status,
		"provider_failed",
	);

	provider.throwOnLaunch = false;
	provider.cancelRejects = true;
	controller.submit(work("prompt", "cancel-failure"));
	controller.submit(work("prompt", "replacement"));
	await settle();
	assert.equal(
		controller
			.getObservations()
			.some((item) => item.disposition === "cancel_failed"),
		true,
	);
});

test("observations are metadata-only and capped per session", () => {
	const { controller } = setup();
	for (let index = 0; index < MAX_REFLECTION_OBSERVATIONS + 20; index += 1) {
		controller.advanceRevision();
	}

	const observations = controller.getObservations();
	assert.equal(observations.length, MAX_REFLECTION_OBSERVATIONS);
	assert.equal(
		last(observations)?.revision,
		MAX_REFLECTION_OBSERVATIONS + 20,
	);
	assert.equal(
		observations.every(
			(item) => !("payload" in item) && !("output" in item) && !("cwd" in item),
		),
		true,
	);
});

test("session close and disposal reject work and retain late stale metadata", async () => {
	const { controller, provider } = setup();
	controller.submit(work("prompt", "state-1"));
	const launch = launchAt(provider, 0);

	controller.closeSession();
	assert.equal(launch.signal.aborted, true);
	assert.deepEqual(provider.cancellations, [{
		generationId: launch.request.generationId,
		signalAborted: true,
	}]);
	assert.throws(
		() => controller.submit(work("prompt", "after-close")),
		/no active session/,
	);

	controller.dispose();
	assert.equal(
		controller.getObservations().some((item) => item.disposition === "disposed"),
		true,
	);

	launch.completion.resolve(matchingResult(launch));
	await settle();
	assert.equal(last(controller.getObservations())?.disposition, "stale");
	assert.equal(
		controller.getObservations().some((item) => item.disposition === "accepted"),
		false,
	);
});
