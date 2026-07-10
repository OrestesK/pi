import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import piToolResultVirtualizer from "../src/index.ts";
import { markerLines, schemaProperties, withRegisteredExtension } from "./test-helpers.ts";

function largeReadEvent(path: string, marker: string): Record<string, unknown> {
	return {
		toolName: "read",
		toolCallId: marker,
		input: { path },
		content: [{ type: "text", text: markerLines(marker, 300) }],
	};
}

test("all SKILL.md reads pass through", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const skillPath = join(dir, "arbitrary", "SKILL.md");
		await mkdir(dirname(skillPath), { recursive: true });
		await writeFile(skillPath, "skill", "utf8");

		assert.equal(await runToolResult(largeReadEvent(skillPath, "ANY_SKILL_FILE")), undefined);
	});
});

test("SKILL.md reads accept Pi path spellings", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const skillPath = join(dir, "unicode skill", "SKILL.md");
		await mkdir(dirname(skillPath), { recursive: true });
		await writeFile(skillPath, "skill", "utf8");

		assert.equal(await runToolResult(largeReadEvent(`@${skillPath}`, "AT_PREFIXED_SKILL")), undefined);
		assert.equal(
			await runToolResult(largeReadEvent(skillPath.replace("unicode skill", "unicode\u00A0skill"), "UNICODE_SKILL")),
			undefined,
		);
		assert.equal(await runToolResult(largeReadEvent(pathToFileURL(skillPath).href, "FILE_URL_SKILL")), undefined);
	});
});

test("SKILL.md reads expand tilde paths", { skip: process.platform === "win32" }, async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const previousHome = process.env.HOME;
		process.env.HOME = dir;
		try {
			const skillPath = join(dir, "tilde-skill", "SKILL.md");
			await mkdir(dirname(skillPath), { recursive: true });
			await writeFile(skillPath, "skill", "utf8");

			assert.equal(await runToolResult(largeReadEvent("~/tilde-skill/SKILL.md", "TILDE_SKILL")), undefined);
		} finally {
			if (previousHome === undefined) delete process.env.HOME;
			else process.env.HOME = previousHome;
		}
	});
});

test("non-SKILL.md symlink aliases retain ordinary virtualization", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const skillPath = join(dir, "package", "SKILL.md");
		const aliasPath = join(dir, "skill-alias.md");
		await mkdir(dirname(skillPath), { recursive: true });
		await writeFile(skillPath, "skill", "utf8");
		await symlink(skillPath, aliasPath);

		assert.ok(await runToolResult(largeReadEvent(aliasPath, "ALIASED_SKILL")));
	});
});

test("non-SKILL.md reads retain ordinary virtualization", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const readPath = join(dir, "arbitrary", "README.md");
		await mkdir(dirname(readPath), { recursive: true });
		await writeFile(readPath, "ordinary file", "utf8");

		assert.ok(await runToolResult(largeReadEvent(readPath, "ORDINARY_READ")));
	});
});

test("provider context caps oversized protected tool-call string arguments", async () => {
	await withRegisteredExtension(async ({ runContext }) => {
		const hugeQuery = `ARG_CONTEXT_${"Q".repeat(50_000)}`;
		const hugeCommand = `echo ${"C".repeat(50_000)}`;
		const messages = [
			{ role: "user", content: [{ type: "text", text: "search previous output" }] },
			{
				role: "assistant",
				content: [
					{ type: "toolCall", id: "protected_call", name: "tool_result_search", arguments: { query: hugeQuery, limit: 1, contextLines: 0, reason: "short reason" } },
					{ type: "toolCall", id: "ordinary_call", name: "bash", arguments: { command: hugeCommand } },
				],
			},
		];

		const result = await runContext(messages) as { messages: Array<{ content?: Array<{ type: string; name?: string; arguments?: Record<string, unknown> }> }> };

		const assistant = result.messages[1];
		assert.ok(assistant?.content);
		const protectedCall = assistant.content[0];
		const ordinaryCall = assistant.content[1];
		assert.ok(protectedCall?.arguments);
		assert.ok(ordinaryCall?.arguments);
		assert.equal(protectedCall.arguments.limit, 1);
		assert.equal(protectedCall.arguments.contextLines, 0);
		assert.equal(protectedCall.arguments.reason, "short reason");
		assert.match(String(protectedCall.arguments.query), /provider context/);
		assert.match(String(protectedCall.arguments.query), /50012 bytes/);
		assert.doesNotMatch(JSON.stringify(protectedCall.arguments), /ARG_CONTEXT_/);
		assert.equal(ordinaryCall.arguments.command, hugeCommand);
		assert.notEqual(messages[1], result.messages[1]);
	});
});

