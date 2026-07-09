import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { TextContent } from "./extension-types.ts";
import { formatSourcePreview } from "./outline.ts";
import { exportRecoveryDescription, exportRecoveryLabel } from "./recovery.ts";
import { type CaptureStatus, type StoredSource, ToolResultStore } from "./store.ts";

export type ToolResultEventLike = {
	toolName?: unknown;
	toolCallId?: unknown;
	input?: unknown;
	content?: unknown;
	details?: unknown;
	isError?: unknown;
};

export type VirtualizeOptions = {
	cwd: string;
	advertisedSkillPaths: ReadonlySet<string>;
};

export type ToolResultPatch = {
	content: TextContent[];
	details: Record<string, unknown>;
};

const CONTENT_BYTE_THRESHOLD = 50_000;
const CONTENT_LINE_THRESHOLD = 200;
const DETAILS_BYTE_THRESHOLD = 2 * 1024;
const DETAILS_SCALAR_BYTE_LIMIT = 256;
const CONTEXT_MODE_MCP_TOOL_PREFIX = "context_mode_ctx_";
const VIRTUALIZER_METADATA_NAME = "pi-tool-result-virtualizer";
const VIRTUALIZER_METADATA_VERSION = 1;
const PROTECTED_TOOL_NAMES = new Set(["subagent"]);
const PROTECTED_TOOL_PREFIXES = ["tool_result_", "ctx_", "context_"];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contentBlocks(content: unknown): unknown[] {
	return Array.isArray(content) ? content : [];
}

function textBlocksFromContent(content: unknown): string[] {
	return contentBlocks(content).flatMap((item): string[] => {
		if (!isRecord(item)) return [];
		return item.type === "text" && typeof item.text === "string" ? [item.text] : [];
	});
}

function textFromContent(content: unknown): string {
	return textBlocksFromContent(content).join("\n");
}

function visibleContent(originalContent: unknown, text: string, replaceText: boolean): TextContent[] {
	const blocks = contentBlocks(originalContent);
	if (!replaceText) return blocks as TextContent[];
	const replaced: unknown[] = [];
	let insertedText = false;
	for (const block of blocks) {
		if (isRecord(block) && block.type === "text" && typeof block.text === "string") {
			if (!insertedText) {
				replaced.push({ type: "text", text });
				insertedText = true;
			}
			continue;
		}
		replaced.push(block);
	}
	if (!insertedText) replaced.push({ type: "text", text });
	return replaced as TextContent[];
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf8");
}

function compactDetailString(text: string): string {
	const bytes = byteLength(text);
	if (bytes <= DETAILS_SCALAR_BYTE_LIMIT) return text;
	return `[stored original detail: ${bytes} bytes]`;
}

function lineCount(text: string): number {
	if (text.length === 0) return 0;
	const matches = text.match(/[^\n]*(?:\n|$)/g) ?? [];
	if (matches.at(-1) === "") matches.pop();
	return matches.length;
}

function stringField(record: Record<string, unknown>, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(record: Record<string, unknown>, key: string): number | undefined {
	const value = record[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function detailsRecord(details: unknown): Record<string, unknown> | undefined {
	return isRecord(details) ? details : undefined;
}

function truncationRecord(details: unknown): Record<string, unknown> | undefined {
	const detailsObject = detailsRecord(details);
	if (!detailsObject) return undefined;
	const truncation = detailsObject.truncation;
	return isRecord(truncation) ? truncation : undefined;
}

function hasVirtualizerMetadata(details: unknown): boolean {
	const detailsObject = detailsRecord(details);
	const metadata = detailsObject?.toolResultVirtualizer;
	return isRecord(metadata)
		&& metadata.virtualizer === VIRTUALIZER_METADATA_NAME
		&& metadata.version === VIRTUALIZER_METADATA_VERSION
		&& typeof metadata.sourceId === "string";
}

function isContextModeMcpInput(input: unknown): boolean {
	if (!isRecord(input)) return false;
	return input.server === "context-mode"
		|| (typeof input.tool === "string" && input.tool.startsWith(CONTEXT_MODE_MCP_TOOL_PREFIX))
		|| (typeof input.describe === "string" && input.describe.startsWith(CONTEXT_MODE_MCP_TOOL_PREFIX));
}

function resolvePiReadPath(path: string, cwd: string): string {
	let normalized = path.replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, " ");
	if (normalized.startsWith("@")) normalized = normalized.slice(1);
	if (normalized === "~") normalized = homedir();
	else if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))) {
		normalized = join(homedir(), normalized.slice(2));
	}
	if (normalized.startsWith("file://")) normalized = fileURLToPath(normalized);
	return resolve(cwd, normalized);
}

