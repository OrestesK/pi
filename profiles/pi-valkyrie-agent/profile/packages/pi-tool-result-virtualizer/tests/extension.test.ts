import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import piToolResultVirtualizer from "../src/index.ts";
import { parseToolResultVirtualizerReceipt } from "../src/receipt.ts";
import {
	SUBAGENT_RPC_PROTOCOL_VERSION,
	SUBAGENT_RPC_READY_EVENT,
	SUBAGENT_RPC_REQUEST_EVENT,
	subagentRpcReplyEvent,
} from "../src/subagent-rpc-client.ts";
import {
	markerLines,
	schemaProperties,
	withRegisteredExtension,
} from "./test-helpers.ts";

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

		assert.equal(
			await runToolResult(largeReadEvent(skillPath, "ANY_SKILL_FILE")),
			undefined,
		);
	});
});

test("SKILL.md reads accept Pi path spellings", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const skillPath = join(dir, "unicode skill", "SKILL.md");
		await mkdir(dirname(skillPath), { recursive: true });
		await writeFile(skillPath, "skill", "utf8");

		assert.equal(
			await runToolResult(largeReadEvent(`@${skillPath}`, "AT_PREFIXED_SKILL")),
			undefined,
		);
		assert.equal(
			await runToolResult(
				largeReadEvent(
					skillPath.replace("unicode skill", "unicode\u00A0skill"),
					"UNICODE_SKILL",
				),
			),
			undefined,
		);
		assert.equal(
			await runToolResult(
				largeReadEvent(pathToFileURL(skillPath).href, "FILE_URL_SKILL"),
			),
			undefined,
		);
	});
});