test("extension tool_result hook failures with large output return compact failure receipts", async () => {
	const dir = await mkdtemp(join(tmpdir(), "pi-trv-hook-fallback-"));
	const badRoot = join(dir, "not-a-directory");
	await writeFile(badRoot, "root is a file", "utf8");
	const previousRoot = process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR;
	process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR = badRoot;
	try {
		let toolResultHandler: ((event: unknown, ctx: { cwd: string }) => Promise<unknown>) | undefined;
		let contextHandler: ((event: { messages?: unknown }, ctx: { cwd: string }) => Promise<unknown>) | undefined;
		piToolResultVirtualizer({
			registerTool() {},
			on(event, handler) {
				if (event === "tool_result") toolResultHandler = handler as (event: unknown, ctx: { cwd: string }) => Promise<unknown>;
				if (event === "context") contextHandler = handler as (event: { messages?: unknown }, ctx: { cwd: string }) => Promise<unknown>;
			},
		});
		assert.ok(toolResultHandler);
		assert.ok(contextHandler);
		const large = markerLines("HOOK_FALLBACK_SHOULD_NOT_LEAK", 300);
		const failurePatch = await toolResultHandler({ toolName: "synthetic_large_text", content: [{ type: "text", text: large }] }, { cwd: dir }) as { content: Array<{ text?: string }>; details: Record<string, unknown> };
		const failureText = failurePatch.content[0]?.text ?? "";
		assert.match(failureText, /failed before local storage completed/i);
		assert.match(failureText, /content withheld/i);
		assert.doesNotMatch(failureText, /HOOK_FALLBACK_SHOULD_NOT_LEAK/);
		assert.ok(failurePatch.details.toolResultVirtualizerFailure);
		assert.equal(await toolResultHandler({ toolName: "synthetic_small_text", content: [{ type: "text", text: "small" }] }, { cwd: dir }), undefined);

		const explosiveBlock = new Proxy({}, {
			get() {
				throw new Error("context fallback probe");
			},
		});
		assert.equal(await contextHandler({ messages: [{ role: "assistant", content: [explosiveBlock] }] }, { cwd: dir }), undefined);
	} finally {
		if (previousRoot === undefined) delete process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR;
		else process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR = previousRoot;
	}
});

test("extension registers protected tools in stable prompt order", async () => {
	await withRegisteredExtension(async ({ tools }) => {
		assert.deepEqual(Array.from(tools.keys()), [
			"tool_result_outline",
			"tool_result_summary_contract",
			"tool_result_get",
			"tool_result_search",
			"tool_result_list",
			"tool_result_diagnostics",
			"tool_result_retention_preview",
			"tool_result_export_details",
			"tool_result_export",
		]);
	});
});

