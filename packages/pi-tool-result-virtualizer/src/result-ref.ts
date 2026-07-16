import type { ScopeFailure } from "./provenance.ts";
import type { CaptureStatus } from "./store.ts";

export type Availability = "available" | "missing" | "failed" | "unverified";
export type CaptureCompleteness =
	| "exact_capture"
	| "possibly_truncated"
	| "unknown";
export type ContentKind =
	| "text"
	| "json"
	| "jsonl"
	| "csv"
	| "log"
	| "diff"
	| "unknown";

export type ResultScope =
	| { kind: "project"; projectId: string; sessionId?: string }
	| { kind: "unscoped"; reason?: ScopeFailure }
	| { kind: "legacy" };

export type ResultRef = {
	sourceId: string;
	scope: ResultScope;
	availability: Availability;
	contentKind: ContentKind;
	captureStatus: CaptureStatus;
	completeness: CaptureCompleteness;
	byteCount: number;
	lineCount: number;
	sha256: string;
};

export type CitationRef = {
	sourceId: string;
	startLine: number;
	endLine: number;
};

type ResultRefMetadata = {
	sourceId: string;
	captureStatus: CaptureStatus;
	byteCount: number;
	lineCount: number;
	sha256: string;
	scope?: "project" | "unscoped" | "legacy";
	projectId?: string;
	scopeFailure?: ScopeFailure;
	sessionId?: string;
	availability?: Availability;
	contentKind?: ContentKind;
};

function captureCompleteness(
	captureStatus: CaptureStatus,
): CaptureCompleteness {
	return captureStatus === "event.content"
		? "possibly_truncated"
		: "exact_capture";
}

function resultScope(metadata: ResultRefMetadata): ResultScope {
	if (metadata.scope === "unscoped") {
		return metadata.scopeFailure
			? { kind: "unscoped", reason: metadata.scopeFailure }
			: { kind: "unscoped" };
	}
	if (metadata.scope === "legacy" || !metadata.projectId)
		return { kind: "legacy" };
	return metadata.sessionId
		? {
				kind: "project",
				projectId: metadata.projectId,
				sessionId: metadata.sessionId,
			}
		: { kind: "project", projectId: metadata.projectId };
}

export function resultRefFromMetadata(metadata: ResultRefMetadata): ResultRef {
	return {
		sourceId: metadata.sourceId,
		scope: resultScope(metadata),
		availability: metadata.availability ?? "available",
		contentKind: metadata.contentKind ?? "text",
		captureStatus: metadata.captureStatus,
		completeness: captureCompleteness(metadata.captureStatus),
		byteCount: metadata.byteCount,
		lineCount: metadata.lineCount,
		sha256: metadata.sha256,
	};
}
