import { isValidSourceId } from "./params.ts";
import type { ResultRef } from "./result-ref.ts";

type UnknownShapeAction = {
	intent: "unknown_shape";
	toolName: "tool_result_outline";
	args: { sourceId: string };
};

type ExactRangeAction = {
	intent: "exact_range";
	toolName: "tool_result_get";
	args: { sourceId: string; lineStart: number; lineLimit: number };
};

type DelegateAnalysisAction = {
	intent: "delegate_analysis";
	toolName: "tool_result_delegate";
	args: { sourceId: string; task: string };
};

export type ReceiptAction =
	| UnknownShapeAction
	| ExactRangeAction
	| DelegateAnalysisAction;

export type ReceiptDecisionCard = {
	version: 1;
	resultRef: ResultRef;
	citations: {
		contract: "source_line_range";
		fields: ["sourceId", "startLine", "endLine"];
	};
	actions:
		| [UnknownShapeAction, ExactRangeAction]
		| [UnknownShapeAction, ExactRangeAction, DelegateAnalysisAction];
};

export type ParsedToolResultVirtualizerReceipt =
	| {
			kind: "stored";
			toolName: string;
			sourceId: string;
			captureStatus?: string;
			lineCount?: number;
			previewLines: string[];
			decisionCard?: ReceiptDecisionCard;
	  }
	| {
			kind: "failure";
			toolName: string;
			byteCountText?: string;
			lineCount?: number;
			failureLines: string[];
	  };

const RECEIPT_PREFIX = "[tool-result-virtualizer]";
const DECISION_CARD_PREFIX = "Decision card: ";
const STORED_HEADER =
	/^\[tool-result-virtualizer\] Large (.+) result stored locally$/;
const FAILURE_HEADER =
	/^\[tool-result-virtualizer\] Large (.+) result failed before local storage completed$/;
const CAPTURE_LINE = /^Capture: ([^;]+); size: .+?, ([\d,]+) lines; sha256: /;
const WITHHELD_LINE = /^Original content withheld: (.+), ([\d,]+) lines$/;

