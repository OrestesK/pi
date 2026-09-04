import {
	REFLECTION_PROTOCOL_VERSION,
	type ReflectionLaneId,
	type ReflectionObservation,
	type ReflectionProvider,
	type ReflectionRequest,
	type ReflectionResult,
	type ReflectionSubmission,
	type ReflectionWork,
} from "./contracts.ts";
import { ReflectionProviderRegistry } from "./registry.ts";

export const MAX_REFLECTION_OBSERVATIONS = 256;

type ActiveLaunch = {
	generationId: string;
	sessionId: string;
	revision: number;
	laneId: ReflectionLaneId;
	stateKey: string;
	cwd: string;
	explicitProviderId?: string;
	provider: ReflectionProvider;
	controller: AbortController;
	startedAt: number;
};

function sameDescriptor(active: ActiveLaunch, work: ReflectionWork): boolean {
	return (
		active.stateKey === work.stateKey &&
		active.cwd === work.cwd &&
		active.explicitProviderId === work.providerId
	);
}

export class ReflectionController {
	readonly #registry: ReflectionProviderRegistry;
	readonly #active = new Map<ReflectionLaneId, ActiveLaunch>();
	readonly #observations: ReflectionObservation[] = [];
	#sessionId: string | undefined;
	#observationSessionId: string | undefined;
	#revision = 0;
	#generationSequence = 0;

	constructor(registry: ReflectionProviderRegistry) {
		this.#registry = registry;
	}

