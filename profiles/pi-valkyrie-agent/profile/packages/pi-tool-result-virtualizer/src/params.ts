import { byteLength, byteSafePrefix } from "./formatting.ts";

const DETAIL_STRING_BYTE_LIMIT = 512;
const TOOL_REASON_BYTE_LIMIT = DETAIL_STRING_BYTE_LIMIT;
const SOURCE_ID_BYTE_LIMIT = 128;
const SOURCE_ID_PATTERN = /^tr_[a-z0-9_]+$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringParam(params: unknown, key: string): string {
	if (!isRecord(params) || typeof params[key] !== "string")
		throw new Error(`Missing string parameter: ${key}`);
	return params[key];
}

export function optionalStringParam(
	params: unknown,
	key: string,
): string | undefined {
	return isRecord(params) && typeof params[key] === "string"
		? params[key]
		: undefined;
}

export function optionalNumberParam(
	params: unknown,
	key: string,
): number | undefined {
	return isRecord(params) &&
		typeof params[key] === "number" &&
		Number.isFinite(params[key])
		? params[key]
		: undefined;
}

export function boundedIntegerParam(
	params: unknown,
	key: string,
	fallback: number,
	min: number,
	max: number,
): number {
	const value = optionalNumberParam(params, key);
	if (value === undefined) return fallback;
	return Math.max(min, Math.min(Math.floor(value), max));
}

export function optionalBooleanParam(
	params: unknown,
	key: string,
): boolean | undefined {
	return isRecord(params) && typeof params[key] === "boolean"
		? params[key]
		: undefined;
}

export function isValidSourceId(sourceId: string): boolean {
	return (
		byteLength(sourceId) <= SOURCE_ID_BYTE_LIMIT &&
		SOURCE_ID_PATTERN.test(sourceId)
	);
}

export function validateSourceId(sourceId: string): string {
	if (!isValidSourceId(sourceId)) {
		throw new Error(
			`Invalid sourceId: expected ${SOURCE_ID_PATTERN.source} at most ${SOURCE_ID_BYTE_LIMIT} bytes`,
		);
	}
	return sourceId;
}

export function sourceIdParam(params: unknown): string {
	return validateSourceId(stringParam(params, "sourceId"));
}

export function optionalSourceIdParam(params: unknown): string | undefined {
	const sourceId = optionalStringParam(params, "sourceId");
	return sourceId === undefined ? undefined : validateSourceId(sourceId);
}

export function optionalSourceIdsParam(params: unknown): string[] | undefined {
	if (!isRecord(params) || params.sourceIds === undefined) return undefined;
	if (!Array.isArray(params.sourceIds))
		throw new Error("Invalid sourceIds: expected an array of source ids");
	if (params.sourceIds.length === 0)
		throw new Error("Invalid sourceIds: expected at least one source id");
	if (params.sourceIds.length > 10)
		throw new Error("Invalid sourceIds: expected at most 10 source ids");
	const sourceIds = params.sourceIds.map((sourceId) => {
		if (typeof sourceId !== "string")
			throw new Error("Invalid sourceIds: expected string source ids");
		return validateSourceId(sourceId);
	});
	if (new Set(sourceIds).size !== sourceIds.length)
		throw new Error("Invalid sourceIds: expected unique source ids");
	return sourceIds;
}

export function reasonDetails(params: unknown): {
	reason?: string;
	reasonTruncated?: boolean;
	reasonByteLimit?: number;
} {
	const reason = optionalStringParam(params, "reason")?.trim();
	if (reason === undefined || reason.length === 0) return {};
	const capped = byteSafePrefix(reason, TOOL_REASON_BYTE_LIMIT);
	if (byteLength(reason) <= TOOL_REASON_BYTE_LIMIT) return { reason: capped };
	return {
		reason: capped,
		reasonTruncated: true,
		reasonByteLimit: TOOL_REASON_BYTE_LIMIT,
	};
}

export function queryDetails(query: string): {
	query: string;
	queryTruncated?: boolean;
	queryByteLimit?: number;
} {
	const capped = byteSafePrefix(query, DETAIL_STRING_BYTE_LIMIT);
	if (byteLength(query) <= DETAIL_STRING_BYTE_LIMIT) return { query: capped };
	return {
		query: capped,
		queryTruncated: true,
		queryByteLimit: DETAIL_STRING_BYTE_LIMIT,
	};
}
