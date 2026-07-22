import type { JsonSchema } from "./extension-types.ts";

const SOURCE_ID_DESCRIPTION =
	"Tool-result source id from a compact receipt: tr_[a-z0-9_]+ at most 128 bytes";
export const REASON_PARAM: JsonSchema = {
	type: "string",
	description:
		"Optional concise reason for this search/retrieval/diagnostic so future session searches can find why it was run. Stored byte-capped in details.",
};

const DISCOVERY_SCOPE_PROPERTIES: Record<string, JsonSchema> = {
	includeGlobal: {
		type: "boolean",
		description:
			"Include sources from every project scope. Parent-only; defaults to false.",
	},
	includeLegacy: {
		type: "boolean",
		description:
			"Include legacy sources without verified project provenance. Parent-only; defaults to false.",
	},
};

export const GET_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		lineStart: {
			type: "number",
			minimum: 1,
			description: "1-indexed first line to retrieve",
		},
		lineLimit: {
			type: "number",
			minimum: 1,
			maximum: 500,
			description:
				"Number of lines to retrieve, max 500. Model-visible output is byte-capped; request consecutive windows when needed.",
		},
		reason: REASON_PARAM,
	},
};

export const OUTLINE_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		headLines: {
			type: "number",
			minimum: 0,
			maximum: 20,
			description: "Head sample lines to include, default 5",
		},
		tailLines: {
			type: "number",
			minimum: 0,
			maximum: 20,
			description: "Tail sample lines to include, default 5",
		},
		keywordLimit: {
			type: "number",
			minimum: 0,
			maximum: 20,
			description: "Maximum broad keyword hits to include, default 8",
		},
		reason: REASON_PARAM,
	},
};

export const SEARCH_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["query"],
	allOf: [{ not: { required: ["sourceId", "sourceIds"] } }],
	properties: {
		...DISCOVERY_SCOPE_PROPERTIES,
		query: {
			type: "string",
			minLength: 1,
			description: "Non-blank case-insensitive substring to search for",
		},
		sourceId: {
			type: "string",
			description: `Optional ${SOURCE_ID_DESCRIPTION}`,
		},
		sourceIds: {
			type: "array",
			minItems: 1,
			maxItems: 10,
			uniqueItems: true,
			items: { type: "string", description: SOURCE_ID_DESCRIPTION },
			description:
				"Optional explicit source ids to search in order; cannot be combined with sourceId",
		},
		lineStart: {
			type: "number",
			minimum: 1,
			description: "Optional 1-indexed first line to search in each source",
		},
		lineLimit: {
			type: "number",
			minimum: 1,
			maximum: 500,
			description: "Optional line count to search in each source",
		},
		limit: {
			type: "number",
			minimum: 1,
			maximum: 50,
			description:
				"Maximum matches, default 10. Model-visible output is byte-capped; narrow the query or retrieve cited windows when needed.",
		},
		contextLines: {
			type: "number",
			minimum: 0,
			maximum: 5,
			description: "Neighbor lines around each match",
		},
		reason: REASON_PARAM,
	},
};

export const LIST_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		...DISCOVERY_SCOPE_PROPERTIES,
		limit: {
			type: "number",
			minimum: 1,
			maximum: 100,
			description: "Maximum recent stored sources to list",
		},
		reason: REASON_PARAM,
	},
};

export const DIAGNOSTICS_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		...DISCOVERY_SCOPE_PROPERTIES,
		limit: {
			type: "number",
			minimum: 1,
			maximum: 100,
			description: "Maximum recent stored sources to summarize",
		},
		reason: REASON_PARAM,
	},
};

export const DELEGATE_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	required: ["sourceId", "task"],
	properties: {
		sourceId: { type: "string", description: SOURCE_ID_DESCRIPTION },
		task: {
			type: "string",
			minLength: 1,
			maxLength: 2_000,
			description:
				"Focused analysis objective. The analyst must return cited findings, uncertainty, residual risks, and access/completion status.",
		},
	},
};

export const RETENTION_PREVIEW_PARAMS: JsonSchema = {
	type: "object",
	additionalProperties: false,
	properties: {
		...DISCOVERY_SCOPE_PROPERTIES,
		maxSources: {
			type: "number",
			minimum: 0,
			description: "Preview sources older than the newest maxSources sources",
		},
		maxAgeHours: {
			type: "number",
			minimum: 0,
			description: "Preview sources older than this age in hours",
		},
		limit: {
			type: "number",
			minimum: 1,
			maximum: 100,
			description:
				"Maximum candidate and kept source ids to show in output/details, default 20",
		},
		reason: REASON_PARAM,
	},
};
