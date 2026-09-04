import type { ReflectionLaneId } from "./contracts.ts";
import type { ReflectionConfig } from "./config.ts";

export type ReflectionCheckpoint = Readonly<{
	laneId: ReflectionLaneId;
	stateKey: string;
	launchReady: boolean;
}>;

export type ReflectionSchedulerEvent =
	| Readonly<{ type: "session_started"; sessionId: string }>
	| Readonly<{ type: "invalidated" }>
	| Readonly<{ type: "checkpoint"; checkpoint: ReflectionCheckpoint }>
	| Readonly<{ type: "shutdown" }>;

export type ReflectionSchedulerOptions = Readonly<{
	config: ReflectionConfig;
	bundleReady: boolean;
	onEvent(event: ReflectionSchedulerEvent): void;
}>;

export class ReflectionScheduler {
	readonly #config: ReflectionConfig;
	readonly #bundleReady: boolean;
	readonly #onEvent: (event: ReflectionSchedulerEvent) => void;
	#sessionId!: string;
	#revisionEpoch = 0;
	#turnsSinceInterval = 0;
	#stateSequence = 0;

	constructor(options: ReflectionSchedulerOptions) {
		this.#config = options.config;
		this.#bundleReady = options.bundleReady;
		this.#onEvent = options.onEvent;
	}

	sessionStart(sessionId: string): void {
		this.#sessionId = sessionId;
		this.#onEvent({ type: "session_started", sessionId });
	}

	beforeAgentStart(): void {
		this.#invalidate();
		if (this.#config.promptStartTrigger) {
			this.#emitCheckpoint("prompt");
		}
	}

	turnEnd(): void {
		this.#stateSequence += 1;
		this.#turnsSinceInterval += 1;
		if (
			this.#config.intervalTrigger &&
			this.#turnsSinceInterval >= this.#config.turnInterval
		) {
			this.#turnsSinceInterval = 0;
			this.#emitCheckpoint("interval");
		}
	}

	agentEnd(): void {
		if (this.#config.agentEndTrigger) {
			this.#emitCheckpoint("agent_end");
		}
	}

	treeNavigation(): void {
		this.#invalidate();
	}

	compactionRevision(): void {
		this.#invalidate();
	}

	shutdown(): void {
		this.#onEvent({ type: "shutdown" });
	}

	#invalidate(): void {
		this.#revisionEpoch += 1;
		this.#turnsSinceInterval = 0;
		this.#onEvent({ type: "invalidated" });
	}

	#emitCheckpoint(laneId: ReflectionLaneId): void {
		this.#onEvent({
			type: "checkpoint",
			checkpoint: {
				laneId,
				stateKey: `${this.#sessionId}:${this.#revisionEpoch}:${laneId}:${this.#stateSequence}`,
				launchReady: this.#config.resourcesReady && this.#bundleReady,
			},
		});
	}
}
