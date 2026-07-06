import type { ToolDefinitionLike } from "./extension-types.ts";
import { capProtectedToolOutput, formatDiagnostics, formatLineWindow, formatRetentionPreview, formatSearchMatches, PROTECTED_TOOL_OUTPUT_BYTE_LIMIT } from "./formatting.ts";
import { formatSourceOutline } from "./outline.ts";
import { boundedIntegerParam, optionalBooleanParam, optionalFilePathParam, optionalNumberParam, optionalSourceIdParam, queryDetails, reasonDetails, sourceIdParam, stringParam, summaryPromptParam } from "./params.ts";
import { exportRecoveryDescription, exportRecoveryLabel } from "./recovery.ts";
import { DIAGNOSTICS_PARAMS, EXPORT_DETAILS_PARAMS, EXPORT_PARAMS, GET_PARAMS, LIST_PARAMS, OUTLINE_PARAMS, RETENTION_PREVIEW_PARAMS, SEARCH_PARAMS, SUMMARY_CONTRACT_PARAMS } from "./schemas.ts";
import type { SourceRead, ToolResultStore } from "./store.ts";

function buildRecommendedSubagentTask(source: SourceRead, prompt: string): string {
	const { metadata } = source;
	return [
		`Read-only focused summary for tool-result source ${metadata.sourceId}.`,
		"Do not edit files, run destructive commands, or mutate external systems.",
		`User focus: ${prompt}`,
		"Use tool_result_outline first for triage, then tool_result_search and bounded tool_result_get windows for relevant evidence. Use tool_result_export only if exact oversized ranges are required offline. Do not paste the full raw source into the parent context.",
		"Return exactly:",
		`- Source id: ${metadata.sourceId}`,
		"- Retrieval commands or cited line ranges inspected:",
		"- Concise findings for the user focus:",
		"- Omitted or uncertain areas:",
		"- Whether exact full retrieval/export is still needed:",
	].join("\n");
}

function formatSummaryContract(source: SourceRead, recommendedSubagentTask: string): string {
	const { metadata } = source;
	return [
		`# Tool-result summary contract ${metadata.sourceId}`,
		"This tool does not spawn a subagent. Pi extension tools do not expose a clean stable tool-to-tool/subagent invocation API here, so this returns an honest ready-to-call subagent contract instead of faking execution.",
		`Source: ${metadata.sourceId}; tool: ${metadata.toolName}; capture: ${metadata.captureStatus}; bytes: ${metadata.byteCount}; lines: ${metadata.lineCount}; sha256:${metadata.sha256.slice(0, 12)}`,
		"",
		"## Recommended next call",
		"Call the `subagent` tool with a no-edit/no-mutation task like this:",
		"",
		"```text",
		recommendedSubagentTask,
		"```",
		"",
		`## ${exportRecoveryLabel(metadata)}`,
		`${exportRecoveryDescription(metadata)}. Bounded tool_result_get/search output is not full recovery when capped.`,
	].join("\n");
}

