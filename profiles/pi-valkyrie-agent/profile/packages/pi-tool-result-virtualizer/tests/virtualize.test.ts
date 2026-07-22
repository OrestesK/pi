import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
	parseToolResultVirtualizerReceipt,
	type ReceiptDecisionCard,
} from "../src/receipt.ts";
import type { ResultRef } from "../src/result-ref.ts";
import { ToolResultStore } from "../src/store.ts";
import {
	virtualizeToolResult,
	type ToolResultEventLike,
} from "../src/virtualize.ts";
import { makeStore, markerLines } from "./test-helpers.ts";

test("bash virtualization captures details.fullOutputPath, strips truncation content, and keeps compact decision receipt", async () => {
	const { store, dir } = await makeStore();
	const fullOutputPath = join(dir, "bash-full.log");
	const raw = markerLines("BASH_FULL", 1800);
	await writeFile(fullOutputPath, raw, "utf8");

	const event: ToolResultEventLike = {
		toolName: "bash",
		toolCallId: "call_bash_1",
		input: { command: "produce large output" },
		content: [{ type: "text", text: raw.slice(60_000) }],
		details: {
			fullOutputPath,
			truncation: {
				content: raw.slice(0, 51_200),
				truncated: true,
				totalLines: 1801,
				totalBytes: Buffer.byteLength(raw),
				outputLines: 640,
				outputBytes: 51_200,
			},
		},
	};

	const projectId = "a".repeat(64);
	const result = await virtualizeToolResult(event, store, {
		cwd: dir,
		provenance: {
			scope: "project",
			projectId,
			classification: "unclassified-local",
		},
	});

	assert.ok(result);
	const receipt =
		result.content[0]?.type === "text" ? result.content[0].text : "";
	assert.match(receipt, /\[tool-result-virtualizer\]/);
	assert.match(receipt, /Preview only — not complete evidence/);
	assert.match(receipt, /Head lines 1-10/);
	assert.match(receipt, /Middle lines 896-905/);
	assert.match(receipt, /Tail lines 1791-1800/);
	assert.match(receipt, /BASH_FULL line 0000/);
	assert.match(receipt, /BASH_FULL line 0895/);
	assert.match(receipt, /BASH_FULL line 1799/);
	assert.doesNotMatch(receipt, /BASH_FULL line 0100/);
	const searchIndex = receipt.indexOf("tool_result_search");
	const getIndex = receipt.indexOf("tool_result_get");
	assert.ok(searchIndex >= 0);
	assert.ok(getIndex > searchIndex);
	assert.match(
		receipt,
		/Known fact: call tool_result_search with sourceId "tr_[^"]+" and your actual fact or phrase as query\./,
	);
	assert.doesNotMatch(receipt, /<known fact or phrase>/);
	assert.match(receipt, /1\. Unknown shape: tool_result_outline/);
	assert.match(
		receipt,
		/2\. Exact range: tool_result_get \{"sourceId":"tr_[^"]+","lineStart":1,"lineLimit":80\}/,
	);
	assert.match(receipt, /Captured-output retrieval/);
	assert.match(receipt, /multiple bounded calls/i);
	assert.doesNotMatch(receipt, /tool_result_export/);
	assert.ok(Buffer.byteLength(receipt, "utf8") < 8_500);
	const parsedReceipt = parseToolResultVirtualizerReceipt(receipt);
	assert.equal(parsedReceipt?.kind, "stored");
	const decisionCard = parsedReceipt.decisionCard;
	assert.ok(decisionCard);
	assert.equal(decisionCard.version, 1);
	assert.equal(decisionCard.resultRef.completeness, "exact_capture");
	assert.deepEqual(decisionCard.resultRef.scope, {
		kind: "project",
		projectId,
	});
	assert.deepEqual(decisionCard.citations, {
		contract: "source_line_range",
		fields: ["sourceId", "startLine", "endLine"],
	});
	assert.deepEqual(decisionCard.actions, [
		{
			intent: "unknown_shape",
			toolName: "tool_result_outline",
			args: { sourceId: parsedReceipt.sourceId },
		},
		{
			intent: "exact_range",
			toolName: "tool_result_get",
			args: {
				sourceId: parsedReceipt.sourceId,
				lineStart: 1,
				lineLimit: 80,
			},
		},
	]);

	const details = result.details as Record<string, unknown>;
	const truncation = details.truncation as Record<string, unknown>;
	assert.equal(truncation.content, undefined);
	assert.equal(truncation.truncated, true);
	assert.equal(details.fullOutputPath, undefined);
	assert.equal(JSON.stringify(details).includes(fullOutputPath), false);

	const metadata = details.toolResultVirtualizer as {
		sourceId: string;
		captureStatus: string;
		resultRef: ResultRef;
		citations: ReceiptDecisionCard["citations"];
		actions: ReceiptDecisionCard["actions"];
	};
	assert.equal(metadata.captureStatus, "details.fullOutputPath");
	assert.deepEqual(metadata.resultRef, decisionCard.resultRef);
	assert.deepEqual(metadata.citations, decisionCard.citations);
	assert.deepEqual(metadata.actions, decisionCard.actions);
	const stored = await store.readSource(metadata.sourceId);
	assert.equal(stored.text, raw);
	assert.equal(stored.metadata.toolCallId, "call_bash_1");
});