test("protected tools expose and persist optional compact reasons", async () => {
	await withRegisteredExtension(async ({ tools, runToolResult, runTool }) => {
		for (const toolName of [
			"tool_result_outline",
			"tool_result_summary_contract",
			"tool_result_get",
			"tool_result_search",
			"tool_result_list",
			"tool_result_diagnostics",
			"tool_result_retention_preview",
			"tool_result_export_details",
			"tool_result_export",
		] as const) {
			const tool = tools.get(toolName);
			assert.ok(tool);
			assert.ok(schemaProperties(tool).reason, `${toolName} schema should expose reason`);
		}

		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "reason_source",
			content: [{ type: "text", text: markerLines("REASON_TARGET", 300) }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;

		const conciseReason = "investigate why retention preview is growing";
		const contractResult = await runTool("tool_result_summary_contract", { sourceId, prompt: "Summarize failures", reason: conciseReason });
		assert.equal(contractResult.details?.reason, conciseReason);
		const searchResult = await runTool("tool_result_search", { sourceId, query: "REASON_TARGET", reason: `  ${conciseReason}  ` });
		assert.equal(searchResult.details?.reason, conciseReason);
		assert.equal(searchResult.details?.reasonTruncated, undefined);

		const longReason = `trace ${"reason ".repeat(200)}`;
		const diagnosticsResult = await runTool("tool_result_diagnostics", { limit: 1, reason: longReason });
		assert.equal(diagnosticsResult.details?.reasonTruncated, true);
		assert.equal(diagnosticsResult.details?.reasonByteLimit, 512);
		assert.equal(Buffer.byteLength(String(diagnosticsResult.details?.reason ?? ""), "utf8") <= 512, true);
	});
});

test("summary contract returns an honest ready-to-call subagent task without raw source text", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "summary_contract_source",
			content: [{ type: "text", text: `${markerLines("SUMMARY_SECRET_SHOULD_STAY_LOCAL", 300)}` }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;

		const result = await runTool("tool_result_summary_contract", { sourceId, prompt: "Find the actionable failure and cite lines" });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /does not spawn a subagent/i);
		assert.match(text, /subagent/);
		assert.match(text, new RegExp(sourceId));
		assert.match(text, /Find the actionable failure and cite lines/);
		const searchIndex = text.indexOf("tool_result_search");
		const getIndex = text.indexOf("tool_result_get");
		const outlineIndex = text.indexOf("tool_result_outline");
		assert.ok(searchIndex >= 0);
		assert.ok(getIndex > searchIndex);
		assert.ok(outlineIndex > getIndex);
		assert.match(text, /tool_result_outline is optional triage/);
		assert.match(text, /tool_result_export only if exact oversized ranges are required offline/);
		assert.match(text, /retrieval commands or cited line ranges/i);
		assert.match(text, /Exact stored-content escape hatch/);
		assert.doesNotMatch(text, /SUMMARY_SECRET_SHOULD_STAY_LOCAL line/);
		assert.equal(result.details?.sourceId, sourceId);
		assert.equal(result.details?.contractOnly, true);
		assert.match(String(result.details?.recommendedSubagentTask ?? ""), /Find the actionable failure and cite lines/);
		assert.deepEqual(result.details?.retrievalTools, ["tool_result_outline", "tool_result_search", "tool_result_get", "tool_result_export"]);
	});
});

test("extension exports exact original details without returning raw details content", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult, runTool }) => {
		const details = {
			mode: "search",
			query: "google_docs_",
			count: 80,
			matches: Array.from({ length: 80 }, (_unused, index) => ({ server: "google_docs", tool: `google_docs_tool_${index}` })),
		};
		const patch = await runToolResult({
			toolName: "mcp",
			toolCallId: "details_export_source",
			content: [{ type: "text", text: markerLines("DETAILS_EXPORT", 300) }],
			details,
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };

		const relativeFilePath = "original-details-export.json";
		const expectedFilePath = join(dir, "exports", relativeFilePath);
		const result = await runTool("tool_result_export_details", { sourceId: patch.details.toolResultVirtualizer.sourceId, filePath: relativeFilePath });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /Exported original details/);
		assert.doesNotMatch(text, /google_docs_tool_0/);
		assert.equal(result.details?.filePath, expectedFilePath);
		assert.deepEqual(JSON.parse(await readFile(expectedFilePath, "utf8")), details);
		assert.equal(result.details?.byteCount, Buffer.byteLength(JSON.stringify(details), "utf8"));
	});
});

test("export tools default to no-clobber and allow explicit overwrite", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult, runTool }) => {
		const details = { matches: Array.from({ length: 80 }, (_unused, index) => ({ tool: `overwrite_tool_${index}` })) };
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "overwrite_source",
			content: [{ type: "text", text: markerLines("OVERWRITE_SOURCE", 300) }],
			details,
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;
		await mkdir(join(dir, "exports"), { recursive: true });
		await writeFile(join(dir, "exports", "source.txt"), "old source", { encoding: "utf8", mode: 0o600 });
		await writeFile(join(dir, "exports", "details.json"), "old details", { encoding: "utf8", mode: 0o600 });

		await assert.rejects(() => runTool("tool_result_export", { sourceId, filePath: "source.txt" }), /EEXIST/);
		await assert.rejects(() => runTool("tool_result_export_details", { sourceId, filePath: "details.json" }), /EEXIST/);

		await runTool("tool_result_export", { sourceId, filePath: "source.txt", overwrite: true });
		await runTool("tool_result_export_details", { sourceId, filePath: "details.json", overwrite: true });
		assert.equal(await readFile(join(dir, "exports", "source.txt"), "utf8"), markerLines("OVERWRITE_SOURCE", 300));
		assert.deepEqual(JSON.parse(await readFile(join(dir, "exports", "details.json"), "utf8")), details);
	});
});

