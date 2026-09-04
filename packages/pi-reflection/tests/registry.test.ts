import assert from "node:assert/strict";
import test from "node:test";

import {
	REFLECTION_PROTOCOL_VERSION,
	type ReflectionProvider,
} from "../src/contracts.ts";
import { ReflectionProviderRegistry } from "../src/registry.ts";

type ProviderOptions = {
	priority?: number;
	available?: boolean;
	hostEligible?: boolean;
	dispose?: () => void;
};

function provider(
	id: string,
	options: ProviderOptions = {},
): ReflectionProvider {
	return {
		id,
		priority: options.priority ?? 0,
		isAvailable: () => options.available ?? true,
		isHostEligible: () => options.hostEligible ?? true,
		launch: async (request) => ({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId: request.sessionId,
			revision: request.revision,
			generationId: request.generationId,
			laneId: request.laneId,
			output: null,
		}),
		...(options.dispose === undefined ? {} : { dispose: options.dispose }),
	};
}

test("registry disposes replaced providers and preserves exact registration identity", () => {
	const registry = new ReflectionProviderRegistry();
	let firstDisposals = 0;
	const first = provider("same", { dispose: () => (firstDisposals += 1) });
	const replacement = provider("same", { priority: 1 });
	const disposeFirst = registry.register(first);
	const disposeReplacement = registry.register(replacement);
	assert.equal(firstDisposals, 1);

	disposeFirst();
	assert.deepEqual(registry.select(), {
		status: "selected",
		provider: replacement,
	});

	disposeReplacement();
	assert.deepEqual(registry.select(), { status: "unavailable" });
	registry.dispose();
	assert.equal(firstDisposals, 1);
});

test("re-registering the same provider object does not dispose it", () => {
	const registry = new ReflectionProviderRegistry();
	let sharedDisposals = 0;
	const shared = provider("shared", { dispose: () => (sharedDisposals += 1) });
	const disposeOld = registry.register(shared);
	const disposeCurrent = registry.register(shared);
	assert.equal(sharedDisposals, 0);

	disposeOld();
	assert.deepEqual(registry.select(), { status: "selected", provider: shared });

	disposeCurrent();
	assert.deepEqual(registry.select(), { status: "unavailable" });
	assert.equal(sharedDisposals, 0);
});

test("selection is deterministic and honors explicit provider requests", () => {
	const registry = new ReflectionProviderRegistry();
	const alpha = provider("alpha", { priority: 5 });
	const beta = provider("beta", { priority: 5 });
	const lower = provider("lower", { priority: 4 });
	registry.register(beta);
	registry.register(lower);
	registry.register(alpha);

	assert.deepEqual(registry.select(), { status: "selected", provider: alpha });
	assert.deepEqual(registry.select("lower"), {
		status: "selected",
		provider: lower,
	});
	assert.deepEqual(registry.select("missing"), { status: "unavailable" });
});

test("selection distinguishes unavailable transports from ineligible hosts", () => {
	const unavailable = new ReflectionProviderRegistry();
	unavailable.register(provider("offline", { available: false }));
	assert.deepEqual(unavailable.select(), { status: "unavailable" });

	const ineligible = new ReflectionProviderRegistry();
	ineligible.register(provider("child", { hostEligible: false }));
	assert.deepEqual(ineligible.select(), { status: "host_ineligible" });
});

test("registry validates the public provider boundary", () => {
	const registry = new ReflectionProviderRegistry();
	assert.throws(() => registry.register(provider("bad id")), /provider id/);
	assert.throws(
		() => registry.register(provider("priority", { priority: 0.5 })),
		/priority/,
	);
	assert.throws(
		() =>
			registry.register({
				id: "missing-method",
				priority: 0,
				isAvailable: () => true,
				isHostEligible: () => true,
			} as unknown as ReflectionProvider),
		/required method/,
	);
});

test("registry disposal clears and disposes current registrations once", () => {
	const registry = new ReflectionProviderRegistry();
	let disposeCount = 0;
	registry.register(
		provider("disposable", { dispose: () => (disposeCount += 1) }),
	);

	registry.dispose();
	registry.dispose();
	assert.equal(disposeCount, 1);
	assert.deepEqual(registry.select(), { status: "unavailable" });
	assert.throws(() => registry.register(provider("late")), /disposed/);
});
