import type { StoredSourceMetadata } from "./store.ts";

export function retrievalLabel(source: StoredSourceMetadata): string {
	if (source.captureStatus === "details.fullOutputPath")
		return "Captured-output retrieval";
	if (source.captureStatus === "read.input.path")
		return "Stored read-range retrieval";
	return "Stored-content retrieval";
}

export function retrievalDescription(source: StoredSourceMetadata): string {
	const calls = `use tool_result_outline sourceId:"${source.sourceId}" for shape, tool_result_search for focused evidence, and bounded tool_result_get windows for cited lines`;
	if (source.captureStatus === "details.fullOutputPath") {
		return `${calls} across the captured full output`;
	}
	if (source.captureStatus === "read.input.path") {
		return `${calls} across the stored read range`;
	}
	return `${calls}. Stored content may already reflect upstream truncation or omission before the virtualizer saw the result`;
}