async function isAdvertisedSkillRead(
	toolName: string,
	input: unknown,
	cwd: string,
	advertisedSkillPaths: ReadonlySet<string>,
): Promise<boolean> {
	if (toolName !== "read" || !isRecord(input)) return false;
	const path = stringField(input, "path");
	if (path === undefined) return false;
	try {
		return advertisedSkillPaths.has(await realpath(resolvePiReadPath(path, cwd)));
	} catch {
		return false;
	}
}

function isProtectedToolName(toolName: string): boolean {
	return PROTECTED_TOOL_NAMES.has(toolName) || PROTECTED_TOOL_PREFIXES.some((prefix) => toolName.startsWith(prefix));
}

function isProtectedToolResult(event: ToolResultEventLike, toolName: string): boolean {
	return isProtectedToolName(toolName) || (toolName === "mcp" && isContextModeMcpInput(event.input));
}

function truncationContentBytes(details: unknown): number {
	const truncation = truncationRecord(details);
	const content = truncation?.content;
	return typeof content === "string" ? byteLength(content) : 0;
}

function isTruncated(details: unknown): boolean {
	return truncationRecord(details)?.truncated === true;
}

function serializedDetails(details: unknown): string | undefined {
	if (details === undefined) return undefined;
	try {
		return JSON.stringify(details);
	} catch {
		return undefined;
	}
}

function compactScalarDetails(originalDetails: unknown): Record<string, unknown> {
	const original = detailsRecord(originalDetails);
	if (!original) return {};
	const compact: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(original)) {
		if (value === null || typeof value === "number" || typeof value === "boolean") compact[key] = value;
		else if (typeof value === "string") compact[key] = compactDetailString(value);
	}
	return compact;
}

function compactInputSummary(toolName: string, input: unknown): string | undefined {
	if (!isRecord(input)) return undefined;
	if (toolName === "bash") {
		const command = stringField(input, "command");
		return command === undefined ? undefined : `bash command (${command.length} chars)`;
	}
	if (toolName === "read") {
		const path = stringField(input, "path");
		if (path === undefined) return undefined;
		const offset = numberField(input, "offset");
		const limit = numberField(input, "limit");
		const range = offset === undefined && limit === undefined ? "" : ` offset=${offset ?? 1} limit=${limit ?? "all"}`;
		return `read ${path}${range}`;
	}
	return `${toolName} input keys: ${Object.keys(input).sort().join(",")}`;
}

function selectReadRange(text: string, input: Record<string, unknown>): string {
	const offset = Math.max(1, Math.floor(numberField(input, "offset") ?? 1));
	const limit = numberField(input, "limit");
	const lines = text.match(/[^\n]*(?:\n|$)/g) ?? [];
	if (lines.at(-1) === "") lines.pop();
	const startIndex = Math.min(offset - 1, lines.length);
	const selected = limit === undefined ? lines.slice(startIndex) : lines.slice(startIndex, startIndex + Math.max(0, Math.floor(limit)));
	return selected.join("");
}

async function captureText(
	event: ToolResultEventLike,
	toolName: string,
	eventText: string,
	options: VirtualizeOptions,
): Promise<{ text: string; captureStatus: CaptureStatus; originalPath?: string; originalFullOutputPath?: string }> {
	const details = detailsRecord(event.details);
	const input = isRecord(event.input) ? event.input : undefined;
	const fullOutputPath = details ? stringField(details, "fullOutputPath") : undefined;
	if (toolName === "bash" && fullOutputPath !== undefined) {
		try {
			return {
				text: await readFile(fullOutputPath, "utf8"),
				captureStatus: "details.fullOutputPath",
				originalFullOutputPath: fullOutputPath,
			};
		} catch {
			return { text: eventText, captureStatus: "event.content" };
		}
	}
	const inputPath = input ? stringField(input, "path") : undefined;
	if (toolName === "read" && input !== undefined && inputPath !== undefined) {
		const originalPath = resolve(options.cwd, inputPath);
		try {
			return {
				text: selectReadRange(await readFile(originalPath, "utf8"), input),
				captureStatus: "read.input.path",
				originalPath,
			};
		} catch {
			return { text: eventText, captureStatus: "event.content" };
		}
	}
	return { text: eventText, captureStatus: "event.content" };
}

