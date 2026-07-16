import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	createTelemetrySink,
	resolveTelemetryEnabled,
} from "../src/telemetry.ts";
import { markerLines, withRegisteredExtension } from "./test-helpers.ts";

test("telemetry is disabled unless explicitly opted in", async () => {
	assert.equal(resolveTelemetryEnabled({}), false);
	assert.equal(
		resolveTelemetryEnabled({ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "0" }),
		false,
	);
	assert.equal(
		resolveTelemetryEnabled({ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "true" }),
		false,
	);
	assert.equal(
		resolveTelemetryEnabled({ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "1" }),
		true,
	);

	const root = await mkdtemp(join(tmpdir(), "pi-trv-telemetry-disabled-"));
	const sink = createTelemetrySink(root, {});
	await sink.record({
		type: "virtualization_decision",
		outcome: "stored",
		reason: "content_threshold",
		visibleBytesBefore: 100,
		visibleBytesAfter: 20,
		storedBytes: 100,
		durationMs: 2,
	});
	await assert.rejects(
		readFile(join(root, "telemetry", "events.jsonl"), "utf8"),
		{ code: "ENOENT" },
	);
});

test("telemetry persists only allowlisted metadata with private permissions", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-telemetry-enabled-"));
	const sink = createTelemetrySink(
		root,
		{ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "1" },
		{ now: () => 1234, randomId: () => "event-1" },
	);
	await sink.record({
		type: "virtualization_decision",
		outcome: "stored",
		reason: "content_threshold",
		visibleBytesBefore: 100,
		visibleBytesAfter: 20,
		storedBytes: 100,
		durationMs: 2,
		content: "TELEMETRY_SECRET",
		query: "PRIVATE_QUERY",
		path: "/private/path",
		sourceId: "tr_private",
		error: "PRIVATE_ERROR",
		details: { nested: "PRIVATE_NESTED" },
	} as never);

	const telemetryPath = join(root, "telemetry", "events.jsonl");
	const raw = await readFile(telemetryPath, "utf8");
	let event: unknown;
	try {
		event = JSON.parse(raw.trim());
	} catch (error) {
		assert.fail(`telemetry event is not valid JSON: ${String(error)}`);
	}
	assert.deepEqual(event, {
		version: 1,
		eventId: "event-1",
		createdAt: 1234,
		type: "virtualization_decision",
		outcome: "stored",
		reason: "content_threshold",
		visibleBytesBefore: 100,
		visibleBytesAfter: 20,
		storedBytes: 100,
		durationMs: 2,
	});
	const directoryStats = await stat(join(root, "telemetry"));
	const fileStats = await stat(telemetryPath);
	assert.equal(directoryStats.mode & 0o777, 0o700);
	assert.equal(fileStats.mode & 0o777, 0o600);
});

test("delegation telemetry records only operation and outcome metadata", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-delegate-telemetry-"));
	let eventId = 0;
	const sink = createTelemetrySink(
		root,
		{ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "1" },
		{ now: () => 1234, randomId: () => `event-${++eventId}` },
	);
	await sink.record({
		type: "retrieval_attempt",
		operation: "delegate",
		task: "PRIVATE_DELEGATION_TASK",
		sourceId: "tr_private",
		runId: "private-run",
		grant: "private-grant",
		rpcEvent: "subagents:rpc:v1:request",
	} as never);
	await sink.record({
		type: "retrieval_outcome",
		operation: "delegate",
		outcome: "success",
		durationMs: 5,
		error: "PRIVATE_RPC_ERROR",
	} as never);

	const raw = await readFile(join(root, "telemetry", "events.jsonl"), "utf8");
	assert.deepEqual(
		raw
			.trim()
			.split("\n")
			.map((line) => JSON.parse(line) as unknown),
		[
			{
				version: 1,
				eventId: "event-1",
				createdAt: 1234,
				type: "retrieval_attempt",
				operation: "delegate",
			},
			{
				version: 1,
				eventId: "event-2",
				createdAt: 1234,
				type: "retrieval_outcome",
				operation: "delegate",
				outcome: "success",
				durationMs: 5,
			},
		],
	);
	assert.doesNotMatch(
		raw,
		/PRIVATE_|tr_private|private-run|private-grant|rpc:v1/,
	);
});

test("telemetry failures do not escape the sink", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-telemetry-failure-"));
	const sink = createTelemetrySink(
		join(root, "missing", "..", "blocked\0path"),
		{ PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY: "1" },
	);
	await assert.doesNotReject(
		sink.record({
			type: "retrieval_outcome",
			operation: "search",
			outcome: "error",
			durationMs: 1,
		}),
	);
});

test("extension records content-free virtualization, retrieval, and compaction events", async () => {
	const previous = process.env.PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY;
	process.env.PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY = "1";
	try {
		await withRegisteredExtension(
			async ({ dir, runContext, runTool, runToolResult }) => {
				const visibleContent = markerLines("PRIVATE_CONTENT", 250);
				const patch = (await runToolResult({
					toolName: "MALICIOUS_TOOL_NAME",
					toolCallId: "PRIVATE_TOOL_CALL_ID",
					input: { query: "PRIVATE_QUERY", path: "/private/path" },
					content: [{ type: "text", text: visibleContent }],
					details: { error: "PRIVATE_ERROR" },
				})) as { content: Array<{ type: "text"; text: string }> };
				await runTool("tool_result_diagnostics", { reason: "PRIVATE_REASON" });
				await runContext([
					{
						role: "assistant",
						content: [
							{
								type: "toolCall",
								name: "tool_result_search",
								arguments: { query: "Q".repeat(600) },
							},
						],
					},
				]);

				const raw = await readFile(
					join(dir, "telemetry", "events.jsonl"),
					"utf8",
				);
				const events = raw
					.trim()
					.split("\n")
					.map((line) => {
						try {
							return JSON.parse(line) as Record<string, unknown>;
						} catch (error) {
							assert.fail(
								`telemetry event is not valid JSON: ${String(error)}`,
							);
						}
					});
				const eventTypes = events.map((event) => event.type);
				assert.ok(eventTypes.includes("tool_result_observed"));
				assert.ok(eventTypes.includes("virtualization_decision"));
				const observed = events.find(
					(event) => event.type === "tool_result_observed",
				);
				const decision = events.find(
					(event) => event.type === "virtualization_decision",
				);
				assert.equal(observed?.visibleBytes, Buffer.byteLength(visibleContent));
				assert.equal(observed?.lineCount, 250);
				assert.equal(
					decision?.visibleBytesBefore,
					Buffer.byteLength(visibleContent),
				);
				assert.equal(
					decision?.visibleBytesAfter,
					Buffer.byteLength(patch.content[0]?.text ?? ""),
				);
				assert.equal(decision?.storedBytes, Buffer.byteLength(visibleContent));
				assert.ok(eventTypes.includes("retrieval_attempt"));
				assert.ok(eventTypes.includes("retrieval_outcome"));
				assert.ok(eventTypes.includes("context_compaction_candidate"));
				assert.doesNotMatch(raw, /PRIVATE_|MALICIOUS/);
			},
		);
	} finally {
		if (previous === undefined)
			delete process.env.PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY;
		else process.env.PI_TOOL_RESULT_VIRTUALIZER_TELEMETRY = previous;
	}
});
