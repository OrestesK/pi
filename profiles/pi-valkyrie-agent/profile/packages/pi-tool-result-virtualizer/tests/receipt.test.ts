import assert from "node:assert/strict";
import test from "node:test";

import {
	createReceiptDecisionCard,
	parseToolResultVirtualizerReceipt,
	type ReceiptDecisionCard,
} from "../src/receipt.ts";

const storedReceipt = [
	"[tool-result-virtualizer] Large read result stored locally",
	"Source: tr_mock",
	"Capture: event.content; size: 50.0 KiB, 1800 lines; sha256: abc",
	"Preview only — not complete evidence. Do not make claims about hidden content from this receipt alone.",
	"",
	"## Cropped preview",
	"Preview only — not complete evidence. Search, then get cited lines before claiming hidden content.",
	"Sampled 30 of 1800 lines; omitted 1770 hidden lines.",
	"### Head lines 1-10",
	"1: head 1",
	"10: head 10",
	"[omitted 885 lines between samples]",
	"### Middle lines 896-905",
	"896: middle 896",
	"905: middle 905",
	"[omitted 885 lines between samples]",
	"### Tail lines 1791-1800",
	"1791: tail 1791",
	"1800: tail 1800",
	"",
	"## Retrieve before relying on hidden content",
	"999: retrieval guidance must not appear in preview",
].join("\n");

const decisionCard: ReceiptDecisionCard = {
	version: 1,
	resultRef: {
		sourceId: "tr_mock",
		scope: { kind: "legacy" },
		availability: "available",
		contentKind: "text",
		captureStatus: "event.content",
		completeness: "possibly_truncated",
		byteCount: 51_200,
		lineCount: 1_800,
		sha256: "abc",
	},
	citations: {
		contract: "source_line_range",
		fields: ["sourceId", "startLine", "endLine"],
	},
	actions: [
		{
			intent: "unknown_shape",
			toolName: "tool_result_outline",
			args: { sourceId: "tr_mock" },
		},
		{
			intent: "exact_range",
			toolName: "tool_result_get",
			args: { sourceId: "tr_mock", lineStart: 1, lineLimit: 80 },
		},
	],
};

const storedReceiptWithDecisionCard = `${storedReceipt}\n\n## Decision card\nDecision card: ${JSON.stringify(decisionCard)}`;

const failureReceipt = [
	"[tool-result-virtualizer] Large grep result failed before local storage completed",
	"Original content withheld: 50.0 KiB, 1800 lines",
	"No source id was created. Retry the original tool call after fixing the local tool-result virtualizer store.",
].join("\n");

test("parses stored virtualizer receipts into UI-safe preview lines", () => {
	const parsed = parseToolResultVirtualizerReceipt(storedReceipt);

	assert.equal(parsed?.kind, "stored");
	assert.equal(parsed.toolName, "read");
	assert.equal(parsed.sourceId, "tr_mock");
	assert.equal(parsed.captureStatus, "event.content");
	assert.equal(parsed.lineCount, 1800);
	assert.equal(parsed.decisionCard, undefined);
	assert.deepEqual(parsed.previewLines, [
		"Sampled 30 of 1800 lines; omitted 1770 hidden lines.",
		"Head lines 1-10",
		"1: head 1",
		"10: head 10",
		"[omitted 885 lines between samples]",
		"Middle lines 896-905",
		"896: middle 896",
		"905: middle 905",
		"[omitted 885 lines between samples]",
		"Tail lines 1791-1800",
		"1791: tail 1791",
		"1800: tail 1800",
	]);
});

test("parses the typed receipt decision card with executable retrieval actions", () => {
	const parsed = parseToolResultVirtualizerReceipt(
		storedReceiptWithDecisionCard,
	);

	assert.equal(parsed?.kind, "stored");
	assert.deepEqual(parsed.decisionCard, decisionCard);
});

