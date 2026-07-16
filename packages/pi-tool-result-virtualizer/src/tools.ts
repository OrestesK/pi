import type { ResultDelegationService } from "./delegation.ts";
import type {
	ToolDefinitionLike,
	ToolExecutionContextLike,
} from "./extension-types.ts";
import {
	capProtectedToolOutput,
	formatDiagnostics,
	formatLineWindow,
	formatRetentionPreview,
	formatSearchMatches,
	PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
} from "./formatting.ts";
import type { GrantOperation } from "./grants.ts";
import type { RunBoundGrantRegistry } from "./grants.ts";
import { formatSourceOutline } from "./outline.ts";
import {
	boundedIntegerParam,
	optionalBooleanParam,
	optionalNumberParam,
	optionalSourceIdParam,
	optionalSourceIdsParam,
	queryDetails,
	reasonDetails,
	sourceIdParam,
	stringParam,
} from "./params.ts";
import {
	DELEGATE_PARAMS,
	DIAGNOSTICS_PARAMS,
	GET_PARAMS,
	LIST_PARAMS,
	OUTLINE_PARAMS,
	RETENTION_PREVIEW_PARAMS,
	SEARCH_PARAMS,
} from "./schemas.ts";
import type {
	SearchOptions,
	StoreAccessContext,
	ToolResultStore,
} from "./store.ts";

type StoreAccessResolver = (
	context: ToolExecutionContextLike,
) => Promise<StoreAccessContext>;

async function accessForTool(
	params: unknown,
	context: ToolExecutionContextLike,
	resolveAccess: StoreAccessResolver,
): Promise<StoreAccessContext> {
	const access = await resolveAccess(context);
	return {
		...access,
		includeGlobal: optionalBooleanParam(params, "includeGlobal") === true,
		includeLegacy: optionalBooleanParam(params, "includeLegacy") === true,
	};
}

async function grantExactSourceAccess(
	access: StoreAccessContext,
	grants: RunBoundGrantRegistry,
	operation: GrantOperation,
	sourceIds: string[],
): Promise<StoreAccessContext> {
	if (access.actor !== "subagent") return access;
	await grants.reserve({
		runId: access.subagentRunId ?? "",
		agentName: access.subagentAgentName ?? "",
		operation,
		sourceIds,
		outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
	});
	return { ...access, grantedSourceIds: new Set(sourceIds) };
}

