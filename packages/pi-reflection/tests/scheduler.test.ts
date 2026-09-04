import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_REFLECTION_CONFIG,
	type ReflectionConfig,
} from "../src/config.ts";
import {
	ReflectionScheduler,
	type ReflectionSchedulerEvent,
} from "../src/scheduler.ts";

function config(overrides: Partial<ReflectionConfig> = {}): ReflectionConfig {
	return { ...DEFAULT_REFLECTION_CONFIG, ...overrides };
}

function scheduler(
	overrides: Partial<ReflectionConfig> = {},
	bundleReady = false,
): { scheduler: ReflectionScheduler; events: ReflectionSchedulerEvent[] } {
	const events: ReflectionSchedulerEvent[] = [];
	return {
		scheduler: new ReflectionScheduler({
			config: config(overrides),
			bundleReady,
			onEvent: (event) => events.push(event),
		}),
		events,
	};
}

describe("ReflectionScheduler", () => {
	it("emits deterministic prompt checkpoints", () => {
		const runtime = scheduler();

		runtime.scheduler.sessionStart("session-1");
		runtime.scheduler.beforeAgentStart();

		assert.deepEqual(runtime.events, [
			{ type: "session_started", sessionId: "session-1" },
			{ type: "invalidated" },
			{
				type: "checkpoint",
				checkpoint: {
					laneId: "prompt",
					stateKey: "session-1:1:prompt:0",
					launchReady: false,
				},
			},
		]);
	});

	it("emits interval checkpoints at the configured cadence", () => {
		const runtime = scheduler({ turnInterval: 2 });
		runtime.scheduler.sessionStart("s");
		runtime.scheduler.beforeAgentStart();
		runtime.events.length = 0;

		runtime.scheduler.turnEnd();
		assert.equal(runtime.events.length, 0);
		runtime.scheduler.turnEnd();

		assert.deepEqual(runtime.events, [{
			type: "checkpoint",
			checkpoint: {
				laneId: "interval",
				stateKey: "s:1:interval:2",
				launchReady: false,
			},
		}]);
	});

	it("advances checkpoint state only when a turn ends", () => {
		const runtime = scheduler({ turnInterval: 1 });
		runtime.scheduler.sessionStart("s");
		runtime.scheduler.beforeAgentStart();
		runtime.events.length = 0;

		runtime.scheduler.turnEnd();
		runtime.scheduler.agentEnd();
		runtime.scheduler.agentEnd();
		runtime.scheduler.turnEnd();
		runtime.scheduler.agentEnd();

		assert.deepEqual(
			runtime.events.flatMap((event) =>
				event.type === "checkpoint" ? [event.checkpoint.stateKey] : [],
			),
			[
				"s:1:interval:1",
				"s:1:agent_end:1",
				"s:1:agent_end:1",
				"s:1:interval:2",
				"s:1:agent_end:2",
			],
		);
	});

	it("requires both configured and packaged resource readiness", () => {
		const unavailable = scheduler({ resourcesReady: true }, false);
		unavailable.scheduler.sessionStart("s");
		unavailable.scheduler.beforeAgentStart();
		const blocked = unavailable.events.at(-1);
		assert.equal(
			blocked?.type === "checkpoint" && blocked.checkpoint.launchReady,
			false,
		);

		const available = scheduler({ resourcesReady: true }, true);
		available.scheduler.sessionStart("s");
		available.scheduler.beforeAgentStart();
		const ready = available.events.at(-1);
		assert.equal(
			ready?.type === "checkpoint" && ready.checkpoint.launchReady,
			true,
		);
	});

	it("resets interval cadence and advances state keys on context changes", () => {
		const runtime = scheduler({ turnInterval: 2 });
		runtime.scheduler.sessionStart("s");
		runtime.scheduler.beforeAgentStart();
		runtime.scheduler.turnEnd();
		runtime.scheduler.treeNavigation();
		runtime.scheduler.turnEnd();
		assert.equal(
			runtime.events.filter((event) => event.type === "checkpoint").length,
			1,
		);

		runtime.scheduler.turnEnd();
		const checkpoint = runtime.events.at(-1);
		assert.equal(
			checkpoint?.type === "checkpoint" && checkpoint.checkpoint.stateKey,
			"s:2:interval:3",
		);

		runtime.scheduler.compactionRevision();
		assert.deepEqual(runtime.events.at(-1), { type: "invalidated" });
	});

	it("honors per-checkpoint trigger switches and synchronous shutdown", () => {
		const runtime = scheduler({
			promptStartTrigger: false,
			intervalTrigger: false,
			agentEndTrigger: false,
		});
		runtime.scheduler.sessionStart("s");
		runtime.scheduler.beforeAgentStart();
		runtime.scheduler.turnEnd();
		runtime.scheduler.agentEnd();
		assert.equal(
			runtime.events.some((event) => event.type === "checkpoint"),
			false,
		);

		runtime.scheduler.shutdown();
		assert.deepEqual(runtime.events.at(-1), { type: "shutdown" });
	});
});
