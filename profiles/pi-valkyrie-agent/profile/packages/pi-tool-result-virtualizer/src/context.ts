import { byteLength } from "./formatting.ts";

export type ProviderContextCompactionResult = {
	messages: unknown[];
	compactedToolCallArgumentCount: number;
	originalArgumentBytes: number;
	returnedArgumentBytes: number;
};

const TOOL_CALL_ARGUMENT_BYTE_LIMIT = 512;
const PROTECTED_TOOL_PREFIX = "tool_result_";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cappedArgumentPlaceholder(key: string, originalBytes: number): string {
	return `[tool-result-virtualizer] ${key} capped in provider context; original ${originalBytes} bytes remains in session/tool execution history`;
}

function compactArguments(argumentsValue: unknown): {
	arguments: unknown;
	changed: boolean;
	compactedCount: number;
	originalBytes: number;
	returnedBytes: number;
} {
	if (!isRecord(argumentsValue)) {
		return { arguments: argumentsValue, changed: false, compactedCount: 0, originalBytes: 0, returnedBytes: 0 };
	}
	let changed = false;
	let compactedCount = 0;
	let originalBytes = 0;
	let returnedBytes = 0;
	const compacted: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(argumentsValue)) {
		if (typeof value !== "string") {
			compacted[key] = value;
			continue;
		}
		const valueBytes = byteLength(value);
		if (valueBytes <= TOOL_CALL_ARGUMENT_BYTE_LIMIT) {
			compacted[key] = value;
			continue;
		}
		const placeholder = cappedArgumentPlaceholder(key, valueBytes);
		compacted[key] = placeholder;
		changed = true;
		compactedCount += 1;
		originalBytes += valueBytes;
		returnedBytes += byteLength(placeholder);
	}
	return { arguments: changed ? compacted : argumentsValue, changed, compactedCount, originalBytes, returnedBytes };
}

function compactToolCallBlock(block: unknown): {
	block: unknown;
	changed: boolean;
	compactedCount: number;
	originalBytes: number;
	returnedBytes: number;
} {
	if (!isRecord(block) || block.type !== "toolCall" || typeof block.name !== "string" || !block.name.startsWith(PROTECTED_TOOL_PREFIX)) {
		return { block, changed: false, compactedCount: 0, originalBytes: 0, returnedBytes: 0 };
	}
	const compacted = compactArguments(block.arguments);
	if (!compacted.changed) {
		return { block, changed: false, compactedCount: 0, originalBytes: 0, returnedBytes: 0 };
	}
	return {
		block: { ...block, arguments: compacted.arguments },
		changed: true,
		compactedCount: compacted.compactedCount,
		originalBytes: compacted.originalBytes,
		returnedBytes: compacted.returnedBytes,
	};
}

function compactMessage(message: unknown): {
	message: unknown;
	changed: boolean;
	compactedCount: number;
	originalBytes: number;
	returnedBytes: number;
} {
	if (!isRecord(message) || message.role !== "assistant" || !Array.isArray(message.content)) {
		return { message, changed: false, compactedCount: 0, originalBytes: 0, returnedBytes: 0 };
	}
	let changed = false;
	let compactedCount = 0;
	let originalBytes = 0;
	let returnedBytes = 0;
	const content = message.content.map((block) => {
		const compacted = compactToolCallBlock(block);
		if (!compacted.changed) return block;
		changed = true;
		compactedCount += compacted.compactedCount;
		originalBytes += compacted.originalBytes;
		returnedBytes += compacted.returnedBytes;
		return compacted.block;
	});
	if (!changed) {
		return { message, changed: false, compactedCount: 0, originalBytes: 0, returnedBytes: 0 };
	}
	return {
		message: { ...message, content },
		changed: true,
		compactedCount,
		originalBytes,
		returnedBytes,
	};
}

export function compactProviderContextMessages(messages: unknown[]): ProviderContextCompactionResult {
	let compactedToolCallArgumentCount = 0;
	let originalArgumentBytes = 0;
	let returnedArgumentBytes = 0;
	const compactedMessages = messages.map((message) => {
		const compacted = compactMessage(message);
		if (!compacted.changed) return message;
		compactedToolCallArgumentCount += compacted.compactedCount;
		originalArgumentBytes += compacted.originalBytes;
		returnedArgumentBytes += compacted.returnedBytes;
		return compacted.message;
	});
	return {
		messages: compactedMessages,
		compactedToolCallArgumentCount,
		originalArgumentBytes,
		returnedArgumentBytes,
	};
}