test("extension exports relative file paths under the managed exports directory", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "relative_export_source",
			content: [{ type: "text", text: markerLines("RELATIVE_EXPORT", 300) }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };

		const relativeFilePath = "nested/relative-source-export.txt";
		const expectedFilePath = join(dir, "exports", relativeFilePath);
		const result = await runTool("tool_result_export", { sourceId: patch.details.toolResultVirtualizer.sourceId, filePath: relativeFilePath });

		assert.equal(result.details?.filePath, expectedFilePath);
		assert.equal(await readFile(expectedFilePath, "utf8"), markerLines("RELATIVE_EXPORT", 300));
	});
});

test("export tools reject absolute, parent-traversal, and NUL file paths without echoing raw input", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "confined_export_source",
			content: [{ type: "text", text: markerLines("CONFINED_EXPORT", 300) }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };

		for (const filePath of ["", "/tmp/absolute-export.txt", "../escape-export.txt", "nested/../../escape-export.txt", "nested/evil\0name.txt"] as const) {
			for (const toolName of ["tool_result_export", "tool_result_export_details"] as const) {
				await assert.rejects(
					async () => runTool(toolName, { sourceId: patch.details.toolResultVirtualizer.sourceId, filePath }),
					(error) => {
						assert.ok(error instanceof Error);
						assert.match(error.message, /Invalid filePath/);
						if (filePath.length > 0) assert.equal(error.message.includes(filePath), false);
						return true;
					},
				);
			}
		}
	});
});

test("extension outlines stored sources with bounded samples, broad keyword hits, and omissions", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const lines = [
			`HEAD_LONG ${"X".repeat(5_000)} END_OF_LONG_HEAD`,
			...Array.from({ length: 120 }, (_unused, index) => `ordinary middle line ${index}`),
			"MIDDLE_SECRET_SHOULD_NOT_BE_SAMPLED",
			"ERROR_TARGET important failure summary",
			...Array.from({ length: 120 }, (_unused, index) => `tailable line ${index}`),
			"TAIL_VISIBLE final line",
		];
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "outline_source",
			content: [{ type: "text", text: `${lines.join("\n")}\n` }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };

		const result = await runTool("tool_result_outline", { sourceId: patch.details.toolResultVirtualizer.sourceId, headLines: 3, tailLines: 3 });
		const text = result.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(text, "utf8") < 8_500);
		assert.match(text, /Keyword scan/);
		assert.match(text, /error/);
		assert.match(text, /ERROR_TARGET/);
		assert.match(text, /TAIL_VISIBLE/);
		assert.match(text, /Not returned by outline/);
		assert.match(text, /tool_result_search/);
		assert.doesNotMatch(text, /END_OF_LONG_HEAD/);
		assert.doesNotMatch(text, /MIDDLE_SECRET_SHOULD_NOT_BE_SAMPLED/);
		assert.equal(result.details?.sourceId, patch.details.toolResultVirtualizer.sourceId);
		assert.equal(result.details?.omittedMiddleLineCount, lines.length - 6);
		assert.equal(result.details?.keywordHitCount, 2);
	});
});

test("export tools reject oversized file paths without echoing raw input", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "file_path_validation_source",
			content: [{ type: "text", text: markerLines("FILE_PATH_VALIDATION", 220) }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const longFilePath = `${"P".repeat(5_000)}.txt`;
		await assert.rejects(
			async () => runTool("tool_result_export", { sourceId: patch.details.toolResultVirtualizer.sourceId, filePath: longFilePath }),
			(error) => {
				assert.ok(error instanceof Error);
				assert.match(error.message, /Invalid filePath/);
				assert.equal(error.message.includes(longFilePath), false);
				assert.equal(Buffer.byteLength(error.message, "utf8") < 200, true);
				return true;
			},
		);
	});
});