async function shouldVirtualize(event: ToolResultEventLike, toolName: string, eventText: string, options: VirtualizeOptions): Promise<boolean> {
	if (isProtectedToolResult(event, toolName)) return false;
	const exceedsThreshold = byteLength(eventText) >= CONTENT_BYTE_THRESHOLD
		|| lineCount(eventText) >= CONTENT_LINE_THRESHOLD
		|| truncationContentBytes(event.details) >= CONTENT_BYTE_THRESHOLD;
	if (!exceedsThreshold) {
		if (!isTruncated(event.details)) return false;
		const details = detailsRecord(event.details);
		const input = isRecord(event.input) ? event.input : undefined;
		const hasRecoverableTruncation = (toolName === "bash" && details?.fullOutputPath !== undefined)
			|| (toolName === "read" && input?.path !== undefined);
		if (!hasRecoverableTruncation) return false;
	}
	return !(await isAdvertisedSkillRead(toolName, event.input, options.cwd, options.advertisedSkillPaths));
}

function compactVisibleDetails(originalDetails: unknown, contentStored: boolean, scalarOnly: boolean): Record<string, unknown> {
	const compact = scalarOnly
		? compactScalarDetails(originalDetails)
		: detailsRecord(originalDetails) ? { ...detailsRecord(originalDetails) } : {};
	const truncation = truncationRecord(originalDetails);
	if (truncation) {
		const compactTruncation: Record<string, unknown> = { ...truncation };
		delete compactTruncation.content;
		compactTruncation.contentStoredInToolResultVirtualizer = contentStored;
		compact.truncation = compactTruncation;
	}
	return compact;
}