export function createReceiptDecisionCard(
	resultRef: ResultRef,
	delegationAvailable = false,
): ReceiptDecisionCard {
	const baseActions: [UnknownShapeAction, ExactRangeAction] = [
		{
			intent: "unknown_shape",
			toolName: "tool_result_outline",
			args: { sourceId: resultRef.sourceId },
		},
		{
			intent: "exact_range",
			toolName: "tool_result_get",
			args: {
				sourceId: resultRef.sourceId,
				lineStart: 1,
				lineLimit: 80,
			},
		},
	];
	const actions: ReceiptDecisionCard["actions"] =
		delegationAvailable && resultRef.availability === "available"
			? [
					...baseActions,
					{
						intent: "delegate_analysis",
						toolName: "tool_result_delegate",
						args: {
							sourceId: resultRef.sourceId,
							task: "Identify the decisive findings in this source with line citations; state uncertainty and residual risks.",
						},
					},
				]
			: baseActions;
	return {
		version: 1,
		resultRef,
		citations: {
			contract: "source_line_range",
			fields: ["sourceId", "startLine", "endLine"],
		},
		actions,
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonNegativeNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isResultRef(value: unknown): value is ResultRef {
	if (!isRecord(value) || !isRecord(value.scope)) return false;
	const scopeKind = value.scope.kind;
	if (scopeKind === "project") {
		if (typeof value.scope.projectId !== "string") return false;
		if (
			value.scope.sessionId !== undefined &&
			typeof value.scope.sessionId !== "string"
		)
			return false;
	} else if (scopeKind === "unscoped") {
		if (
			value.scope.reason !== undefined &&
			value.scope.reason !== "cwd_unavailable" &&
			value.scope.reason !== "scope_key_unavailable"
		)
			return false;
	} else if (scopeKind !== "legacy") return false;
	return (
		typeof value.sourceId === "string" &&
		isValidSourceId(value.sourceId) &&
		["available", "missing", "failed", "unverified"].includes(
			String(value.availability),
		) &&
		["text", "json", "jsonl", "csv", "log", "diff", "unknown"].includes(
			String(value.contentKind),
		) &&
		["details.fullOutputPath", "read.input.path", "event.content"].includes(
			String(value.captureStatus),
		) &&
		["exact_capture", "possibly_truncated", "unknown"].includes(
			String(value.completeness),
		) &&
		isNonNegativeNumber(value.byteCount) &&
		isNonNegativeNumber(value.lineCount) &&
		typeof value.sha256 === "string"
	);
}

function isReceiptAction(
	value: unknown,
	sourceId: string,
): value is ReceiptAction {
	if (
		!isRecord(value) ||
		Object.keys(value).sort().join(",") !== "args,intent,toolName" ||
		!isRecord(value.args)
	)
		return false;
	if (value.args.sourceId !== sourceId) return false;
	const argumentKeys = Object.keys(value.args).sort().join(",");
	if (
		value.intent === "unknown_shape" &&
		value.toolName === "tool_result_outline"
	)
		return argumentKeys === "sourceId";
	if (
		value.intent === "delegate_analysis" &&
		value.toolName === "tool_result_delegate"
	)
		return (
			argumentKeys === "sourceId,task" &&
			typeof value.args.task === "string" &&
			value.args.task.trim().length > 0 &&
			value.args.task.length <= 2_000
		);
	if (value.intent !== "exact_range" || value.toolName !== "tool_result_get")
		return false;
	return (
		argumentKeys === "lineLimit,lineStart,sourceId" &&
		isNonNegativeNumber(value.args.lineStart) &&
		value.args.lineStart >= 1 &&
		isNonNegativeNumber(value.args.lineLimit) &&
		value.args.lineLimit >= 1 &&
		value.args.lineLimit <= 500
	);
}

function isReceiptDecisionCard(value: unknown): value is ReceiptDecisionCard {
	if (!isRecord(value) || value.version !== 1) return false;
	const resultRef = value.resultRef;
	const citations = value.citations;
	const actions = value.actions;
	if (
		!isResultRef(resultRef) ||
		!isRecord(citations) ||
		citations.contract !== "source_line_range" ||
		!Array.isArray(citations.fields) ||
		citations.fields.join(",") !== "sourceId,startLine,endLine" ||
		!Array.isArray(actions) ||
		(actions.length !== 2 && actions.length !== 3)
	)
		return false;
	return (
		isReceiptAction(actions[0], resultRef.sourceId) &&
		actions[0].intent === "unknown_shape" &&
		isReceiptAction(actions[1], resultRef.sourceId) &&
		actions[1].intent === "exact_range" &&
		(actions.length === 2 ||
			(resultRef.availability === "available" &&
				isReceiptAction(actions[2], resultRef.sourceId) &&
				actions[2].intent === "delegate_analysis"))
	);
}

function parseDecisionCard(lines: string[]): ReceiptDecisionCard | undefined {
	const line = lines.find((candidate) =>
		candidate.startsWith(DECISION_CARD_PREFIX),
	);
	if (line === undefined) return undefined;
	try {
		const parsed: unknown = JSON.parse(line.slice(DECISION_CARD_PREFIX.length));
		return isReceiptDecisionCard(parsed) ? parsed : undefined;
	} catch {
		return undefined;
	}
}

function parseLineCount(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseStoredReceipt(
	lines: string[],
): ParsedToolResultVirtualizerReceipt | undefined {
	const header = lines[0]?.match(STORED_HEADER);
	if (!header) return undefined;
	const source = lines
		.find((line) => line.startsWith("Source: "))
		?.slice("Source: ".length)
		.trim();
	if (!source) return undefined;
	const capture = lines
		.find((line) => line.startsWith("Capture: "))
		?.match(CAPTURE_LINE);
	const previewLines: string[] = [];
	let inCroppedPreview = false;

	for (const line of lines) {
		if (line === "## Cropped preview") {
			inCroppedPreview = true;
			continue;
		}
		if (inCroppedPreview && line.startsWith("## ")) break;
		if (!inCroppedPreview) continue;
		if (line.length === 0 || line.startsWith("Preview only")) continue;
		if (line.startsWith("Sampled ") || line.startsWith("[omitted ")) {
			previewLines.push(line);
			continue;
		}
		if (line.startsWith("### ")) {
			previewLines.push(line.slice(4));
			continue;
		}
		if (/^\d+:\s?/.test(line)) previewLines.push(line);
	}

	const result: Extract<
		ParsedToolResultVirtualizerReceipt,
		{ kind: "stored" }
	> = {
		kind: "stored",
		toolName: header[1] ?? "tool",
		sourceId: source,
		previewLines,
	};
	if (capture?.[1] !== undefined) result.captureStatus = capture[1];
	const lineCount = parseLineCount(capture?.[2]);
	if (lineCount !== undefined) result.lineCount = lineCount;
	const decisionCard = parseDecisionCard(lines);
	if (decisionCard !== undefined) result.decisionCard = decisionCard;
	return result;
}

function parseFailureReceipt(
	lines: string[],
): ParsedToolResultVirtualizerReceipt | undefined {
	const header = lines[0]?.match(FAILURE_HEADER);
	if (!header) return undefined;
	const withheld = lines.find((line) =>
		line.startsWith("Original content withheld: "),
	);
	const noSource = lines.find((line) =>
		line.startsWith("No source id was created."),
	);
	if (!withheld || !noSource) return undefined;
	const withheldMatch = withheld.match(WITHHELD_LINE);

	const result: Extract<
		ParsedToolResultVirtualizerReceipt,
		{ kind: "failure" }
	> = {
		kind: "failure",
		toolName: header[1] ?? "tool",
		failureLines: [withheld, noSource],
	};
	if (withheldMatch?.[1] !== undefined) result.byteCountText = withheldMatch[1];
	const lineCount = parseLineCount(withheldMatch?.[2]);
	if (lineCount !== undefined) result.lineCount = lineCount;
	return result;
}

export function parseToolResultVirtualizerReceipt(
	text: string,
): ParsedToolResultVirtualizerReceipt | undefined {
	if (!text.startsWith(RECEIPT_PREFIX)) return undefined;
	const lines = text.split(/\r?\n/);
	return parseStoredReceipt(lines) ?? parseFailureReceipt(lines);
}
