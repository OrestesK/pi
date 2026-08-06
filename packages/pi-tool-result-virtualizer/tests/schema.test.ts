import assert from "node:assert/strict";
import test from "node:test";

import {
	DELEGATE_PARAMS,
	DIAGNOSTICS_PARAMS,
	GET_PARAMS,
	LIST_PARAMS,
	OUTLINE_PARAMS,
	RETENTION_PREVIEW_PARAMS,
	SEARCH_PARAMS,
} from "../src/schemas.ts";
import type { JsonSchema } from "../src/extension-types.ts";

const schemas: Record<string, JsonSchema> = {
	tool_result_outline: OUTLINE_PARAMS,
	tool_result_get: GET_PARAMS,
	tool_result_search: SEARCH_PARAMS,
	tool_result_delegate: DELEGATE_PARAMS,
	tool_result_list: LIST_PARAMS,
	tool_result_diagnostics: DIAGNOSTICS_PARAMS,
	tool_result_retention_preview: RETENTION_PREVIEW_PARAMS,
};

function descriptions(
	value: unknown,
	path = "",
	result: Record<string, string> = {},
): Record<string, string> {
	if (Array.isArray(value)) {
		value.forEach((item, index) => descriptions(item, `${path}[${index}]`, result));
		return result;
	}
	if (value === null || typeof value !== "object") return result;
	for (const [key, child] of Object.entries(value)) {
		const childPath = path === "" ? key : `${path}.${key}`;
		if (key === "description") {
			assert.equal(typeof child, "string");
			result[path] = child as string;
		} else descriptions(child, childPath, result);
	}
	return result;
}

test("tool-result parameter descriptions stay compact and explicit", () => {
	assert.deepEqual(
		Object.fromEntries(
			Object.entries(schemas).map(([name, schema]) => [
				name,
				descriptions(schema),
			]),
		),
		{
			tool_result_outline: {
				"properties.sourceId": "Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes",
				"properties.headLines": "Head sample lines (default 5)",
				"properties.tailLines": "Tail sample lines (default 5)",
				"properties.keywordLimit": "Broad keyword hits (default 8)",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
			tool_result_get: {
				"properties.sourceId": "Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes",
				"properties.lineStart": "First line to retrieve (1-indexed)",
				"properties.lineLimit": "Lines to retrieve (max 500); output is byte-capped, so use consecutive windows.",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
			tool_result_search: {
				"properties.includeGlobal": "Include every project scope; parent-only; default false.",
				"properties.includeLegacy": "Include legacy sources without verified project provenance; parent-only; default false.",
				"properties.query": "Non-blank, case-insensitive substring",
				"properties.sourceId": "Optional Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes",
				"properties.sourceIds.items": "Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes",
				"properties.sourceIds": "Ordered source IDs; mutually exclusive with sourceId",
				"properties.lineStart": "First line per source (1-indexed)",
				"properties.lineLimit": "Lines to search per source",
				"properties.limit": "Matches to return (default 10); output is byte-capped.",
				"properties.contextLines": "Neighbor lines per match",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
			tool_result_delegate: {
				"properties.sourceId": "Receipt source ID: tr_[a-z0-9_]+, at most 128 bytes",
				"properties.task": "Analysis objective; return cited findings, uncertainty, risks, and access/completion status.",
			},
			tool_result_list: {
				"properties.includeGlobal": "Include every project scope; parent-only; default false.",
				"properties.includeLegacy": "Include legacy sources without verified project provenance; parent-only; default false.",
				"properties.limit": "Recent sources to list",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
			tool_result_diagnostics: {
				"properties.includeGlobal": "Include every project scope; parent-only; default false.",
				"properties.includeLegacy": "Include legacy sources without verified project provenance; parent-only; default false.",
				"properties.limit": "Recent sources to summarize",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
			tool_result_retention_preview: {
				"properties.includeGlobal": "Include every project scope; parent-only; default false.",
				"properties.includeLegacy": "Include legacy sources without verified project provenance; parent-only; default false.",
				"properties.maxSources": "Candidates older than the newest maxSources sources",
				"properties.maxAgeHours": "Candidates older than this many hours",
				"properties.limit": "Candidate and kept source IDs to show (default 20)",
				"properties.reason": "Optional purpose for session search; byte-capped in details.",
			},
		},
	);

	assert.equal(Buffer.byteLength(JSON.stringify(schemas)), 4_736);
});
