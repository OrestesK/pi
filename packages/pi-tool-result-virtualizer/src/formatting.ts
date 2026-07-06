import type { RetentionPreview, SearchMatch, StoreStats } from "./store.ts";

export const PROTECTED_TOOL_OUTPUT_BYTE_LIMIT = 8 * 1024;
const SEARCH_MATCH_CONTEXT_BYTE_LIMIT = 2 * 1024;

export function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

export function byteSafePrefix(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (byteLength(text) <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (byteLength(text.slice(0, middle)) <= maxBytes) low = middle;
		else high = middle - 1;
	}
	if (low > 0) {
		const code = text.charCodeAt(low - 1);
		if (code >= 0xd800 && code <= 0xdbff) low -= 1;
	}
	return text.slice(0, low);
}

function byteSafeSuffix(text: string, maxBytes: number): string {
	if (maxBytes <= 0) return "";
	if (byteLength(text) <= maxBytes) return text;
	let low = 0;
	let high = text.length;
	while (low < high) {
		const middle = (low + high + 1) >> 1;
		if (byteLength(text.slice(text.length - middle)) <= maxBytes) low = middle;
		else high = middle - 1;
	}
	let start = text.length - low;
	if (start < text.length) {
		const code = text.charCodeAt(start);
		if (code >= 0xdc00 && code <= 0xdfff) start += 1;
	}
	return text.slice(start);
}

function snippetAroundRange(text: string, start: number, end: number, maxBytes: number): string {
	if (byteLength(text) <= maxBytes) return text;
	const prefixMarker = "...";
	const suffixMarker = "...";
	const matchText = text.slice(start, end);
	const markerBytes = byteLength(prefixMarker) + byteLength(suffixMarker);
	const matchBytes = byteLength(matchText);
	if (matchBytes + markerBytes >= maxBytes) return `${prefixMarker}${byteSafePrefix(matchText, Math.max(0, maxBytes - markerBytes))}${suffixMarker}`;
	const contextBudget = maxBytes - matchBytes - markerBytes;
	const beforeSource = text.slice(0, start);
	const afterSource = text.slice(end);
	const before = byteSafeSuffix(beforeSource, Math.floor(contextBudget / 2));
	const after = byteSafePrefix(afterSource, contextBudget - byteLength(before));
	return `${before.length < beforeSource.length ? prefixMarker : ""}${before}${matchText}${after.length < afterSource.length ? suffixMarker : ""}`;
}

export function capProtectedToolOutput(text: string, notice: string): { text: string; outputTruncated: boolean; totalBytes: number; returnedBytes: number } {
	const totalBytes = byteLength(text);
	if (totalBytes <= PROTECTED_TOOL_OUTPUT_BYTE_LIMIT) {
		return { text, outputTruncated: false, totalBytes, returnedBytes: totalBytes };
	}
	const suffix = `\n\n[tool-result-virtualizer] output capped at ${PROTECTED_TOOL_OUTPUT_BYTE_LIMIT} bytes; ${notice}`;
	const suffixBytes = byteLength(suffix);
	const capped = suffixBytes >= PROTECTED_TOOL_OUTPUT_BYTE_LIMIT
		? byteSafePrefix(suffix, PROTECTED_TOOL_OUTPUT_BYTE_LIMIT)
		: `${byteSafePrefix(text, PROTECTED_TOOL_OUTPUT_BYTE_LIMIT - suffixBytes)}${suffix}`;
	return { text: capped, outputTruncated: true, totalBytes, returnedBytes: byteLength(capped) };
}

export function formatLineWindow(sourceId: string, startLine: number, endLine: number, text: string): string {
	return `# ${sourceId}:${startLine}-${endLine}\n${text}`;
}

function formatSearchContext(match: SearchMatch): { text: string; contextTruncated: boolean } {
	if (byteLength(match.context) <= SEARCH_MATCH_CONTEXT_BYTE_LIMIT) return { text: match.context, contextTruncated: false };
	const lineLimit = Math.max(match.contextEndLine - match.contextStartLine + 1, 1);
	return {
		text: [
			snippetAroundRange(match.line, match.matchStartColumn, match.matchEndColumn, SEARCH_MATCH_CONTEXT_BYTE_LIMIT),
			`[tool-result-virtualizer] context capped around matching line; use tool_result_export sourceId:"${match.sourceId}" lineStart:${match.contextStartLine} lineLimit:${lineLimit}`,
		].join("\n"),
		contextTruncated: true,
	};
}

export function formatSearchMatches(matches: SearchMatch[]): { text: string; contextTruncated: boolean } {
	let contextTruncated = false;
	const text = matches.length === 0
		? "No matches found."
		: matches
			.map((match, index) => {
				const context = formatSearchContext(match);
				if (context.contextTruncated) contextTruncated = true;
				return [
					`## ${index + 1}. ${match.sourceId}:${match.lineNumber}`,
					`Tool: ${match.toolName}; context: ${match.contextStartLine}-${match.contextEndLine}`,
					context.text,
				].join("\n");
			})
			.join("\n");
	return { text, contextTruncated };
}

export function formatDiagnostics(stats: StoreStats): string {
	const recent = stats.recentSources.length === 0
		? ["Recent: none"]
		: [
			"Recent:",
			...stats.recentSources.map((source) => `- ${source.sourceId} ${source.toolName} ${source.captureStatus} ${source.storageKind} ${source.byteCount} bytes ${source.lineCount} lines sha256:${source.sha256.slice(0, 12)}`),
		];
	return [
		`Tool-result virtualizer store: ${stats.root}`,
		`Sources: ${stats.sourceCount}; source bytes: ${stats.totalBytes}; details bytes: ${stats.totalOriginalDetailsBytes}; stored bytes: ${stats.totalStoredBytes}; lines: ${stats.totalLines}`,
		`Index lines: ${stats.indexLineCount}; invalid index lines skipped: ${stats.invalidIndexLineCount}`,
		...recent,
	].join("\n");
}

export function formatRetentionPreview(preview: RetentionPreview, limit: number): string {
	const selectorText = Object.entries(preview.selectors).map(([key, value]) => `${key}=${value}`).join(" ") || "none";
	const visibleCandidates = preview.candidates.slice(0, limit);
	const omittedCount = Math.max(0, preview.candidates.length - visibleCandidates.length);
	const candidates = visibleCandidates.length === 0
		? ["Candidates: none"]
		: [
			"Candidates:",
			...visibleCandidates.map((candidate) => `- ${candidate.sourceId} ${candidate.toolName} ${candidate.captureStatus} ${candidate.storageKind} ${candidate.byteCount} bytes ${candidate.lineCount} lines reasons:${candidate.reasons.join(",")}`),
		];
	if (omittedCount > 0) candidates.push(`omitted candidates: ${omittedCount}`);
	return [
		`Retention preview for ${preview.root}`,
		`Selectors: ${selectorText}`,
		`Sources: ${preview.sourceCount}; keep: ${preview.keptCount}; candidates: ${preview.candidateCount}; candidate source bytes: ${preview.candidateBytes}; candidate details bytes: ${preview.candidateDetailsBytes}; candidate stored bytes: ${preview.candidateStoredBytes}; candidate lines: ${preview.candidateLines}`,
		...candidates,
	].join("\n");
}