	getObservations(): readonly ReflectionObservation[] {
		return [...this.#observations];
	}

	startSession(sessionId: string): void {
		this.#sessionId = sessionId;
		this.#observationSessionId = sessionId;
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId,
			revision: this.#revision,
			disposition: "session_started",
			timestamp: Date.now(),
		});
	}

	advanceRevision(): number {
		const sessionId = this.#requireSession();
		this.#cancelAll();
		this.#revision += 1;
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId,
			revision: this.#revision,
			disposition: "revision_advanced",
			timestamp: Date.now(),
		});
		return this.#revision;
	}

	recordResourcesNotReady(work: Pick<ReflectionWork, "laneId">): void {
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId: this.#requireSession(),
			revision: this.#revision,
			laneId: work.laneId,
			disposition: "resources_not_ready",
			timestamp: Date.now(),
			errorCode: "resources_not_ready",
		});
	}

	submit(work: ReflectionWork): ReflectionSubmission {
		const sessionId = this.#requireSession();

		const existing = this.#active.get(work.laneId);
		if (existing && sameDescriptor(existing, work)) {
			this.#recordForActive(existing, "coalesced");
			return { status: "coalesced", generationId: existing.generationId };
		}
		if (existing) this.#cancel(existing);

		const selection = this.#registry.select(work.providerId);
		if (selection.status !== "selected") {
			const disposition =
				selection.status === "host_ineligible"
					? "host_ineligible"
					: "provider_unavailable";
			this.#record({
				version: REFLECTION_PROTOCOL_VERSION,
				sessionId,
				revision: this.#revision,
				laneId: work.laneId,
				disposition,
				timestamp: Date.now(),
				errorCode: disposition,
			});
			return { status: disposition };
		}

		this.#generationSequence += 1;
		const generationId = `reflection-${this.#revision}-${this.#generationSequence}`;
		const controller = new AbortController();
		const active: ActiveLaunch = {
			generationId,
			sessionId,
			revision: this.#revision,
			laneId: work.laneId,
			stateKey: work.stateKey,
			cwd: work.cwd,
			...(work.providerId === undefined
				? {}
				: { explicitProviderId: work.providerId }),
			provider: selection.provider,
			controller,
			startedAt: Date.now(),
		};
		this.#active.set(work.laneId, active);
		this.#recordForActive(active, "launched");

		const request: ReflectionRequest = {
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId,
			revision: this.#revision,
			generationId,
			generationSequence: this.#generationSequence,
			laneId: work.laneId,
			stateKey: work.stateKey,
			cwd: work.cwd,
			payload: work.payload,
		};
		try {
			const completion = selection.provider.launch(request, controller.signal);
			void completion.then(
				(result) => this.#complete(active, result),
				() => this.#fail(active),
			);
		} catch {
			this.#removeIfCurrent(active);
			this.#recordFailure(active, "provider_failed", "provider_failed");
			return { status: "provider_failed", generationId };
		}
		return { status: "launched", generationId };
	}

	closeSession(): void {
		const sessionId = this.#sessionId;
		if (sessionId === undefined) return;
		this.#cancelAll();
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId,
			revision: this.#revision,
			disposition: "session_closed",
			timestamp: Date.now(),
		});
		this.#sessionId = undefined;
	}

	dispose(): void {
		const sessionId = this.#sessionId ?? this.#observationSessionId;
		this.#cancelAll();
		if (sessionId !== undefined) {
			this.#record({
				version: REFLECTION_PROTOCOL_VERSION,
				sessionId,
				revision: this.#revision,
				disposition: "disposed",
				timestamp: Date.now(),
			});
		}
		this.#sessionId = undefined;
	}

	#complete(active: ActiveLaunch, result: ReflectionResult): void {
		const current = this.#active.get(active.laneId);
		if (current !== active) {
			this.#recordForActive(active, "stale");
			return;
		}
		const identityMatches =
			result.version === REFLECTION_PROTOCOL_VERSION &&
			result.sessionId === active.sessionId &&
			result.revision === active.revision &&
			result.generationId === active.generationId &&
			result.laneId === active.laneId;
		if (!identityMatches) {
			this.#active.delete(active.laneId);
			this.#recordFailure(active, "stale", "identity_mismatch");
			return;
		}
		this.#active.delete(active.laneId);
		this.#recordForActive(active, "accepted");
	}

	#fail(active: ActiveLaunch): void {
		if (!this.#removeIfCurrent(active)) {
			this.#recordForActive(active, "stale");
			return;
		}
		this.#recordFailure(active, "provider_failed", "provider_failed");
	}

	#cancel(active: ActiveLaunch): void {
		this.#removeIfCurrent(active);
		active.controller.abort();
		this.#recordForActive(active, "superseded");
		if (!active.provider.cancel) return;
		try {
			void active.provider.cancel(active.generationId).catch(() => {
				this.#recordFailure(active, "cancel_failed", "cancel_failed");
			});
		} catch {
			this.#recordFailure(active, "cancel_failed", "cancel_failed");
		}
	}

	#cancelAll(): void {
		for (const active of [...this.#active.values()]) this.#cancel(active);
	}

	#removeIfCurrent(active: ActiveLaunch): boolean {
		if (this.#active.get(active.laneId) !== active) return false;
		this.#active.delete(active.laneId);
		return true;
	}

	#recordForActive(
		active: ActiveLaunch,
		disposition: ReflectionObservation["disposition"],
	): void {
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId: active.sessionId,
			revision: active.revision,
			generationId: active.generationId,
			laneId: active.laneId,
			providerId: active.provider.id,
			disposition,
			timestamp: Date.now(),
			durationMs: Math.max(0, Date.now() - active.startedAt),
		});
	}

	#recordFailure(
		active: ActiveLaunch,
		disposition: "stale" | "provider_failed" | "cancel_failed",
		errorCode: "identity_mismatch" | "provider_failed" | "cancel_failed",
	): void {
		this.#record({
			version: REFLECTION_PROTOCOL_VERSION,
			sessionId: active.sessionId,
			revision: active.revision,
			generationId: active.generationId,
			laneId: active.laneId,
			providerId: active.provider.id,
			disposition,
			timestamp: Date.now(),
			durationMs: Math.max(0, Date.now() - active.startedAt),
			errorCode,
		});
	}

	#record(observation: ReflectionObservation): void {
		if (observation.sessionId === this.#observationSessionId) {
			this.#observations.push(observation);
			if (this.#observations.length > MAX_REFLECTION_OBSERVATIONS) {
				this.#observations.splice(
					0,
					this.#observations.length - MAX_REFLECTION_OBSERVATIONS,
				);
			}
		}
	}

	#requireSession(): string {
		if (this.#sessionId === undefined) {
			throw new Error("Reflection controller has no active session");
		}
		return this.#sessionId;
	}
}
