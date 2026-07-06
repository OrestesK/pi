import type { StoredSourceMetadata } from "./store.ts";

export function exportRecoveryLabel(source: StoredSourceMetadata): string {
	if (source.captureStatus === "details.fullOutputPath") return "Exact captured-output escape hatch";
	if (source.captureStatus === "read.input.path") return "Exact stored read-range escape hatch";
	return "Exact stored-content escape hatch";
}

export function exportRecoveryDescription(source: StoredSourceMetadata): string {
	if (source.captureStatus === "details.fullOutputPath") {
		return `call tool_result_export sourceId:"${source.sourceId}" with no lineStart/lineLimit to write the exact captured full output to a local file`;
	}
	if (source.captureStatus === "read.input.path") {
		return `call tool_result_export sourceId:"${source.sourceId}" with no lineStart/lineLimit to write the exact stored read range to a local file`;
	}
	return `call tool_result_export sourceId:"${source.sourceId}" with no lineStart/lineLimit to write the exact stored tool-result content to a local file. This may already reflect upstream truncation or omission before the virtualizer saw the result`;
}