test("SKILL.md reads expand tilde paths", {
	skip: process.platform === "win32",
}, async () => {
	await withRegisteredExtension(async ({ dir, runToolResult }) => {
		const previousHome = process.env.HOME;
		process.env.HOME = dir;
		try {
			const skillPath = join(dir, "tilde-skill", "SKILL.md");
			await mkdir(dirname(skillPath), { recursive: true });
			await writeFile(skillPath, "skill", "utf8");

			assert.equal(
				await runToolResult(
					largeReadEvent("~/tilde-skill/SKILL.md", "TILDE_SKILL"),
				),
				undefined,
			);
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
			{
				role: "user",
				content: [{ type: "text", text: "search previous output" }],
			},
			{
				role: "assistant",
				content: [
					{
						type: "toolCall",
						id: "protected_call",
						name: "tool_result_search",
						arguments: {
							query: hugeQuery,
							limit: 1,
							contextLines: 0,
							reason: "short reason",
						},
					},
					{
						type: "toolCall",
						id: "ordinary_call",
						name: "bash",
						arguments: { command: hugeCommand },
					},
				],
			},
		];

		const result = (await runContext(messages)) as {
			messages: Array<{
				content?: Array<{
					type: string;
					name?: string;
					arguments?: Record<string, unknown>;
				}>;
			}>;
		};

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
		assert.doesNotMatch(
			JSON.stringify(protectedCall.arguments),
			/ARG_CONTEXT_/,
		);
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
		let toolResultHandler:
			| ((event: unknown, ctx: { cwd: string }) => Promise<unknown>)
			| undefined;
		let contextHandler:
			| ((
					event: { messages?: unknown },
					ctx: { cwd: string },
			  ) => Promise<unknown>)
			| undefined;
		piToolResultVirtualizer({
			registerTool() {},
			on(event, handler) {
				if (event === "tool_result")
					toolResultHandler = handler as (
						event: unknown,
						ctx: { cwd: string },
					) => Promise<unknown>;
				if (event === "context")
					contextHandler = handler as (
						event: { messages?: unknown },
						ctx: { cwd: string },
					) => Promise<unknown>;
			},
		});
		assert.ok(toolResultHandler);
		assert.ok(contextHandler);
		const large = markerLines("HOOK_FALLBACK_SHOULD_NOT_LEAK", 300);
		const failurePatch = (await toolResultHandler(
			{
				toolName: "synthetic_large_text",
				content: [{ type: "text", text: large }],
			},
			{ cwd: dir },
		)) as {
			content: Array<{ text?: string }>;
			details: Record<string, unknown>;
		};
		const failureText = failurePatch.content[0]?.text ?? "";
		assert.match(failureText, /failed before local storage completed/i);
		assert.match(failureText, /content withheld/i);
		assert.doesNotMatch(failureText, /HOOK_FALLBACK_SHOULD_NOT_LEAK/);
		assert.ok(failurePatch.details.toolResultVirtualizerFailure);
		assert.equal(
			await toolResultHandler(
				{
					toolName: "synthetic_small_text",
					content: [{ type: "text", text: "small" }],
				},
				{ cwd: dir },
			),
			undefined,
		);

		const explosiveBlock = new Proxy(
			{},
			{
				get() {
					throw new Error("context fallback probe");
				},
			},
		);
		assert.equal(
			await contextHandler(
				{ messages: [{ role: "assistant", content: [explosiveBlock] }] },
				{ cwd: dir },
			),
			undefined,
		);
	} finally {
		if (previousRoot === undefined)
			delete process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR;
		else process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR = previousRoot;
	}
});

test("extension registers protected tools in stable prompt order", async () => {
	await withRegisteredExtension(async ({ tools }) => {
		assert.deepEqual(Array.from(tools.keys()), [
			"tool_result_outline",
			"tool_result_get",
			"tool_result_search",
			"tool_result_delegate",
			"tool_result_list",
			"tool_result_diagnostics",
			"tool_result_retention_preview",
		]);
	});
});

test("packaged analyst exposes only exact retrieval tools and no inherited context", async () => {
	const manifest = await readFile(
		new URL("../agents/result-analyst.md", import.meta.url),
		"utf8",
	);
	const frontmatter = manifest.split("---", 3)[1] ?? "";
	assert.match(
		frontmatter,
		/^tools: tool_result_outline, tool_result_search, tool_result_get$/m,
	);
	assert.match(frontmatter, /^extensions: \.\/src\/index\.ts$/m);
	assert.match(frontmatter, /^systemPromptMode: replace$/m);
	assert.match(frontmatter, /^inheritProjectContext: false$/m);
	assert.match(frontmatter, /^inheritSkills: false$/m);
	assert.doesNotMatch(
		frontmatter,
		/tool_result_list|tool_result_diagnostics|tool_result_retention_preview|bash|mcp|subagent/,
	);
	let packageJson: { pi?: { subagents?: { agents?: unknown } } };
	try {
		packageJson = JSON.parse(
			await readFile(new URL("../package.json", import.meta.url), "utf8"),
		) as { pi?: { subagents?: { agents?: unknown } } };
	} catch (error) {
		assert.fail(`package.json must contain valid JSON: ${String(error)}`);
	}
	assert.deepEqual(packageJson.pi?.subagents?.agents, ["./agents"]);
});

test("delegate tool starts one bounded run and receipts advertise it only when ready", async () => {
	await withRegisteredExtension(
		async ({ events, tools, runToolResult, runTool }) => {
			const capability = {
				version: SUBAGENT_RPC_PROTOCOL_VERSION,
				methods: ["ping", "status", "spawn", "interrupt", "stop"],
				capabilities: {
					status: true,
					asyncSpawn: true,
					interrupt: true,
					stop: true,
				},
			};
			let spawnCalls = 0;
			const requestSources: unknown[] = [];
			events.on(SUBAGENT_RPC_REQUEST_EVENT, (raw) => {
				const request = raw as {
					requestId: string;
					method: string;
					source?: unknown;
				};
				requestSources.push(request.source);
				if (request.method === "spawn") spawnCalls += 1;
				events.emit(subagentRpcReplyEvent(request.requestId), {
					version: SUBAGENT_RPC_PROTOCOL_VERSION,
					requestId: request.requestId,
					method: request.method,
					success: true,
					data:
						request.method === "ping"
							? capability
							: {
									text: "started",
									details: { asyncId: "extension-run-1" },
								},
				});
			});
			events.emit(SUBAGENT_RPC_READY_EVENT, capability);

			const patch = (await runToolResult({
				toolName: "synthetic_large_text",
				toolCallId: "delegate_source",
				content: [{ type: "text", text: markerLines("DELEGATE_TARGET", 300) }],
			})) as {
				content: Array<{ text?: string }>;
				details: {
					toolResultVirtualizer: {
						sourceId: string;
						actions: Array<{ toolName: string }>;
					};
				};
			};
			const sourceId = patch.details.toolResultVirtualizer.sourceId;
			const receiptText = patch.content[0]?.text ?? "";
			assert.match(receiptText, /Delegate analysis/);
			assert.match(
				receiptText,
				/Recommended: for synthesis, comparison, or multi-fact questions, call tool_result_delegate once with task set to the user's actual question\./,
			);
			const recommendationIndex = receiptText.indexOf("Recommended:");
			const knownFactIndex = receiptText.indexOf("Known fact:");
			assert.ok(
				recommendationIndex >= 0 && recommendationIndex < knownFactIndex,
			);
			assert.match(
				receiptText,
				/Choose based on the task: delegate synthesis, comparison, or multi-fact extraction; search then get one exact fact\./,
			);
			assert.match(
				receiptText,
				/Known fact: call tool_result_search with sourceId "tr_[^"]+" and your actual fact or phrase as query\./,
			);
			assert.doesNotMatch(receiptText, /<known fact or phrase>/);
			const parsedReceipt = parseToolResultVirtualizerReceipt(receiptText);
			assert.equal(parsedReceipt?.kind, "stored");
			assert.ok(parsedReceipt.decisionCard);
			assert.doesNotMatch(
				JSON.stringify(parsedReceipt.decisionCard.actions),
				/"intent":"known_fact"/,
			);
			const generatedDelegate = parsedReceipt.decisionCard.actions.find(
				(action) => action.intent === "delegate_analysis",
			);
			assert.ok(generatedDelegate);
			for (const action of parsedReceipt.decisionCard.actions) {
				const result = await runTool(action.toolName, action.args);
				if (action.intent === "delegate_analysis") {
					assert.equal(result.details?.status, "started");
				} else {
					assert.equal(result.details?.sourceId, sourceId);
					assert.match(result.content[0]?.text ?? "", /DELEGATE_TARGET/);
				}
			}
			assert.equal(spawnCalls, 1);

			const childEnvironment = {
				PI_SUBAGENT_CHILD: process.env.PI_SUBAGENT_CHILD,
				PI_SUBAGENT_RUN_ID: process.env.PI_SUBAGENT_RUN_ID,
				PI_SUBAGENT_CHILD_AGENT: process.env.PI_SUBAGENT_CHILD_AGENT,
			};
			try {
				for (const [name, value] of [
					["PI_SUBAGENT_CHILD", "1"],
					["PI_SUBAGENT_RUN_ID", "child-run"],
					["PI_SUBAGENT_CHILD_AGENT", "child-agent"],
				] as const) {
					delete process.env.PI_SUBAGENT_CHILD;
					delete process.env.PI_SUBAGENT_RUN_ID;
					delete process.env.PI_SUBAGENT_CHILD_AGENT;
					process.env[name] = value;
					const childPatch = (await runToolResult({
						toolName: "synthetic_large_text",
						toolCallId: `delegate_child_${name}`,
						content: [
							{ type: "text", text: markerLines("CHILD_RECEIPT", 300) },
						],
					})) as {
						content: Array<{ text?: string }>;
						details: {
							toolResultVirtualizer: {
								actions: Array<{ toolName: string }>;
							};
						};
					};
					assert.doesNotMatch(
						childPatch.content[0]?.text ?? "",
						/Delegate analysis/,
						name,
					);
					assert.equal(
						childPatch.details.toolResultVirtualizer.actions.length,
						2,
						name,
					);
				}
			} finally {
				for (const [name, value] of Object.entries(childEnvironment)) {
					if (value === undefined) delete process.env[name];
					else process.env[name] = value;
				}
			}

			const delegate = tools.get("tool_result_delegate");
			assert.ok(delegate);
			assert.equal(schemaProperties(delegate).dryRun, undefined);
			assert.match(delegate.description, /single call/i);
			assert.match(
				(delegate.promptGuidelines ?? []).join(" "),
				/actual question/i,
			);
			await assert.rejects(
				runTool("tool_result_delegate", {
					sourceId,
					sourceIds: [sourceId, "tr_other_source"],
					task: "Identify the decisive evidence.",
				}),
				/use one sourceId/i,
			);
			assert.deepEqual(requestSources, [
				{ extension: "pi-tool-result-virtualizer" },
				{ extension: "pi-tool-result-virtualizer" },
			]);

			events.emit(SUBAGENT_RPC_READY_EVENT, {
				...capability,
				capabilities: { ...capability.capabilities, asyncSpawn: false },
			});
			const unavailablePatch = (await runToolResult({
				toolName: "synthetic_large_text",
				toolCallId: "delegate_unavailable_source",
				content: [
					{ type: "text", text: markerLines("NO_DELEGATE_ACTION", 300) },
				],
			})) as {
				content: Array<{ text?: string }>;
				details: {
					toolResultVirtualizer: {
						actions: Array<{ toolName: string }>;
					};
				};
			};
			assert.doesNotMatch(
				unavailablePatch.content[0]?.text ?? "",
				/Delegate analysis/,
			);
			assert.equal(
				unavailablePatch.details.toolResultVirtualizer.actions.length,
				2,
			);
		},
		{
			context() {
				return { cwd: process.cwd() };
			},
		},
	);
});

