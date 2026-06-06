type JsonObject = Record<string, unknown>;

function asRecord(value: unknown): JsonObject | undefined {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: undefined;
}

function stringField(
	record: JsonObject | undefined,
	key: string,
): string | undefined {
	const value = record?.[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(
	record: JsonObject | undefined,
	key: string,
): number | undefined {
	const value = record?.[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function booleanField(
	record: JsonObject | undefined,
	key: string,
): boolean | undefined {
	const value = record?.[key];
	return typeof value === "boolean" ? value : undefined;
}

function byteLength(value: unknown): number | undefined {
	if (typeof value === "string") return Buffer.byteLength(value, "utf-8");
	return undefined;
}

function definedFields(fields: JsonObject): JsonObject {
	return Object.fromEntries(
		Object.entries(fields).filter(([, value]) => value !== undefined),
	);
}

function compactUsage(message: JsonObject | undefined): JsonObject | undefined {
	const usage = asRecord(message?.usage);
	if (!usage) return undefined;
	const input =
		numberField(usage, "input") ?? numberField(usage, "inputTokens");
	const output =
		numberField(usage, "output") ?? numberField(usage, "outputTokens");
	const cacheRead = numberField(usage, "cacheRead");
	const cacheWrite = numberField(usage, "cacheWrite");
	const cost = asRecord(usage.cost);
	const totalCost = numberField(cost, "total");
	const compact = definedFields({
		input,
		output,
		cacheRead,
		cacheWrite,
		costTotal: totalCost,
	});
	return Object.keys(compact).length > 0 ? compact : undefined;
}

function compactMessageEvent(event: JsonObject, childType: string): JsonObject {
	const message = asRecord(event.message);
	const usage = compactUsage(message);
	return definedFields({
		type: "subagent.child.event",
		childType,
		messageRole: stringField(message, "role"),
		stopReason: stringField(message, "stopReason"),
		hasError: stringField(message, "errorMessage") ? true : undefined,
		usage,
	});
}

function compactMessageUpdate(event: JsonObject): JsonObject {
	const assistantEvent = asRecord(event.assistantMessageEvent);
	const message = asRecord(event.message);
	return definedFields({
		type: "subagent.child.event",
		childType: "message_update",
		assistantEventType: stringField(assistantEvent, "type"),
		contentIndex: numberField(assistantEvent, "contentIndex"),
		deltaBytes: byteLength(assistantEvent?.delta),
		messageRole: stringField(message, "role"),
	});
}

function compactToolEvent(event: JsonObject, childType: string): JsonObject {
	return definedFields({
		type: "subagent.child.event",
		childType,
		toolName: stringField(event, "toolName"),
		isError: booleanField(event, "isError"),
	});
}

function compactStreamEvent(
	event: JsonObject,
	stream: "stdout" | "stderr",
): JsonObject {
	return definedFields({
		type: "subagent.child.stream",
		stream,
		lineBytes: byteLength(event.line),
	});
}

export function compactChildEventForAsyncLog(event: JsonObject): JsonObject {
	const childType = stringField(event, "type") ?? "unknown";
	if (childType === "subagent.child.stdout")
		return compactStreamEvent(event, "stdout");
	if (childType === "subagent.child.stderr")
		return compactStreamEvent(event, "stderr");
	if (childType === "message_update") return compactMessageUpdate(event);
	if (
		childType === "message_start" ||
		childType === "message_end" ||
		childType === "tool_result_end"
	) {
		return compactMessageEvent(event, childType);
	}
	if (
		childType === "tool_execution_start" ||
		childType === "tool_execution_update" ||
		childType === "tool_execution_end"
	) {
		return compactToolEvent(event, childType);
	}
	return {
		type: "subagent.child.event",
		childType,
	};
}
