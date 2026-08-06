import type { JsonSchema } from "./extension-types.ts";

const SOURCE_ID_DESCRIPTION =
	"Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes";
export const REASON_PARAM: JsonSchema = {
	type: "string",
	description: "Optional purpose for session search; byte-capped in details.",
};

const DISCOVERY_SCOPE_PROPERTIES: Record<string, JsonSchema> = {
	includeGlobal: {
		type: "boolean",
		description: "Include every project scope; parent-only; default false.",
	},
	includeLegacy: {
		type: "boolean",
		description:
			"Include legacy sources without verified project provenance; parent-only; default false.",
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
			description: "First line to retrieve (1-indexed)",
		},
		lineLimit: {
			type: "number",
			minimum: 1,
			maximum: 500,
			description:
				"Lines to retrieve (max 500); output is byte-capped, so use consecutive windows.",
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
			description: "Head sample lines (default 5)",
		},
		tailLines: {
			type: "number",
			minimum: 0,
			maximum: 20,
			description: "Tail sample lines (default 5)",
		},
		keywordLimit: {
			type: "number",
			minimum: 0,
			maximum: 20,
			description: "Broad keyword hits (default 8)",
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
			description: "Non-blank, case-insensitive substring",
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
				"Ordered source IDs; mutually exclusive with sourceId",
		},
		lineStart: {
			type: "number",
			minimum: 1,
			description: "First line per source (1-indexed)",
		},
		lineLimit: {
			type: "number",
			minimum: 1,
			maximum: 500,
			description: "Lines to search per source",
		},
		limit: {
			type: "number",
			minimum: 1,
			maximum: 50,
			description:
				"Matches to return (default 10); output is byte-capped.",
		},
		contextLines: {
			type: "number",
			minimum: 0,
			maximum: 5,
			description: "Neighbor lines per match",
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
			description: "Recent sources to list",
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
			description: "Recent sources to summarize",
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
				"Analysis objective; return cited findings, uncertainty, risks, and access/completion status.",
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
			description: "Candidates older than the newest maxSources sources",
		},
		maxAgeHours: {
			type: "number",
			minimum: 0,
			description: "Candidates older than this many hours",
		},
		limit: {
			type: "number",
			minimum: 1,
			maximum: 100,
			description:
				"Candidate and kept source IDs to show (default 20)",
		},
		reason: REASON_PARAM,
	},
};