test("protected tools expose and persist optional compact reasons", async () => {
	await withRegisteredExtension(async ({ tools, runToolResult, runTool }) => {
		for (const toolName of [
			"tool_result_outline",
			"tool_result_get",
			"tool_result_search",
			"tool_result_list",
			"tool_result_diagnostics",
			"tool_result_retention_preview",
		] as const) {
			const tool = tools.get(toolName);
			assert.ok(tool);
			assert.ok(
				schemaProperties(tool).reason,
				`${toolName} schema should expose reason`,
			);
		}

		const patch = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "reason_source",
			content: [{ type: "text", text: markerLines("REASON_TARGET", 300) }],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;

		const conciseReason = "investigate why retention preview is growing";
		const searchResult = await runTool("tool_result_search", {
			sourceId,
			query: "REASON_TARGET",
			reason: `  ${conciseReason}  `,
		});
		assert.equal(searchResult.details?.reason, conciseReason);
		assert.equal(searchResult.details?.reasonTruncated, undefined);

		const longReason = `trace ${"reason ".repeat(200)}`;
		const diagnosticsResult = await runTool("tool_result_diagnostics", {
			limit: 1,
			reason: longReason,
		});
		assert.equal(diagnosticsResult.details?.reasonTruncated, true);
		assert.equal(diagnosticsResult.details?.reasonByteLimit, 512);
		assert.equal(
			Buffer.byteLength(
				String(diagnosticsResult.details?.reason ?? ""),
				"utf8",
			) <= 512,
			true,
		);
	});
});