test("protected tools reject malformed source ids without echoing raw input", async () => {
	await withRegisteredExtension(async ({ runTool }) => {
		for (const sourceId of [`bad_${"X".repeat(20_000)}`, "not-a-source", "tr_bad\0source"] as const) {
			await assert.rejects(
				async () => runTool("tool_result_get", { sourceId, lineStart: 1, lineLimit: 1 }),
				(error) => {
					assert.ok(error instanceof Error);
					assert.match(error.message, /Invalid sourceId/);
					assert.equal(error.message.includes(sourceId), false);
					assert.equal(Buffer.byteLength(error.message, "utf8") < 200, true);
					return true;
				},
			);
		}
	});
});

test("extension caps long search queries in details without changing search semantics", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult, runTool }) => {
		const longQuery = `LONG_QUERY_${"Q".repeat(50_000)}`;
		await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "long_query_source",
			content: [{ type: "text", text: `prefix\n${longQuery}\nsuffix\n${markerLines("LONG_QUERY_FILLER", 220)}` }],
		});

		const result = await runTool("tool_result_search", { query: longQuery, limit: 1, contextLines: 0 });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /LONG_QUERY_/);
		assert.equal(result.details?.matchCount, 1);
		assert.equal(result.details?.queryTruncated, true);
		assert.equal(result.details?.queryByteLimit, 512);
		assert.equal(Buffer.byteLength(String(result.details?.query ?? ""), "utf8") <= 512, true);
		assert.equal(Buffer.byteLength(JSON.stringify(result.details), "utf8") < 1_000, true);
		await assert.rejects(() => stat(join(dir, "search-index.sqlite")), { code: "ENOENT" });
	});
});

test("extension rejects blank search queries without returning arbitrary stored lines", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "blank_query_source",
			content: [{ type: "text", text: `${markerLines("BLANK_QUERY_SHOULD_NOT_LEAK", 220)}` }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };

		for (const query of ["", "  \n\t  "] as const) {
			await assert.rejects(
				async () => runTool("tool_result_search", { sourceId: patch.details.toolResultVirtualizer.sourceId, query, limit: 3, contextLines: 0 }),
				(error) => {
					assert.ok(error instanceof Error);
					assert.match(error.message, /Invalid query/);
					assert.doesNotMatch(error.message, /BLANK_QUERY_SHOULD_NOT_LEAK/);
					assert.equal(Buffer.byteLength(error.message, "utf8") < 200, true);
					return true;
				},
			);
		}
	});
});

test("extension guides broad no-match search toward sourceId-restricted search", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "broad_no_match_source",
			content: [{ type: "text", text: `${markerLines("BROAD_NO_MATCH_PRIVATE", 220)}` }],
		});

		const result = await runTool("tool_result_search", { query: "definitely-not-present", limit: 3, contextLines: 0 });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /No matches found/);
		assert.match(text, /sourceId/);
		assert.match(text, /broad search/i);
		assert.doesNotMatch(text, /linear/i);
		assert.match(text, /tool_result_list/);
		assert.doesNotMatch(text, /BROAD_NO_MATCH_PRIVATE/);
		assert.equal(result.details?.matchCount, 0);
	});
});

test("extension caps protected retrieval outputs by bytes and points to export", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "long_line_source",
			content: [{ type: "text", text: `needle ${"LONG_LINE".repeat(8_000)} tail-marker` }],
		}) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;

		const getResult = await runTool("tool_result_get", { sourceId, lineStart: 1, lineLimit: 1 });
		const getText = getResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(getText, "utf8") < 10_000);
		assert.match(getText, /output capped/i);
		assert.match(getText, /tool_result_export/);
		assert.doesNotMatch(getText, /tail-marker/);
		assert.equal(getResult.details?.outputTruncated, true);

		const searchResult = await runTool("tool_result_search", { sourceId, query: "tail-marker", limit: 1, contextLines: 0 });
		const searchText = searchResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(searchText, "utf8") < 10_000);
		assert.match(searchText, /tail-marker/);
		assert.match(searchText, /context capped/i);
		assert.match(searchText, /tool_result_export/);
		assert.equal(searchResult.details?.outputTruncated, true);
	});
});