test("parses a capability-valid single-source delegation action", () => {
	const delegated = createReceiptDecisionCard(decisionCard.resultRef, true);
	const receipt = `${storedReceipt}\n\nDecision card: ${JSON.stringify(delegated)}`;
	const parsed = parseToolResultVirtualizerReceipt(receipt);

	assert.equal(parsed?.kind, "stored");
	assert.deepEqual(parsed.decisionCard, delegated);
	assert.deepEqual(
		delegated.actions.find((action) => action.intent === "delegate_analysis"),
		{
			intent: "delegate_analysis",
			toolName: "tool_result_delegate",
			args: {
				sourceId: "tr_mock",
				task: "Identify the decisive findings in this source with line citations; state uncertainty and residual risks.",
			},
		},
	);
});

test("ignores malformed decision cards while preserving the stored receipt", () => {
	const delegated = createReceiptDecisionCard(decisionCard.resultRef, true);
	const delegateAction = delegated.actions.find(
		(action) => action.intent === "delegate_analysis",
	);
	assert.ok(delegateAction);
	const invalidSourceId = "tr_invalid-source";
	const malformedCards: unknown[] = [
		{ ...decisionCard, actions: [] },
		{
			...decisionCard,
			actions: decisionCard.actions.map((action) =>
				action.intent === "unknown_shape"
					? { ...action, unexpected: true }
					: action,
			),
		},
		{
			...decisionCard,
			actions: decisionCard.actions.map((action) =>
				action.intent === "unknown_shape"
					? { ...action, args: { ...action.args, unexpected: true } }
					: action,
			),
		},
		{
			...decisionCard,
			actions: decisionCard.actions.map((action) =>
				action.intent === "exact_range"
					? { ...action, args: { ...action.args, unexpected: true } }
					: action,
			),
		},
		{
			...decisionCard,
			resultRef: { ...decisionCard.resultRef, sourceId: invalidSourceId },
			actions: decisionCard.actions.map((action) => ({
				...action,
				args: { ...action.args, sourceId: invalidSourceId },
			})),
		},
		{
			...decisionCard,
			actions: decisionCard.actions.map((action) =>
				action.intent === "exact_range"
					? { ...action, args: { ...action.args, lineLimit: 501 } }
					: action,
			),
		},
		{
			...delegated,
			actions: delegated.actions.map((action) =>
				action.intent === "delegate_analysis"
					? { ...action, args: { ...action.args, dryRun: false } }
					: action,
			),
		},
		{
			...delegated,
			actions: delegated.actions.map((action) =>
				action.intent === "delegate_analysis"
					? { ...action, args: { ...action.args, sourceIds: ["tr_mock"] } }
					: action,
			),
		},
		{
			...delegated,
			resultRef: { ...delegated.resultRef, availability: "missing" },
		},
	];

	for (const malformedCard of malformedCards) {
		const receipt = `${storedReceipt}\n\nDecision card: ${JSON.stringify(malformedCard)}`;
		const parsed = parseToolResultVirtualizerReceipt(receipt);
		assert.equal(parsed?.kind, "stored");
		assert.equal(parsed.decisionCard, undefined);
	}
});

test("parses virtualizer storage-failure receipts without fabricating a source id", () => {
	const parsed = parseToolResultVirtualizerReceipt(failureReceipt);

	assert.equal(parsed?.kind, "failure");
	assert.equal(parsed.toolName, "grep");
	assert.equal(parsed.lineCount, 1800);
	assert.equal(parsed.byteCountText, "50.0 KiB");
	assert.deepEqual(parsed.failureLines, [
		"Original content withheld: 50.0 KiB, 1800 lines",
		"No source id was created. Retry the original tool call after fixing the local tool-result virtualizer store.",
	]);
});

test("ignores ordinary output that only contains the virtualizer marker", () => {
	assert.equal(
		parseToolResultVirtualizerReceipt(
			"[tool-result-virtualizer] mentioned in docs",
		),
		undefined,
	);
});
