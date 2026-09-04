export const REFLECTION_PROTOCOL_VERSION = 1 as const;

export type ReflectionProtocolVersion = typeof REFLECTION_PROTOCOL_VERSION;
export type ReflectionLaneId = "prompt" | "interval" | "agent_end";

export interface ReflectionRequest {
	version: ReflectionProtocolVersion;
	sessionId: string;
	revision: number;
	generationId: string;
	generationSequence: number;
	laneId: ReflectionLaneId;
	stateKey: string;
	cwd: string;
	payload: unknown;
}

export interface ReflectionResult {
	version: ReflectionProtocolVersion;
	sessionId: string;
	revision: number;
	generationId: string;
	laneId: ReflectionLaneId;
	output: unknown;
}

export interface ReflectionProvider {
	readonly id: string;
	readonly priority: number;
	isAvailable(): boolean;
	isHostEligible(): boolean;
	launch(
		request: ReflectionRequest,
		signal: AbortSignal,
	): Promise<ReflectionResult>;
	cancel?(generationId: string): Promise<void>;
	dispose?(): void;
}

export type ReflectionProviderSelection =
	| { status: "selected"; provider: ReflectionProvider }
	| { status: "unavailable" }
	| { status: "host_ineligible" };

export type ReflectionDisposition =
	| "session_started"
	| "revision_advanced"
	| "launched"
	| "coalesced"
	| "superseded"
	| "resources_not_ready"
	| "provider_unavailable"
	| "host_ineligible"
	| "accepted"
	| "stale"
	| "provider_failed"
	| "cancel_failed"
	| "session_closed"
	| "disposed";

export type ReflectionErrorCode =
	| "provider_unavailable"
	| "host_ineligible"
	| "resources_not_ready"
	| "provider_failed"
	| "cancel_failed"
	| "identity_mismatch";

export interface ReflectionObservation {
	version: ReflectionProtocolVersion;
	sessionId: string;
	revision: number;
	disposition: ReflectionDisposition;
	timestamp: number;
	generationId?: string;
	laneId?: ReflectionLaneId;
	providerId?: string;
	durationMs?: number;
	errorCode?: ReflectionErrorCode;
}

export interface ReflectionWork {
	laneId: ReflectionLaneId;
	stateKey: string;
	cwd: string;
	payload: unknown;
	providerId?: string;
}

export type ReflectionSubmission =
	| { status: "launched"; generationId: string }
	| { status: "coalesced"; generationId: string }
	| { status: "provider_unavailable" }
	| { status: "host_ineligible" }
	| { status: "provider_failed"; generationId: string };