test("extension outlines stored sources with bounded samples, broad keyword hits, and omissions", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const lines = [
			`HEAD_LONG ${"X".repeat(5_000)} END_OF_LONG_HEAD`,
			...Array.from(
				{ length: 120 },
				(_unused, index) => `ordinary middle line ${index}`,
			),
			"MIDDLE_SECRET_SHOULD_NOT_BE_SAMPLED",
			"ERROR_TARGET important failure summary",
			...Array.from(
				{ length: 120 },
				(_unused, index) => `tailable line ${index}`,
			),
			"TAIL_VISIBLE final line",
		];
		const patch = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "outline_source",
			content: [{ type: "text", text: `${lines.join("\n")}\n` }],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };

		const result = await runTool("tool_result_outline", {
			sourceId: patch.details.toolResultVirtualizer.sourceId,
			headLines: 3,
			tailLines: 3,
		});
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
		assert.equal(
			result.details?.sourceId,
			patch.details.toolResultVirtualizer.sourceId,
		);
		assert.equal(result.details?.omittedMiddleLineCount, lines.length - 6);
		assert.equal(result.details?.keywordHitCount, 2);
	});
});

test("extension searches bounded ranges across explicit source ids", async () => {
	await withRegisteredExtension(async ({ tools, runToolResult, runTool }) => {
		const searchTool = tools.get("tool_result_search");
		assert.ok(searchTool);
		const properties = schemaProperties(searchTool);
		const sourceIdsSchema = properties.sourceIds as Record<string, unknown>;
		assert.equal(sourceIdsSchema.maxItems, 10);
		assert.equal(sourceIdsSchema.uniqueItems, true);
		assert.equal((properties.lineStart as Record<string, unknown>).minimum, 1);
		assert.equal(
			(properties.lineLimit as Record<string, unknown>).maximum,
			500,
		);

		const sourceText = (
			label: string,
			matchLine: number,
			outsideLine?: number,
		) =>
			`${Array.from({ length: 220 }, (_unused, index) => {
				const lineNumber = index + 1;
				if (lineNumber === matchLine) return `${label} bounded needle`;
				if (lineNumber === outsideLine) return `${label} outside needle`;
				return `${label} filler ${lineNumber}`;
			}).join("\n")}\n`;
		const first = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "multi_source_first",
			content: [{ type: "text", text: sourceText("FIRST", 105, 20) }],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const second = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "multi_source_second",
			content: [{ type: "text", text: sourceText("SECOND", 110) }],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceIds = [
			first.details.toolResultVirtualizer.sourceId,
			second.details.toolResultVirtualizer.sourceId,
		];

		const result = await runTool("tool_result_search", {
			query: "needle",
			sourceIds,
			lineStart: 100,
			lineLimit: 20,
			contextLines: 1,
			limit: 5,
		});
		const text = result.content[0]?.text ?? "";
		assert.ok(text.includes(`${sourceIds[0]}:105`));
		assert.ok(text.includes(`${sourceIds[1]}:110`));
		assert.match(text, /context: 104-106/);
		assert.doesNotMatch(text, /outside needle/);
		assert.deepEqual(result.details?.sourceIds, sourceIds);
		assert.equal(result.details?.lineStart, 100);
		assert.equal(result.details?.lineLimit, 20);
		assert.equal(result.details?.matchCount, 2);

		await assert.rejects(
			() =>
				runTool("tool_result_search", {
					query: "needle",
					sourceIds: Array.from({ length: 11 }, () => sourceIds[0]),
				}),
			/sourceIds.*at most 10/i,
		);
		await assert.rejects(
			() =>
				runTool("tool_result_search", {
					query: "needle",
					sourceId: sourceIds[0],
					sourceIds,
				}),
			/sourceId.*sourceIds.*not both/i,
		);
	});
});