export function buildToolResultTools(
	store: ToolResultStore,
	resolveAccess: StoreAccessResolver,
	grants: RunBoundGrantRegistry,
	delegation?: ResultDelegationService,
): ToolDefinitionLike[] {
	return [
		{
			name: "tool_result_outline",
			label: "Tool Result Outline",
			description:
				"Return a bounded deterministic outline of a stored tool result with head/tail samples, broad keyword hits, and explicit omissions.",
			promptSnippet:
				"Outline a stored large tool result before deciding which focused search/get retrieval is needed",
			promptGuidelines: [
				"Use tool_result_outline as a cheap first pass when a compact receipt is too sparse; treat it as triage, not complete evidence.",
			],
			parameters: OUTLINE_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const baseAccess = await accessForTool(params, context, resolveAccess);
				const sourceId = sourceIdParam(params);
				const access = await grantExactSourceAccess(
					baseAccess,
					grants,
					"outline",
					[sourceId],
				);
				const headLines = boundedIntegerParam(params, "headLines", 5, 0, 20);
				const tailLines = boundedIntegerParam(params, "tailLines", 5, 0, 20);
				const keywordLimit = boundedIntegerParam(
					params,
					"keywordLimit",
					8,
					0,
					20,
				);
				const source = await store.readSource(sourceId, access);
				const outline = formatSourceOutline(
					source,
					headLines,
					tailLines,
					keywordLimit,
				);
				const capped = capProtectedToolOutput(
					outline.text,
					`outline capped; use tool_result_search sourceId:"${sourceId}" query:"..." followed by bounded tool_result_get windows`,
				);
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
			name: "tool_result_get",
			label: "Tool Result Get",
			description:
				"Retrieve a bounded, byte-capped line window from a locally stored large tool result.",
			promptSnippet:
				"Retrieve exact bounded line windows from compact tool-result receipts",
			promptGuidelines: [
				"Use tool_result_get when a tool-result receipt has a sourceId and relevant local lines are needed; request consecutive bounded windows when one response is capped.",
			],
			parameters: GET_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const baseAccess = await accessForTool(params, context, resolveAccess);
				const sourceId = sourceIdParam(params);
				const access = await grantExactSourceAccess(baseAccess, grants, "get", [
					sourceId,
				]);
				const lineOptions: { lineStart?: number; lineLimit?: number } = {};
				const lineStart = optionalNumberParam(params, "lineStart");
				const lineLimit = optionalNumberParam(params, "lineLimit");
				if (lineStart !== undefined) lineOptions.lineStart = lineStart;
				if (lineLimit !== undefined) lineOptions.lineLimit = lineLimit;
				const window = await store.getLineWindow(sourceId, lineOptions, access);
				const capped = capProtectedToolOutput(
					formatLineWindow(
						sourceId,
						window.startLine,
						window.endLine,
						window.text,
					),
					`selected range exceeds the response cap; retry with smaller consecutive tool_result_get windows starting at line ${window.startLine}`,
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
			description:
				"Search one or more locally stored tool results and return byte-capped cited line matches with small context windows.",
			promptSnippet:
				"Search compactly indexed local tool-result sources by substring",
			promptGuidelines: [
				"Use tool_result_search with sourceId or a small sourceIds set for focused evidence; add lineStart/lineLimit when only a bounded range matters.",
			],
			parameters: SEARCH_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const baseAccess = await accessForTool(params, context, resolveAccess);
				const query = stringParam(params, "query");
				const sourceId = optionalSourceIdParam(params);
				const sourceIds = optionalSourceIdsParam(params);
				if (sourceId !== undefined && sourceIds !== undefined)
					throw new Error("sourceId and sourceIds may not both be provided");
				const access = await grantExactSourceAccess(
					baseAccess,
					grants,
					"search",
					sourceId === undefined ? (sourceIds ?? []) : [sourceId],
				);
				const searchOptions: SearchOptions = { access };
				const lineStart = optionalNumberParam(params, "lineStart");
				const lineLimit = optionalNumberParam(params, "lineLimit");
				const limit = optionalNumberParam(params, "limit");
				const contextLines = optionalNumberParam(params, "contextLines");
				if (sourceId !== undefined) searchOptions.sourceId = sourceId;
				if (sourceIds !== undefined) searchOptions.sourceIds = sourceIds;
				if (lineStart !== undefined) searchOptions.lineStart = lineStart;
				if (lineLimit !== undefined) searchOptions.lineLimit = lineLimit;
				if (limit !== undefined) searchOptions.limit = limit;
				if (contextLines !== undefined)
					searchOptions.contextLines = contextLines;
				const matches = await store.search(query, searchOptions);
				const formatted = formatSearchMatches(matches);
				const broadNoMatchGuidance =
					sourceId === undefined &&
					sourceIds === undefined &&
					matches.length === 0
						? "\n\nGuidance: this was a broad search across stored sources. Use sourceId from a receipt when possible, or run tool_result_list / tool_result_diagnostics to choose a source before retrying."
						: "";
				const firstMatch = matches[0];
				const notice =
					firstMatch === undefined
						? "rerun with a narrower query or sourceId-restricted search if needed"
						: `rerun with smaller limit/contextLines, then use bounded tool_result_get windows for sourceId:"${firstMatch.sourceId}" around line ${firstMatch.contextStartLine}`;
				const capped = capProtectedToolOutput(
					`${formatted.text}${broadNoMatchGuidance}`,
					notice,
				);
				return {
					content: [{ type: "text", text: capped.text }],
					details: {
						...queryDetails(query),
						...(sourceId === undefined ? {} : { sourceId }),
						...(sourceIds === undefined ? {} : { sourceIds }),
						...(lineStart === undefined ? {} : { lineStart }),
						...(lineLimit === undefined ? {} : { lineLimit }),
						matchCount: matches.length,
						outputTruncated:
							formatted.contextTruncated || capped.outputTruncated,
						totalBytes: capped.totalBytes,
						returnedBytes: capped.returnedBytes,
						outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
						...reasonDetails(params),
					},
				};
			},
		},

		...(delegation
			? [
					{
						name: "tool_result_delegate",
						label: "Tool Result Delegate",
						description:
							"Preflight or explicitly start one bounded asynchronous analyst run for an exact stored source. Dry-run defaults to true.",
						promptSnippet:
							"Preflight cited delegated analysis for one exact tool-result source, then set dryRun:false only when the run is explicitly authorized",
						promptGuidelines: [
							"Call tool_result_delegate with dryRun omitted or true first. Set dryRun:false only to explicitly authorize the bounded asynchronous analyst run.",
						],
						parameters: DELEGATE_PARAMS,
						async execute(
							_toolCallId: string,
							params: unknown,
							signal: AbortSignal | undefined,
							_onUpdate: Parameters<ToolDefinitionLike["execute"]>[3],
							context: ToolExecutionContextLike,
						) {
							if (optionalSourceIdsParam(params) !== undefined)
								throw new Error(
									"Invalid delegation source: use one sourceId, not sourceIds",
								);
							const task = stringParam(params, "task").trim();
							if (task.length === 0)
								throw new Error("Invalid task: expected non-blank text");
							if (task.length > 2_000)
								throw new Error(
									"Invalid task: expected at most 2000 characters",
								);
							return delegation.delegate(
								{
									sourceId: sourceIdParam(params),
									task,
									dryRun: optionalBooleanParam(params, "dryRun") ?? true,
								},
								context,
								signal,
							);
						},
					},
				]
			: []),

		{
			name: "tool_result_list",
			label: "Tool Result List",
			description:
				"List recent locally stored tool-result sources with source ids and compact metadata.",
			parameters: LIST_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const access = await accessForTool(params, context, resolveAccess);
				const sources = await store.listSources(
					boundedIntegerParam(params, "limit", 20, 1, 100),
					access,
				);
				const text =
					sources.length === 0
						? "No stored tool-result sources."
						: sources
								.map(
									(source) =>
										`${source.sourceId} ${source.toolName} ${source.captureStatus} ${source.storageKind} ${source.byteCount} bytes ${source.lineCount} lines sha256:${source.sha256.slice(0, 12)}`,
								)
								.join("\n");
				const capped = capProtectedToolOutput(
					text,
					"rerun tool_result_list with a smaller limit",
				);
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
			description:
				"Show compact local store health metadata for virtualized tool results without raw source content.",
			parameters: DIAGNOSTICS_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const access = await accessForTool(params, context, resolveAccess);
				const report = await store.diagnoseConsistency(
					boundedIntegerParam(params, "limit", 5, 1, 100),
					access,
				);
				const capped = capProtectedToolOutput(
					formatDiagnostics(report),
					"rerun tool_result_diagnostics with a smaller limit",
				);
				return {
					content: [{ type: "text", text: capped.text }],
					details: {
						scope: report.scope,
						healthy: report.healthy,
						sourceCount: report.validSourceCount,
						indexLineCount: report.indexLineCount,
						invalidIndexLineCount: report.invalidIndexLineCount,
						ftsStatus: report.ftsStatus,
						ftsMismatchCount: report.ftsMismatchCount,
						scopeKeyUnavailable: report.scopeKeyUnavailable,
						footprint: report.footprint,
						quota: report.quota,
						issues: report.issues,
						recentSourceIds: report.recentSources.map(
							(source) => source.sourceId,
						),
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
			description:
				"Preview non-destructive retention cleanup candidates for stored tool-result sources without deleting files or returning raw source text.",
			parameters: RETENTION_PREVIEW_PARAMS,
			async execute(_toolCallId, params, _signal, _onUpdate, context) {
				const access = await accessForTool(params, context, resolveAccess);
				const previewOptions: { maxSources?: number; maxAgeHours?: number } =
					{};
				const maxSources = optionalNumberParam(params, "maxSources");
				const maxAgeHours = optionalNumberParam(params, "maxAgeHours");
				const limit = boundedIntegerParam(params, "limit", 20, 1, 100);
				if (maxSources !== undefined) previewOptions.maxSources = maxSources;
				if (maxAgeHours !== undefined) previewOptions.maxAgeHours = maxAgeHours;
				const preview = await store.previewRetention(previewOptions, access);
				const visibleCandidates = preview.candidates.slice(0, limit);
				const visibleKeptSourceIds = preview.keptSourceIds.slice(0, limit);
				const capped = capProtectedToolOutput(
					formatRetentionPreview(preview, limit),
					"rerun tool_result_retention_preview with a smaller limit or narrower maxSources/maxAgeHours",
				);
				return {
					content: [{ type: "text", text: capped.text }],
					details: {
						sourceCount: preview.sourceCount,
						keptCount: preview.keptCount,
						candidateCount: preview.candidateCount,
						candidateBytes: preview.candidateBytes,
						candidateDetailsBytes: preview.candidateDetailsBytes,
						candidateStoredBytes: preview.candidateStoredBytes,
						candidateLines: preview.candidateLines,
						selectors: preview.selectors,
						candidateSourceIds: visibleCandidates.map(
							(candidate) => candidate.sourceId,
						),
						omittedCandidateCount: Math.max(
							0,
							preview.candidates.length - visibleCandidates.length,
						),
						keptSourceIds: visibleKeptSourceIds,
						omittedKeptSourceCount: Math.max(
							0,
							preview.keptSourceIds.length - visibleKeptSourceIds.length,
						),
						outputTruncated: capped.outputTruncated,
						totalBytes: capped.totalBytes,
						returnedBytes: capped.returnedBytes,
						outputByteLimit: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
						...reasonDetails(params),
					},
				};
			},
		},
	];
}