export function buildToolResultTools(store: ToolResultStore): ToolDefinitionLike[] {
	return [
	{
		name: "tool_result_outline",
		label: "Tool Result Outline",
		description: "Return a bounded deterministic outline of a stored tool result with head/tail samples, broad keyword hits, and explicit omissions.",
		promptSnippet: "Outline a stored large tool result before deciding whether exact search/get/export is needed",
		promptGuidelines: [
			"Use tool_result_outline as a cheap first pass when a compact receipt is too sparse; treat it as triage, not complete evidence.",
		],
		parameters: OUTLINE_PARAMS,
		async execute(_toolCallId, params) {
			const sourceId = sourceIdParam(params);
			const headLines = boundedIntegerParam(params, "headLines", 5, 0, 20);
			const tailLines = boundedIntegerParam(params, "tailLines", 5, 0, 20);
			const keywordLimit = boundedIntegerParam(params, "keywordLimit", 8, 0, 20);
			const source = await store.readSource(sourceId);
			const outline = formatSourceOutline(source, headLines, tailLines, keywordLimit);
			const capped = capProtectedToolOutput(outline.text, `outline capped; use tool_result_search sourceId:"${sourceId}" query:"..." or tool_result_export for exact source`);
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					sourceId,
					headLines,
					tailLines,
					keywordLimit,
					omittedMiddleLineCount: outline.omittedMiddleLineCount,
					keywordHitCount: outline.keywordHitCount,
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_summary_contract",
		label: "Tool Result Summary Contract",
		description: "Return an honest ready-to-call subagent task contract for focused summarization of a stored tool result without dumping the raw source into parent context.",
		promptSnippet: "Create a focused subagent summary contract for a stored large tool result",
		promptGuidelines: [
			"Prefer tool_result_summary_contract after a compact receipt when a focused answer is needed; it returns a ready-to-call subagent task and does not itself summarize or retrieve all raw content.",
		],
		parameters: SUMMARY_CONTRACT_PARAMS,
		async execute(_toolCallId, params) {
			const sourceId = sourceIdParam(params);
			const prompt = summaryPromptParam(params);
			const source = await store.readSource(sourceId);
			const recommendedSubagentTask = buildRecommendedSubagentTask(source, prompt);
			const contract = formatSummaryContract(source, recommendedSubagentTask);
			const capped = capProtectedToolOutput(contract, `summary contract capped; rerun with a shorter prompt or use tool_result_export sourceId:"${sourceId}" for exact source`);
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					sourceId,
					contractOnly: true,
					lineCount: source.metadata.lineCount,
					byteCount: source.metadata.byteCount,
					recommendedSubagentTask,
					retrievalTools: ["tool_result_outline", "tool_result_search", "tool_result_get", "tool_result_export"],
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_get",
		label: "Tool Result Get",
		description: "Retrieve a bounded, byte-capped line window from a locally stored large tool result. Use tool_result_export for exact oversized ranges.",
		promptSnippet: "Retrieve exact bounded line windows from compact tool-result receipts",
		promptGuidelines: [
			"Use tool_result_get when a tool-result receipt has a sourceId and relevant local lines are needed; output is byte-capped, so use tool_result_export when an exact oversized range is required offline.",
		],
		parameters: GET_PARAMS,
		async execute(_toolCallId, params) {
			const sourceId = sourceIdParam(params);
			const lineOptions: { lineStart?: number; lineLimit?: number } = {};
			const lineStart = optionalNumberParam(params, "lineStart");
			const lineLimit = optionalNumberParam(params, "lineLimit");
			if (lineStart !== undefined) lineOptions.lineStart = lineStart;
			if (lineLimit !== undefined) lineOptions.lineLimit = lineLimit;
			const window = await store.getLineWindow(sourceId, lineOptions);
			const capped = capProtectedToolOutput(
				formatLineWindow(sourceId, window.startLine, window.endLine, window.text),
				`exact selected range remains local; use tool_result_export sourceId:"${sourceId}" lineStart:${window.startLine} lineLimit:${Math.max(window.lineCount, 1)}`,
			);
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					sourceId,
					startLine: window.startLine,
					endLine: window.endLine,
					lineCount: window.lineCount,
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_search",
		label: "Tool Result Search",
		description: "Search locally stored large tool results and return byte-capped cited line matches with small context windows.",
		promptSnippet: "Search compactly indexed local tool-result sources by substring",
		promptGuidelines: [
			"Use tool_result_search before broad retrieval when a compact receipt has a sourceId and only relevant lines are needed.",
		],
		parameters: SEARCH_PARAMS,
		async execute(_toolCallId, params) {
			const query = stringParam(params, "query");
			const searchOptions: { sourceId?: string; limit?: number; contextLines?: number } = {};
			const sourceId = optionalSourceIdParam(params);
			const limit = optionalNumberParam(params, "limit");
			const contextLines = optionalNumberParam(params, "contextLines");
			if (sourceId !== undefined) searchOptions.sourceId = sourceId;
			if (limit !== undefined) searchOptions.limit = limit;
			if (contextLines !== undefined) searchOptions.contextLines = contextLines;
			const matches = await store.search(query, searchOptions);
			const formatted = formatSearchMatches(matches);
			const broadNoMatchGuidance = sourceId === undefined && matches.length === 0
				? "\n\nGuidance: this was a broad search across stored sources. Use sourceId from a receipt when possible, or run tool_result_list / tool_result_diagnostics to choose a source before retrying."
				: "";
			const firstMatch = matches[0];
			const notice = firstMatch === undefined
				? "rerun with a narrower query or sourceId-restricted search if needed"
				: `rerun with smaller limit/contextLines or use tool_result_export sourceId:"${firstMatch.sourceId}" lineStart:${firstMatch.contextStartLine} lineLimit:${Math.max(firstMatch.contextEndLine - firstMatch.contextStartLine + 1, 1)}`;
			const capped = capProtectedToolOutput(`${formatted.text}${broadNoMatchGuidance}`, notice);
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					...queryDetails(query),
					matchCount: matches.length,
					outputTruncated: formatted.contextTruncated || capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_list",
		label: "Tool Result List",
		description: "List recent locally stored tool-result sources with source ids and compact metadata.",
		parameters: LIST_PARAMS,
		async execute(_toolCallId, params) {
			const sources = await store.listSources(boundedIntegerParam(params, "limit", 20, 1, 100));
			const text = sources.length === 0
				? "No stored tool-result sources."
				: sources
					.map((source) => `${source.sourceId} ${source.toolName} ${source.captureStatus} ${source.storageKind} ${source.byteCount} bytes ${source.lineCount} lines sha256:${source.sha256.slice(0, 12)}`)
					.join("\n");
			const capped = capProtectedToolOutput(text, "rerun tool_result_list with a smaller limit");
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					count: sources.length,
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_diagnostics",
		label: "Tool Result Diagnostics",
		description: "Show compact local store health metadata for virtualized tool results without raw source content.",
		parameters: DIAGNOSTICS_PARAMS,
		async execute(_toolCallId, params) {
			const stats = await store.getStats(boundedIntegerParam(params, "limit", 5, 1, 100));
			const capped = capProtectedToolOutput(formatDiagnostics(stats), "rerun tool_result_diagnostics with a smaller limit");
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
				root: stats.root,
				sourceCount: stats.sourceCount,
				sourceBytes: stats.totalBytes,
				totalOriginalDetailsBytes: stats.totalOriginalDetailsBytes,
					totalStoredBytes: stats.totalStoredBytes,
					totalLines: stats.totalLines,
					indexLineCount: stats.indexLineCount,
					invalidIndexLineCount: stats.invalidIndexLineCount,
					recentSourceIds: stats.recentSources.map((source) => source.sourceId),
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_retention_preview",
		label: "Tool Result Retention Preview",
		description: "Preview non-destructive retention cleanup candidates for stored tool-result sources without deleting files or returning raw source text.",
		parameters: RETENTION_PREVIEW_PARAMS,
		async execute(_toolCallId, params) {
			const previewOptions: { maxSources?: number; maxAgeHours?: number } = {};
			const maxSources = optionalNumberParam(params, "maxSources");
			const maxAgeHours = optionalNumberParam(params, "maxAgeHours");
			const limit = boundedIntegerParam(params, "limit", 20, 1, 100);
			if (maxSources !== undefined) previewOptions.maxSources = maxSources;
			if (maxAgeHours !== undefined) previewOptions.maxAgeHours = maxAgeHours;
			const preview = await store.previewRetention(previewOptions);
			const visibleCandidates = preview.candidates.slice(0, limit);
			const visibleKeptSourceIds = preview.keptSourceIds.slice(0, limit);
			const capped = capProtectedToolOutput(formatRetentionPreview(preview, limit), "rerun tool_result_retention_preview with a smaller limit or narrower maxSources/maxAgeHours");
			return {
				content: [{ type: "text", text: capped.text }],
				details: {
					root: preview.root,
					sourceCount: preview.sourceCount,
					keptCount: preview.keptCount,
					candidateCount: preview.candidateCount,
					candidateBytes: preview.candidateBytes,
					candidateDetailsBytes: preview.candidateDetailsBytes,
					candidateStoredBytes: preview.candidateStoredBytes,
					candidateLines: preview.candidateLines,
					selectors: preview.selectors,
					candidateSourceIds: visibleCandidates.map((candidate) => candidate.sourceId),
					omittedCandidateCount: Math.max(0, preview.candidates.length - visibleCandidates.length),
					keptSourceIds: visibleKeptSourceIds,
					omittedKeptSourceCount: Math.max(0, preview.keptSourceIds.length - visibleKeptSourceIds.length),
					outputTruncated: capped.outputTruncated,
					totalBytes: capped.totalBytes,
					returnedBytes: capped.returnedBytes,
					outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
					...reasonDetails(params),
				},
			};
		},
	},

	{
		name: "tool_result_export_details",
		label: "Tool Result Export Details",
		description: "Export exact original tool-result details JSON to a local file without returning raw details content to the model.",
		promptSnippet: "Export stored original tool-result details to a local JSON file without dumping details into context",
		promptGuidelines: [
			"Use tool_result_export_details only when compact details metadata says hasOriginalDetails/originalDetailsByteCount exists and exact original tool-result details are needed offline.",
		],
		parameters: EXPORT_DETAILS_PARAMS,
		async execute(_toolCallId, params) {
			const sourceId = sourceIdParam(params);
			const exportOptions: { filePath?: string; overwrite?: boolean } = {};
			const filePath = optionalFilePathParam(params);
			const overwrite = optionalBooleanParam(params, "overwrite");
			if (filePath !== undefined) exportOptions.filePath = filePath;
			if (overwrite !== undefined) exportOptions.overwrite = overwrite;
			const exported = await store.exportOriginalDetails(sourceId, exportOptions);
			const text = `Exported original details for ${sourceId} to ${exported.filePath}\nBytes: ${exported.byteCount}; sha256: ${exported.sha256}`;
			return { content: [{ type: "text", text }], details: { ...exported, ...reasonDetails(params) } };
		},
	},

	{
		name: "tool_result_export",
		label: "Tool Result Export",
		description: "Export a full stored tool result or bounded line range to a local file without returning raw content to the model.",
		promptSnippet: "Export large stored tool-result sources to local files without dumping raw content into context",
		promptGuidelines: [
			"Use tool_result_export when a large stored source needs offline processing; inspect the exported file with bounded tools instead of returning the full source to context.",
		],
		parameters: EXPORT_PARAMS,
		async execute(_toolCallId, params) {
			const sourceId = sourceIdParam(params);
			const exportOptions: { lineStart?: number; lineLimit?: number; filePath?: string; overwrite?: boolean } = {};
			const lineStart = optionalNumberParam(params, "lineStart");
			const lineLimit = optionalNumberParam(params, "lineLimit");
			const filePath = optionalFilePathParam(params);
			const overwrite = optionalBooleanParam(params, "overwrite");
			if (lineStart !== undefined) exportOptions.lineStart = lineStart;
			if (lineLimit !== undefined) exportOptions.lineLimit = lineLimit;
			if (filePath !== undefined) exportOptions.filePath = filePath;
			if (overwrite !== undefined) exportOptions.overwrite = overwrite;
			const exported = await store.exportSource(sourceId, exportOptions);
			const text = `Exported ${sourceId}:${exported.startLine}-${exported.endLine} to ${exported.filePath}\nBytes: ${exported.byteCount}; lines: ${exported.lineCount}; sha256: ${exported.sha256}`;
			return { content: [{ type: "text", text }], details: { ...exported, ...reasonDetails(params) } };
		},
	},
	];
}
