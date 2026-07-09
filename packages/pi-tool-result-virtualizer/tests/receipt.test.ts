import assert from "node:assert/strict";
import test from "node:test";

import { parseToolResultVirtualizerReceipt } from "../src/receipt.ts";

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
	assert.equal(parseToolResultVirtualizerReceipt("[tool-result-virtualizer] mentioned in docs"), undefined);
});