function compactDetails(originalDetails: unknown, stored: StoredSource, visibleContentBytes: number, contentReplaced: boolean): Record<string, unknown> {
	const compact = compactVisibleDetails(originalDetails, true, stored.originalDetailsPath !== undefined);
	const virtualizerMetadata: Record<string, unknown> = {
		virtualizer: VIRTUALIZER_METADATA_NAME,
		version: VIRTUALIZER_METADATA_VERSION,
		sourceId: stored.sourceId,
		toolName: stored.toolName,
		captureStatus: stored.captureStatus,
		storageKind: stored.storageKind,
		byteCount: stored.byteCount,
		lineCount: stored.lineCount,
		sha256: stored.sha256,
		contentReplaced,
	};
	if (contentReplaced) virtualizerMetadata.receiptBytes = visibleContentBytes;
	else virtualizerMetadata.visibleContentBytes = visibleContentBytes;
	if (stored.originalDetailsPath !== undefined) {
		virtualizerMetadata.hasOriginalDetails = true;
		virtualizerMetadata.originalDetailsByteCount = stored.originalDetailsByteCount;
		virtualizerMetadata.originalDetailsSha256 = stored.originalDetailsSha256;
	}
	compact.toolResultVirtualizer = virtualizerMetadata;
	return compact;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function buildFailureReceipt(toolName: string, eventText: string): string {
	return [
		`[tool-result-virtualizer] Large ${toolName} result failed before local storage completed`,
		`Original content withheld: ${formatBytes(byteLength(eventText))}, ${lineCount(eventText)} lines`,
		"No source id was created. Retry the original tool call after fixing the local tool-result virtualizer store.",
	].join("\n");
}

function buildFailureDetails(originalDetails: unknown, toolName: string, eventText: string, visibleContentBytes: number): Record<string, unknown> {
	const details = compactVisibleDetails(originalDetails, false, true);
	details.toolResultVirtualizerFailure = {
		toolName,
		byteCount: byteLength(eventText),
		lineCount: lineCount(eventText),
		contentWithheld: true,
		receiptBytes: visibleContentBytes,
	};
	return details;
}

function buildReceipt(stored: StoredSource, sourceText: string): string {
	const preview = formatSourcePreview(sourceText, {
		headLineCount: 10,
		middleLineCount: 10,
		tailLineCount: 10,
		lineByteLimit: 160,
	});
	return [
		`[tool-result-virtualizer] Large ${stored.toolName} result stored locally`,
		`Source: ${stored.sourceId}`,
		`Capture: ${stored.captureStatus}; size: ${formatBytes(stored.byteCount)}, ${stored.lineCount} lines; sha256: ${stored.sha256.slice(0, 12)}`,
		"Preview only — not complete evidence. Do not make claims about hidden content from this receipt alone.",
		"",
		preview.text,
		"",
		"## Retrieve before relying on hidden content",
		`1. Search: tool_result_search query:"..." sourceId:"${stored.sourceId}"`,
		`2. Get cited lines: tool_result_get sourceId:"${stored.sourceId}" lineStart:1 lineLimit:80`,
		`Optional deterministic triage: tool_result_outline sourceId:"${stored.sourceId}".`,
		`Optional delegated synthesis: tool_result_summary_contract sourceId:"${stored.sourceId}" prompt:"<focused question>"; run the returned subagent task.`,
		`${exportRecoveryLabel(stored)}: ${exportRecoveryDescription(stored)}. Use only for exact stored text; do not paste it back inline unless unavoidable.`,
	].join("\n");
}

export async function virtualizeToolResult(
	event: ToolResultEventLike,
	store: ToolResultStore,
	options: VirtualizeOptions,
): Promise<ToolResultPatch | undefined> {
	const toolName = typeof event.toolName === "string" ? event.toolName : "tool";
	if (textBlocksFromContent(event.content).length === 0) return undefined;
	const eventText = textFromContent(event.content);
	if (isProtectedToolResult(event, toolName) || hasVirtualizerMetadata(event.details)) return undefined;
	const shouldReplaceContent = await shouldVirtualize(event, toolName, eventText, options);
	const originalDetailsText = serializedDetails(event.details);
	const originalDetailsBytes = originalDetailsText === undefined ? 0 : byteLength(originalDetailsText);
	const shouldStoreOriginalDetails = originalDetailsText !== undefined && (originalDetailsBytes >= DETAILS_BYTE_THRESHOLD || truncationContentBytes(event.details) >= DETAILS_BYTE_THRESHOLD);
	if (!shouldReplaceContent && !shouldStoreOriginalDetails) return undefined;
	const capture = await captureText(event, toolName, eventText, options);
	const sourceInput: {
		toolName: string;
		text: string;
		captureStatus: typeof capture.captureStatus;
		storageKind: "content" | "details";
		toolCallId?: string;
		inputSummary?: string;
		originalPath?: string;
		originalFullOutputPath?: string;
		originalDetailsText?: string;
	} = {
		toolName,
		text: capture.text,
		captureStatus: capture.captureStatus,
		storageKind: shouldReplaceContent ? "content" : "details",
	};
	if (typeof event.toolCallId === "string") sourceInput.toolCallId = event.toolCallId;
	const inputSummary = compactInputSummary(toolName, event.input);
	if (inputSummary !== undefined) sourceInput.inputSummary = inputSummary;
	if (capture.originalPath !== undefined) sourceInput.originalPath = capture.originalPath;
	if (capture.originalFullOutputPath !== undefined) sourceInput.originalFullOutputPath = capture.originalFullOutputPath;
	if (shouldStoreOriginalDetails) sourceInput.originalDetailsText = originalDetailsText;
	try {
		const stored = await store.storeSource(sourceInput);
		const receipt = buildReceipt(stored, capture.text);
		const visibleText = shouldReplaceContent ? receipt : eventText;
		return {
			content: visibleContent(event.content, visibleText, shouldReplaceContent),
			details: compactDetails(event.details, stored, byteLength(visibleText), shouldReplaceContent),
		};
	} catch {
		if (!shouldReplaceContent && !shouldStoreOriginalDetails) return undefined;
		const visibleText = shouldReplaceContent ? buildFailureReceipt(toolName, capture.text) : eventText;
		return {
			content: visibleContent(event.content, visibleText, shouldReplaceContent),
			details: buildFailureDetails(event.details, toolName, capture.text, byteLength(visibleText)),
		};
	}
}
