import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { ToolResultStore } from "../src/store.ts";
import {
	largeMarkerLines,
	schemaProperties,
	withRegisteredExtension,
} from "./test-helpers.ts";

test("model-facing reads share project scope and explicit global access", async () => {
	let activeCwd: string | undefined;
	await withRegisteredExtension(
		async ({ dir, tools, runToolResult, runTool }) => {
			const listTool = tools.get("tool_result_list");
			const getTool = tools.get("tool_result_get");
			const outlineTool = tools.get("tool_result_outline");
			const searchTool = tools.get("tool_result_search");
			assert.ok(listTool);
			assert.ok(getTool);
			assert.ok(outlineTool);
			assert.ok(searchTool);
			assert.deepEqual(schemaProperties(listTool).includeGlobal, {
				type: "boolean",
				description: "Include every project scope; default false.",
			});
			for (const tool of tools.values())
				assert.equal(
					schemaProperties(tool).includeUnscoped,
					undefined,
					`${tool.name} must not expose unscoped discovery`,
				);
			for (const tool of [getTool, outlineTool]) {
				const properties = schemaProperties(tool);
				for (const name of ["includeGlobal", "includeLegacy"])
					assert.equal(
						properties[name],
						undefined,
						`${tool.name} must not expose discovery scope flag ${name}`,
					);
			}

			const projectA = join(dir, "project-a");
			const projectB = join(dir, "project-b");
			await Promise.all([
				mkdir(projectA, { recursive: true }),
				mkdir(projectB, { recursive: true }),
			]);
			activeCwd = projectA;
			const patch = (await runToolResult({
				toolName: "bash",
				toolCallId: "scoped_source",
				content: [
					{ type: "text", text: largeMarkerLines("PROJECT_A_ONLY", 300) },
				],
			})) as { details: { toolResultVirtualizer: { sourceId: string } } };
			const sourceId = patch.details.toolResultVirtualizer.sourceId;

			activeCwd = projectB;
			assert.equal((await runTool("tool_result_list", {})).details?.count, 0);
			assert.equal(
				(
					await runTool("tool_result_list", {
						includeGlobal: true,
					})
				).details?.count,
				1,
			);
			assert.match(
				(
					await runTool("tool_result_get", {
						sourceId,
						lineLimit: 1,
					})
				).content[0]?.text ?? "",
				/PROJECT_A_ONLY/,
			);

			activeCwd = projectA;
			assert.equal((await runTool("tool_result_list", {})).details?.count, 1);
			assert.match(
				(await runTool("tool_result_get", { sourceId, lineLimit: 1 }))
					.content[0]?.text ?? "",
				/PROJECT_A_ONLY/,
			);
			const diagnosticsBefore = await runTool("tool_result_diagnostics", {
				limit: 10,
			});
			activeCwd = projectB;
			await runToolResult({
				toolName: "bash",
				toolCallId: "scoped_source_b",
				content: [
					{ type: "text", text: largeMarkerLines("PROJECT_B_ONLY", 420) },
				],
			});
			const store = new ToolResultStore(dir);
			const unscoped = await store.storeSource({
				toolName: "read",
				text: largeMarkerLines("UNSCOPED_ONLY", 300),
				captureStatus: "event.content",
				provenance: {
					scope: "unscoped",
					classification: "unclassified-local",
					scopeFailure: "cwd_unavailable",
				},
			});
			const legacy = await store.storeSource({
				toolName: "read",
				text: largeMarkerLines("LEGACY_ONLY", 300),
				captureStatus: "event.content",
			});
			activeCwd = projectA;
			const diagnosticsAfter = await runTool("tool_result_diagnostics", {
				limit: 10,
			});
			assert.equal(
				diagnosticsAfter.content[0]?.text,
				diagnosticsBefore.content[0]?.text,
			);
			assert.deepEqual(diagnosticsAfter.details, diagnosticsBefore.details);

			const previousChild = process.env.PI_SUBAGENT_CHILD;
			const previousRunId = process.env.PI_SUBAGENT_RUN_ID;
			const previousAgent = process.env.PI_SUBAGENT_CHILD_AGENT;
			process.env.PI_SUBAGENT_CHILD = "1";
			delete process.env.PI_SUBAGENT_RUN_ID;
			delete process.env.PI_SUBAGENT_CHILD_AGENT;
			try {
				const exactSources = [
					[sourceId, "PROJECT_A_ONLY"],
					[unscoped.sourceId, "UNSCOPED_ONLY"],
					[legacy.sourceId, "LEGACY_ONLY"],
				] as const;
				const assertSharedChildReads = async () => {
					assert.equal(
						(await runTool("tool_result_list", {})).details?.count,
						1,
					);
					assert.equal(
						(
							await runTool("tool_result_list", {
								includeGlobal: true,
								includeLegacy: true,
							})
						).details?.count,
						3,
					);
					const broad = await runTool("tool_result_search", {
						query: "ONLY",
					});
					assert.match(broad.content[0]?.text ?? "", /PROJECT_A_ONLY/);
					assert.doesNotMatch(
						broad.content[0]?.text ?? "",
						/PROJECT_B_ONLY|UNSCOPED_ONLY|LEGACY_ONLY/,
					);
					assert.match(
						(
							await runTool("tool_result_outline", {
								sourceId,
								headLines: 1,
							})
						).content[0]?.text ?? "",
						/PROJECT_A_ONLY/,
					);
					for (const [exactSourceId, marker] of exactSources) {
						assert.match(
							(
								await runTool("tool_result_get", {
									sourceId: exactSourceId,
									lineLimit: 1,
								})
							).content[0]?.text ?? "",
							new RegExp(marker),
						);
						assert.match(
							(
								await runTool("tool_result_search", {
									query: marker,
									sourceId: exactSourceId,
								})
							).content[0]?.text ?? "",
							new RegExp(marker),
						);
					}
				};
				await assertSharedChildReads();
				process.env.PI_SUBAGENT_RUN_ID = "forged-run";
				process.env.PI_SUBAGENT_CHILD_AGENT = "forged-agent";
				await assertSharedChildReads();
			} finally {
				if (previousChild === undefined) delete process.env.PI_SUBAGENT_CHILD;
				else process.env.PI_SUBAGENT_CHILD = previousChild;
				if (previousRunId === undefined) delete process.env.PI_SUBAGENT_RUN_ID;
				else process.env.PI_SUBAGENT_RUN_ID = previousRunId;
				if (previousAgent === undefined)
					delete process.env.PI_SUBAGENT_CHILD_AGENT;
				else process.env.PI_SUBAGENT_CHILD_AGENT = previousAgent;
			}
		},
		{
			context(defaultCwd) {
				return { cwd: activeCwd ?? defaultCwd };
			},
		},
	);
});