test("protected tools reject malformed source ids without echoing raw input", async () => {
	await withRegisteredExtension(async ({ runTool }) => {
		for (const sourceId of [
			`bad_${"X".repeat(20_000)}`,
			"not-a-source",
			"tr_bad\0source",
		] as const) {
			await assert.rejects(
				async () =>
					runTool("tool_result_get", { sourceId, lineStart: 1, lineLimit: 1 }),
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
			content: [
				{
					type: "text",
					text: `prefix\n${longQuery}\nsuffix\n${markerLines("LONG_QUERY_FILLER", 220)}`,
				},
			],
		});

		const result = await runTool("tool_result_search", {
			query: longQuery,
			limit: 1,
			contextLines: 0,
		});
		const text = result.content[0]?.text ?? "";
		assert.match(text, /LONG_QUERY_/);
		assert.equal(result.details?.matchCount, 1);
		assert.equal(result.details?.queryTruncated, true);
		assert.equal(result.details?.queryByteLimit, 512);
		assert.equal(
			Buffer.byteLength(String(result.details?.query ?? ""), "utf8") <= 512,
			true,
		);
		assert.equal(
			Buffer.byteLength(JSON.stringify(result.details), "utf8") < 1_000,
			true,
		);
		await assert.rejects(() => stat(join(dir, "search-index.sqlite")), {
			code: "ENOENT",
		});
	});
});

test("extension rejects blank search queries without returning arbitrary stored lines", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "blank_query_source",
			content: [
				{
					type: "text",
					text: `${markerLines("BLANK_QUERY_SHOULD_NOT_LEAK", 220)}`,
				},
			],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };

		for (const query of ["", "  \n\t  "] as const) {
			await assert.rejects(
				async () =>
					runTool("tool_result_search", {
						sourceId: patch.details.toolResultVirtualizer.sourceId,
						query,
						limit: 3,
						contextLines: 0,
					}),
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
			content: [
				{ type: "text", text: `${markerLines("BROAD_NO_MATCH_PRIVATE", 220)}` },
			],
		});

		const result = await runTool("tool_result_search", {
			query: "definitely-not-present",
			limit: 3,
			contextLines: 0,
		});
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

test("extension caps protected retrieval outputs and points to bounded windows", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		const patch = (await runToolResult({
			toolName: "synthetic_large_text",
			toolCallId: "long_line_source",
			content: [
				{
					type: "text",
					text: `needle ${"LONG_LINE".repeat(8_000)} tail-marker`,
				},
			],
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourceId = patch.details.toolResultVirtualizer.sourceId;

		const getResult = await runTool("tool_result_get", {
			sourceId,
			lineStart: 1,
			lineLimit: 1,
		});
		const getText = getResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(getText, "utf8") < 10_000);
		assert.match(getText, /output capped/i);
		assert.match(getText, /smaller consecutive tool_result_get windows/);
		assert.doesNotMatch(getText, /tool_result_export/);
		assert.doesNotMatch(getText, /tail-marker/);
		assert.equal(getResult.details?.outputTruncated, true);

		const searchResult = await runTool("tool_result_search", {
			sourceId,
			query: "tail-marker",
			limit: 1,
			contextLines: 0,
		});
		const searchText = searchResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(searchText, "utf8") < 10_000);
		assert.match(searchText, /tail-marker/);
		assert.match(searchText, /context capped/i);
		assert.match(searchText, /bounded tool_result_get windows/);
		assert.doesNotMatch(searchText, /tool_result_export/);
		assert.equal(searchResult.details?.outputTruncated, true);
	});
});