test("extension previews retention candidates without returning raw source content", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		await runToolResult({ toolName: "bash", toolCallId: "retention_old", content: [{ type: "text", text: markerLines("RETENTION_OLD", 300) }] });
		await runToolResult({ toolName: "bash", toolCallId: "retention_recent", content: [{ type: "text", text: markerLines("RETENTION_RECENT", 300) }] });

		const result = await runTool("tool_result_retention_preview", { maxSources: 1 });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /Retention preview/);
		assert.doesNotMatch(text, /RETENTION_OLD line/);
		assert.equal(result.details?.candidateCount, 1);
		assert.equal(typeof result.details?.candidateStoredBytes, "number");
		assert.deepEqual(result.details?.selectors, { maxSources: 1 });
	});
});

test("extension caps retention preview candidate lists while preserving full counts", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		for (let index = 0; index < 25; index += 1) {
			await runToolResult({
				toolName: "bash",
				toolCallId: `retention_many_${index}`,
				content: [{ type: "text", text: markerLines(`RETENTION_MANY_${index}`, 220) }],
			});
		}

		const result = await runTool("tool_result_retention_preview", { maxSources: 0 });
		const text = result.content[0]?.text ?? "";
		assert.equal(result.details?.candidateCount, 25);
		assert.equal((result.details?.candidateSourceIds as string[]).length, 20);
		assert.equal(result.details?.omittedCandidateCount, 5);
		assert.match(text, /omitted candidates: 5/);
		assert.equal(text.match(/reasons:maxSources/g)?.length, 20);
	});
});

test("extension caps retention preview kept source lists while preserving full counts", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		for (let index = 0; index < 25; index += 1) {
			await runToolResult({
				toolName: "bash",
				toolCallId: `retention_kept_${index}`,
				content: [{ type: "text", text: markerLines(`RETENTION_KEPT_${index}`, 220) }],
			});
		}

		const result = await runTool("tool_result_retention_preview", {});
		assert.equal(result.details?.keptCount, 25);
		assert.equal((result.details?.keptSourceIds as string[]).length, 20);
		assert.equal(result.details?.omittedKeptSourceCount, 5);
		assert.equal(result.details?.candidateCount, 0);
	});
});

test("extension caps metadata protected tool outputs by bytes", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		for (let index = 0; index < 110; index += 1) {
			await runToolResult({
				toolName: `metadata_cap_with_long_tool_name_${index}`,
				toolCallId: `metadata_cap_${index}`,
				content: [{ type: "text", text: markerLines(`METADATA_CAP_${index}`, 220) }],
			});
		}

		const listResult = await runTool("tool_result_list", { limit: 100 });
		const listText = listResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(listText, "utf8") <= 8_192);
		assert.match(listText, /output capped/i);
		assert.equal(listResult.details?.count, 100);
		assert.equal(listResult.details?.outputTruncated, true);

		const diagnosticsResult = await runTool("tool_result_diagnostics", { limit: 100 });
		const diagnosticsText = diagnosticsResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(diagnosticsText, "utf8") <= 8_192);
		assert.match(diagnosticsText, /output capped/i);
		assert.equal(diagnosticsResult.details?.sourceCount, 110);
		assert.equal(diagnosticsResult.details?.outputTruncated, true);

		const previewResult = await runTool("tool_result_retention_preview", { maxSources: 0, limit: 100 });
		const previewText = previewResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(previewText, "utf8") <= 8_192);
		assert.match(previewText, /output capped/i);
		assert.equal(previewResult.details?.candidateCount, 110);
		assert.equal((previewResult.details?.candidateSourceIds as string[]).length, 100);
		assert.equal(previewResult.details?.omittedCandidateCount, 10);
		assert.equal(previewResult.details?.outputTruncated, true);
	});
});

test("extension registers compact diagnostics for store health without raw source content", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		await runToolResult({
			toolName: "bash",
			toolCallId: "diag_source",
			content: [{ type: "text", text: markerLines("DIAG_SECRET", 250) }],
			details: { truncation: { truncated: false } },
		});

		const result = await runTool("tool_result_diagnostics", { limit: 10 });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /Tool-result virtualizer store:/);
		assert.match(text, /Sources: 1/);
		assert.doesNotMatch(text, /DIAG_SECRET line/);
		assert.equal(result.details?.sourceCount, 1);
		assert.equal(result.details?.totalLines, 250);
		assert.equal(result.details?.totalStoredBytes, result.details?.sourceBytes);
	});
});
