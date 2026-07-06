import type { JsonSchema } from "./extension-types.ts";

const SOURCE_ID_DESCRIPTION = "Tool-result source id from a compact receipt: tr_[a-z0-9_]+ under 128 bytes";
const FILE_PATH_DESCRIPTION = "Optional relative output path under 1024 bytes inside the managed export directory; absolute paths, parent traversal, and NUL bytes are rejected. Defaults to a generated file under the managed export directory.";

export const REASON_PARAM: JsonSchema = {
	type: "string",
	description: "Optional concise reason for this search/retrieval/diagnostic so future session searches can find why it was run. Stored byte-capped in details.",
};

export const SUMMARY_CONTRACT_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId", "prompt"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		prompt: { type: "string", minLength: 1, description: "Focused question or decision the summary subagent should answer" },
		reason: REASON_PARAM,
	},
};

export const GET_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		lineStart: { type: "number", minimum: 1, description: "1-indexed first line to retrieve" },
		lineLimit: { type: "number", minimum: 1, maximum: 500, description: "Number of lines to retrieve, max 500. Model-visible output is also byte-capped; use tool_result_export for exact oversized ranges." },
		reason: REASON_PARAM,
	},
};

export const OUTLINE_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		headLines: { type: "number", minimum: 0, maximum: 20, description: "Head sample lines to include, default 5" },
		tailLines: { type: "number", minimum: 0, maximum: 20, description: "Tail sample lines to include, default 5" },
		keywordLimit: { type: "number", minimum: 0, maximum: 20, description: "Maximum broad keyword hits to include, default 8" },
		reason: REASON_PARAM,
	},
};

export const SEARCH_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["query"],
	properties: {
		query: { type: "string", minLength: 1, description: "Non-blank case-insensitive substring to search for" },
		sourceId: { type: "string", description: `Optional ${SOURCE_ID_DESCRIPTION}` },
		limit: { type: "number", minimum: 1, maximum: 50, description: "Maximum matches, default 10. Model-visible output is byte-capped; use tool_result_export for exact oversized ranges." },
		contextLines: { type: "number", minimum: 0, maximum: 5, description: "Neighbor lines around each match" },
		reason: REASON_PARAM,
	},
};

export const LIST_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		limit: { type: "number", minimum: 1, maximum: 100, description: "Maximum recent stored sources to list" },
		reason: REASON_PARAM,
	},
};

export const DIAGNOSTICS_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		limit: { type: "number", minimum: 1, maximum: 100, description: "Maximum recent stored sources to summarize" },
		reason: REASON_PARAM,
	},
};

export const RETENTION_PREVIEW_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		maxSources: { type: "number", minimum: 0, description: "Preview sources older than the newest maxSources sources" },
		maxAgeHours: { type: "number", minimum: 0, description: "Preview sources older than this age in hours" },
		limit: { type: "number", minimum: 1, maximum: 100, description: "Maximum candidate and kept source ids to show in output/details, default 20" },
		reason: REASON_PARAM,
	},
};

export const EXPORT_DETAILS_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: `${SOURCE_ID_DESCRIPTION} with stored original details` },
		filePath: { type: "string", description: FILE_PATH_DESCRIPTION },
		overwrite: { type: "boolean", description: "Allow overwriting filePath when it already exists; exports fail by default if filePath already exists" },
		reason: REASON_PARAM,
	},
};

export const EXPORT_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		lineStart: { type: "number", minimum: 1, description: "Optional 1-indexed first line to export" },
		lineLimit: { type: "number", minimum: 1, maximum: 500, description: "Optional line count to export, max 500 for line-window exports" },
		filePath: { type: "string", description: FILE_PATH_DESCRIPTION },
		overwrite: { type: "boolean", description: "Allow overwriting filePath when it already exists; exports fail by default if filePath already exists" },
		reason: REASON_PARAM,
	},
};