test("empty visible text still captures bash details.fullOutputPath", async () => {
	const { store, dir } = await makeStore();
	const fullOutputPath = join(dir, "empty-visible-full.log");
	const raw = markerLines("EMPTY_VISIBLE_FULL", 300);
	await writeFile(fullOutputPath, raw, "utf8");

	const result = await virtualizeToolResult(
		{
			toolName: "bash",
			toolCallId: "empty_visible_full_output",
			content: [{ type: "text", text: "" }],
			details: { fullOutputPath, truncation: { truncated: true } },
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		captureStatus: string;
	};
	assert.equal(metadata.captureStatus, "details.fullOutputPath");
	assert.equal((await store.readSource(metadata.sourceId)).text, raw);
});

test("receipt preview adds bounded byte windows for sparse sources", async () => {
	const { store, dir } = await makeStore();
	const fullOutputPath = join(dir, "sparse-full.log");
	const raw = `SPARSE_HEAD ${"🙂".repeat(20_000)} SPARSE_TAIL`;
	await writeFile(fullOutputPath, raw, "utf8");

	const result = await virtualizeToolResult(
		{
			toolName: "bash",
			toolCallId: "sparse_preview",
			content: [{ type: "text", text: "truncated" }],
			details: { fullOutputPath, truncation: { truncated: true } },
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const receipt = result.content[0]?.text ?? "";
	assert.match(receipt, /## Byte preview/);
	assert.match(receipt, /SPARSE_HEAD/);
	assert.match(receipt, /SPARSE_TAIL/);
	assert.match(receipt, /byte windows are orientation only/i);
	assert.doesNotMatch(receipt, /\uFFFD/);
	assert.ok(Buffer.byteLength(receipt, "utf8") < 8_500);
});

test("receipt preview merges overlapping samples and caps long preview lines", async () => {
	const { store, dir } = await makeStore();
	const fullOutputPath = join(dir, "small-full.log");
	const raw =
		[
			`SMALL_FULL ${"X".repeat(5_000)} END_OF_LONG_PREVIEW`,
			...Array.from(
				{ length: 11 },
				(_unused, index) =>
					`SMALL_FULL line ${String(index + 1).padStart(4, "0")}`,
			),
		].join("\n") + "\n";
	await writeFile(fullOutputPath, raw, "utf8");

	const result = await virtualizeToolResult(
		{
			toolName: "bash",
			toolCallId: "small_overlap",
			content: [{ type: "text", text: "truncated" }],
			details: { fullOutputPath, truncation: { truncated: true } },
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const receipt = result.content[0]?.text ?? "";
	assert.match(receipt, /Head\/middle\/tail lines 1-12/);
	assert.match(receipt, /SMALL_FULL/);
	assert.doesNotMatch(receipt, /END_OF_LONG_PREVIEW/);
	assert.equal(receipt.match(/SMALL_FULL line 0011/g)?.length, 1);
});

test("normal single-line outputs below the researched byte threshold are not virtualized", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "synthetic_medium_text",
			toolCallId: "below_researched_threshold",
			content: [{ type: "text", text: "M".repeat(30_000) }],
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("single-line outputs at the researched byte threshold are virtualized", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "synthetic_large_single_line",
			toolCallId: "at_researched_threshold",
			content: [{ type: "text", text: "L".repeat(50_000) }],
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	assert.match(
		result.content[0]?.text ?? "",
		/Large synthetic_large_single_line result stored locally/,
	);
	assert.equal((await store.listSources()).length, 1);
});

test("store failures suppress large raw output while preserving small pass-through", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-trv-store-failure-"));
	const badRoot = join(dir, "root-is-file");
	await writeFile(badRoot, "not a directory", "utf8");
	const store = new ToolResultStore(badRoot);
	const large = markerLines("STORE_FAILURE_SHOULD_NOT_LEAK", 300);

	const largeResult = await virtualizeToolResult(
		{
			toolName: "synthetic_large_text",
			toolCallId: "store_failure_large",
			content: [{ type: "text", text: large }],
			details: { truncation: { truncated: true, content: large } },
		},
		store,
		{ cwd: dir },
	);

	assert.ok(largeResult);
	const text = largeResult.content[0]?.text ?? "";
	assert.match(text, /failed before local storage completed/i);
	assert.match(text, /content withheld/i);
	assert.doesNotMatch(text, /STORE_FAILURE_SHOULD_NOT_LEAK/);
	const truncation = largeResult.details.truncation as Record<string, unknown>;
	assert.equal(truncation.content, undefined);
	assert.equal(truncation.contentStoredInToolResultVirtualizer, false);
	assert.ok(largeResult.details.toolResultVirtualizerFailure);

	const smallResult = await virtualizeToolResult(
		{
			toolName: "synthetic_small_text",
			toolCallId: "store_failure_small",
			content: [{ type: "text", text: "small" }],
		},
		store,
		{ cwd: dir },
	);
	assert.equal(smallResult, undefined);
});

test("all SKILL.md reads pass through without becoming retrieval receipts", async () => {
	const { store, dir } = await makeStore();
	const skillPath = join(dir, "docs", "SKILL.md");
	const raw = markerLines("UNADVERTISED_SKILL", 300);
	await mkdir(dirname(skillPath), { recursive: true });
	await writeFile(skillPath, raw, "utf8");

	const result = await virtualizeToolResult(
		{
			toolName: "read",
			toolCallId: "unadvertised_skill_read",
			input: { path: skillPath },
			content: [{ type: "text", text: raw }],
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("SKILL.md reads bypass details-only virtualization", async () => {
	const { store, dir } = await makeStore();
	const skillPath = join(dir, "SKILL.md");
	await writeFile(skillPath, "skill", "utf8");

	const result = await virtualizeToolResult(
		{
			toolName: "read",
			toolCallId: "skill_details",
			input: { path: skillPath },
			content: [{ type: "text", text: "small visible skill" }],
			details: { diagnostic: "D".repeat(3_000) },
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("non-read tools do not receive the SKILL.md bypass", async () => {
	const { store, dir } = await makeStore();
	const raw = markerLines("NON_READ_SKILL_INPUT", 300);

	const result = await virtualizeToolResult(
		{
			toolName: "bash",
			toolCallId: "non_read_skill_input",
			input: { path: join(dir, "SKILL.md") },
			content: [{ type: "text", text: raw }],
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	assert.equal((await store.listSources()).length, 1);
});

test("read virtualization snapshots the requested line range from input.path", async () => {
	const { store, dir } = await makeStore();
	const readPath = join(dir, "large-read.txt");
	const raw = markerLines("READ_FULL", 100);
	await writeFile(readPath, raw, "utf8");

	const event: ToolResultEventLike = {
		toolName: "read",
		toolCallId: "call_read_1",
		input: { path: readPath, offset: 10, limit: 5 },
		content: [{ type: "text", text: raw.slice(0, 20_000) }],
		details: {
			truncation: {
				content: raw.slice(0, 20_000),
				truncated: true,
			},
		},
	};

	const result = await virtualizeToolResult(event, store, { cwd: dir });

	assert.ok(result);
	const details = result.details as Record<string, unknown>;
	const metadata = details.toolResultVirtualizer as {
		sourceId: string;
		captureStatus: string;
		lineCount: number;
	};
	assert.equal(metadata.captureStatus, "read.input.path");
	assert.equal(metadata.lineCount, 5);
	const stored = await store.readSource(metadata.sourceId);
	assert.equal(
		stored.text,
		"READ_FULL line 0009\nREAD_FULL line 0010\nREAD_FULL line 0011\nREAD_FULL line 0012\nREAD_FULL line 0013\n",
	);
	const receipt = result.content[0]?.text ?? "";
	assert.match(receipt, /stored read-range retrieval/i);
	assert.doesNotMatch(receipt, /100% exact raw output/i);
});

test("degraded fallback captures are not described as exact full raw output", async () => {
	const { store, dir } = await makeStore();
	const visibleOnly = markerLines("VISIBLE_FALLBACK_CAPTURE", 300);
	const result = await virtualizeToolResult(
		{
			toolName: "bash",
			toolCallId: "missing_full_output_path",
			content: [{ type: "text", text: visibleOnly }],
			details: {
				fullOutputPath: join(dir, "missing-full-output.log"),
				truncation: { truncated: true },
			},
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		captureStatus: string;
		resultRef: ResultRef;
	};
	assert.equal(metadata.captureStatus, "event.content");
	assert.equal(metadata.resultRef.completeness, "possibly_truncated");
	assert.equal((await store.readSource(metadata.sourceId)).text, visibleOnly);
	const receipt = result.content[0]?.text ?? "";
	assert.match(receipt, /stored-content retrieval/i);
	assert.match(receipt, /may already reflect upstream truncation/i);
	assert.doesNotMatch(receipt, /100% exact raw output/i);
});

test("large normal outputs are virtualized even when they contain the receipt marker text", async () => {
	const { store, dir } = await makeStore();
	const raw = `[tool-result-virtualizer] literal user output\n${markerLines("MARKER_COLLISION", 300)}`;

	const result = await virtualizeToolResult(
		{
			toolName: "synthetic_large_text",
			toolCallId: "marker_collision",
			content: [{ type: "text", text: raw }],
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const receipt = result.content[0]?.text ?? "";
	assert.match(receipt, /Large synthetic_large_text result stored locally/);
	assert.match(receipt, /MARKER_COLLISION line 0000/);
	assert.doesNotMatch(receipt, /MARKER_COLLISION line 0100/);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		captureStatus: string;
	};
	assert.equal(metadata.captureStatus, "event.content");
	assert.equal((await store.readSource(metadata.sourceId)).text, raw);
});

test("already virtualized results are skipped only by validated virtualizer metadata", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "synthetic_large_text",
			toolCallId: "already_virtualized",
			content: [
				{
					type: "text",
					text: markerLines("SECOND_PASS_SHOULD_NOT_STORE", 300),
				},
			],
			details: {
				toolResultVirtualizer: {
					virtualizer: "pi-tool-result-virtualizer",
					version: 1,
					sourceId: "tr_existing_source",
				},
			},
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("untrusted toolResultVirtualizer-shaped metadata does not bypass large-result protection", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "synthetic_large_text",
			toolCallId: "untrusted_virtualizer_metadata",
			content: [
				{
					type: "text",
					text: markerLines("UNTRUSTED_METADATA_SHOULD_STORE", 300),
				},
			],
			details: { toolResultVirtualizer: { sourceId: "tr_collision" } },
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	assert.match(
		result.content[0]?.text ?? "",
		/Large synthetic_large_text result stored locally/,
	);
	assert.equal((await store.listSources()).length, 1);
});

test("non-text-only tool results are not stored", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "image_tool",
			toolCallId: "image_only",
			content: [{ type: "image", data: "base64-image-data" }],
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("non-text-only tool results with large details are not stored or replaced", async () => {
	const { store, dir } = await makeStore();
	const result = await virtualizeToolResult(
		{
			toolName: "image_tool",
			toolCallId: "image_only_large_details",
			content: [{ type: "image", data: "base64-image-data" }],
			details: {
				matches: Array.from({ length: 80 }, (_unused, index) => ({
					tool: `image_detail_${index}`,
				})),
			},
		},
		store,
		{ cwd: dir },
	);

	assert.equal(result, undefined);
	assert.deepEqual(await store.listSources(), []);
});

test("mixed tool results preserve non-text blocks while storing only text content", async () => {
	const { store, dir } = await makeStore();
	const text = markerLines("MIXED_TEXT_ONLY", 220);
	const result = await virtualizeToolResult(
		{
			toolName: "mixed_content_tool",
			toolCallId: "mixed_content",
			content: [
				{ type: "image", data: "base64-image-data" },
				{ type: "text", text },
			],
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const content = result.content as Array<Record<string, unknown>>;
	assert.equal(content.length, 2);
	assert.deepEqual(content[0], { type: "image", data: "base64-image-data" });
	assert.match(
		String(content[1]?.text ?? ""),
		/Large mixed_content_tool result stored locally/,
	);
	const metadata = result.details.toolResultVirtualizer as { sourceId: string };
	assert.equal((await store.readSource(metadata.sourceId)).text, text);
});

test("small tool results are left untouched", async () => {
	const { store, dir } = await makeStore();
	const event: ToolResultEventLike = {
		toolName: "bash",
		toolCallId: "small",
		input: { command: "echo hi" },
		content: [{ type: "text", text: "hi" }],
		details: { truncation: { truncated: false, content: "hi" } },
	};

	const result = await virtualizeToolResult(event, store, { cwd: dir });

	assert.equal(result, undefined);
});

test("large details with small content are compacted without replacing content with a receipt", async () => {
	const { store, dir } = await makeStore();
	const details = {
		mode: "search",
		query: "metadata_only",
		count: 80,
		matches: Array.from({ length: 80 }, (_unused, index) => ({
			server: "metadata",
			tool: `metadata_tool_${index}`,
		})),
	};

	const result = await virtualizeToolResult(
		{
			toolName: "metadata_tool",
			toolCallId: "large_details_small_content",
			content: [{ type: "text", text: "small visible result" }],
			details,
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	assert.equal(result.content[0]?.text, "small visible result");
	assert.doesNotMatch(result.content[0]?.text ?? "", /tool-result-virtualizer/);
	assert.equal("matches" in result.details, false);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		originalDetailsPath?: string;
		originalDetailsByteCount?: number;
		originalDetailsSha256?: string;
		storageKind?: string;
	};
	assert.equal(metadata.storageKind, "details");
	assert.equal(metadata.originalDetailsPath, undefined);
	assert.ok((metadata.originalDetailsByteCount ?? 0) > 2048);
	assert.ok(metadata.originalDetailsSha256);
	const storedSource = await store.readSource(metadata.sourceId);
	assert.ok(storedSource.metadata.originalDetailsPath);
	assert.equal(
		await readFile(storedSource.metadata.originalDetailsPath, "utf8"),
		JSON.stringify(details),
	);
	assert.equal(storedSource.text, "small visible result");
	assert.deepEqual(
		(await store.listSources()).map((source) => source.storageKind),
		["details"],
	);
});

test("details-only compaction preserves mixed visible content blocks", async () => {
	const { store, dir } = await makeStore();
	const details = {
		matches: Array.from({ length: 80 }, (_unused, index) => ({
			tool: `mixed_detail_${index}`,
		})),
	};
	const result = await virtualizeToolResult(
		{
			toolName: "metadata_tool",
			toolCallId: "mixed_details_content",
			content: [
				{ type: "image", data: "base64-image-data" },
				{ type: "text", text: "small visible result" },
			],
			details,
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const content = result.content as Array<Record<string, unknown>>;
	assert.deepEqual(content, [
		{ type: "image", data: "base64-image-data" },
		{ type: "text", text: "small visible result" },
	]);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		storageKind?: string;
	};
	assert.equal(metadata.storageKind, "details");
	assert.equal(
		(await store.readSource(metadata.sourceId)).text,
		"small visible result",
	);
});

test("large scalar details are summarized while exact original details stay sidecar stored", async () => {
	const { store, dir } = await makeStore();
	const details = {
		mode: "scalar",
		note: `SCALAR_DETAIL ${"😀".repeat(900)}`,
		count: 1,
	};

	const result = await virtualizeToolResult(
		{
			toolName: "metadata_tool",
			toolCallId: "large_scalar_details",
			content: [{ type: "text", text: "small scalar result" }],
			details,
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	assert.equal(result.content[0]?.text, "small scalar result");
	assert.equal(typeof result.details.note, "string");
	const compactNote = result.details.note as string;
	assert.ok(Buffer.byteLength(compactNote, "utf8") <= 120);
	assert.match(compactNote, /stored original detail/);
	assert.doesNotMatch(compactNote, /SCALAR_DETAIL/);
	assert.doesNotMatch(compactNote, /😀/);
	const metadata = result.details.toolResultVirtualizer as {
		sourceId: string;
		originalDetailsPath?: string;
		originalDetailsByteCount?: number;
		originalDetailsSha256?: string;
	};
	assert.equal(metadata.originalDetailsPath, undefined);
	assert.ok((metadata.originalDetailsByteCount ?? 0) > 2048);
	assert.ok(metadata.originalDetailsSha256);
	const storedSource = await store.readSource(metadata.sourceId);
	assert.ok(storedSource.metadata.originalDetailsPath);
	assert.equal(
		await readFile(storedSource.metadata.originalDetailsPath, "utf8"),
		JSON.stringify(details),
	);
});

test("coordination and retrieval tools are left untouched", async () => {
	const { store, dir } = await makeStore();
	const large = markerLines("SUBAGENT_FULL", 1200);
	for (const toolName of [
		"subagent",
		"tool_result_outline",
		"tool_result_get",
		"tool_result_search",
		"tool_result_list",
		"tool_result_diagnostics",
		"tool_result_retention_preview",
		"context_search",
		"context_get",
		"ctx_execute",
		"ctx_execute_file",
		"ctx_index",
		"ctx_search",
		"ctx_fetch_and_index",
		"ctx_batch_execute",
		"ctx_stats",
		"ctx_doctor",
		"ctx_upgrade",
		"ctx_purge",
		"ctx_insight",
		"ctx_future_tool",
	] as const) {
		const event: ToolResultEventLike = {
			toolName,
			toolCallId: `call_${toolName}`,
			content: [{ type: "text", text: large }],
			details: { truncation: { truncated: true, content: large } },
		};
		const result = await virtualizeToolResult(event, store, { cwd: dir });
		assert.equal(result, undefined, toolName);
	}
});

test("context-mode mcp wrapper results are left untouched while other mcp results can virtualize", async () => {
	const { store, dir } = await makeStore();
	const large = markerLines("MCP_CONTEXT_MODE_VISIBLE", 1200);

	for (const input of [
		{ tool: "context_mode_ctx_batch_execute", args: "{}" },
		{ server: "context-mode" },
		{ describe: "context_mode_ctx_batch_execute" },
	] as const) {
		const result = await virtualizeToolResult(
			{
				toolName: "mcp",
				toolCallId: "context_mode_mcp",
				input,
				content: [{ type: "text", text: large }],
				details: { truncation: { truncated: true, content: large } },
			},
			store,
			{ cwd: dir },
		);
		assert.equal(result, undefined, JSON.stringify(input));
	}

	const otherMcpResult = await virtualizeToolResult(
		{
			toolName: "mcp",
			toolCallId: "other_mcp",
			input: { search: "google_docs_", includeSchemas: true },
			content: [
				{ type: "text", text: markerLines("OTHER_MCP_SHOULD_STORE", 1200) },
			],
		},
		store,
		{ cwd: dir },
	);
	assert.ok(otherMcpResult);
	assert.match(
		otherMcpResult.content[0]?.text ?? "",
		/Large mcp result stored locally/,
	);
});

test("large original details are stored separately and compacted to scalar metadata", async () => {
	const { store, dir } = await makeStore();
	const details = {
		mode: "search",
		query: "google_docs_",
		count: 80,
		matches: Array.from({ length: 80 }, (_unused, index) => ({
			server: "google_docs",
			tool: `google_docs_tool_${index}`,
		})),
	};

	const result = await virtualizeToolResult(
		{
			toolName: "mcp",
			toolCallId: "large_details",
			content: [{ type: "text", text: markerLines("MCP_SCHEMA", 300) }],
			details,
		},
		store,
		{ cwd: dir },
	);

	assert.ok(result);
	const compactDetails = result.details;
	assert.equal(compactDetails.mode, "search");
	assert.equal(compactDetails.query, "google_docs_");
	assert.equal(compactDetails.count, 80);
	assert.equal("matches" in compactDetails, false);
	const metadata = compactDetails.toolResultVirtualizer as {
		sourceId: string;
		originalDetailsPath?: string;
		originalDetailsByteCount?: number;
		originalDetailsSha256?: string;
	};
	assert.equal(metadata.originalDetailsPath, undefined);
	assert.ok((metadata.originalDetailsByteCount ?? 0) > 2048);
	assert.ok(metadata.originalDetailsSha256);
	const storedSource = await store.readSource(metadata.sourceId);
	assert.ok(storedSource.metadata.originalDetailsPath);
	assert.equal(
		await readFile(storedSource.metadata.originalDetailsPath, "utf8"),
		JSON.stringify(details),
	);
	assert.ok(Buffer.byteLength(JSON.stringify(compactDetails), "utf8") < 1600);
});