test("extension previews retention candidates without returning raw source content", async () => {
	await withRegisteredExtension(async ({ runToolResult, runTool }) => {
		await runToolResult({
			toolName: "bash",
			toolCallId: "retention_old",
			content: [{ type: "text", text: markerLines("RETENTION_OLD", 300) }],
		});
		await runToolResult({
			toolName: "bash",
			toolCallId: "retention_recent",
			content: [{ type: "text", text: markerLines("RETENTION_RECENT", 300) }],
		});

		const result = await runTool("tool_result_retention_preview", {
			maxSources: 1,
		});
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
				content: [
					{ type: "text", text: markerLines(`RETENTION_MANY_${index}`, 220) },
				],
			});
		}

		const result = await runTool("tool_result_retention_preview", {
			maxSources: 0,
		});
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
				content: [
					{ type: "text", text: markerLines(`RETENTION_KEPT_${index}`, 220) },
				],
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
				content: [
					{ type: "text", text: markerLines(`METADATA_CAP_${index}`, 220) },
				],
			});
		}

		const listResult = await runTool("tool_result_list", { limit: 100 });
		const listText = listResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(listText, "utf8") <= 8_192);
		assert.match(listText, /output capped/i);
		assert.equal(listResult.details?.count, 100);
		assert.equal(listResult.details?.outputTruncated, true);

		const diagnosticsResult = await runTool("tool_result_diagnostics", {
			limit: 100,
		});
		const diagnosticsText = diagnosticsResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(diagnosticsText, "utf8") <= 8_192);
		assert.match(diagnosticsText, /output capped/i);
		assert.equal(diagnosticsResult.details?.sourceCount, 110);
		assert.equal(diagnosticsResult.details?.outputTruncated, true);

		const previewResult = await runTool("tool_result_retention_preview", {
			maxSources: 0,
			limit: 100,
		});
		const previewText = previewResult.content[0]?.text ?? "";
		assert.ok(Buffer.byteLength(previewText, "utf8") <= 8_192);
		assert.match(previewText, /output capped/i);
		assert.equal(previewResult.details?.candidateCount, 110);
		assert.equal(
			(previewResult.details?.candidateSourceIds as string[]).length,
			100,
		);
		assert.equal(previewResult.details?.omittedCandidateCount, 10);
		assert.equal(previewResult.details?.outputTruncated, true);
	});
});

test("extension exposes bounded read-only consistency diagnostics without raw content or store paths", async () => {
	await withRegisteredExtension(async ({ dir, runToolResult, runTool }) => {
		const patch = (await runToolResult({
			toolName: "bash",
			toolCallId: "diag_source",
			content: [{ type: "text", text: markerLines("DIAG_SECRET", 250) }],
			details: { truncation: { truncated: false } },
		})) as { details: { toolResultVirtualizer: { sourceId: string } } };
		const sourcePath = join(
			dir,
			"sources",
			`${patch.details.toolResultVirtualizer.sourceId}.txt`,
		);
		await writeFile(sourcePath, "tampered but still local\n");

		const result = await runTool("tool_result_diagnostics", { limit: 10 });
		const text = result.content[0]?.text ?? "";
		assert.match(text, /Store consistency: issues detected/);
		assert.match(text, /Sources: 1/);
		assert.match(text, /source_hash_mismatch/);
		assert.doesNotMatch(text, /DIAG_SECRET line|tampered but still local/);
		assert.equal(text.includes(dir), false);
		assert.equal(result.details?.sourceCount, 1);
		assert.equal(result.details?.healthy, false);
		assert.equal(result.details?.root, undefined);
		assert.ok(
			(result.details?.footprint as { sourceBytes: number }).sourceBytes > 0,
		);
		assert.equal(
			await readFile(sourcePath, "utf8"),
			"tampered but still local\n",
		);
	});
});
