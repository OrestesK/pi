import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { TextContent, ToolDefinitionLike, ToolExecutionContextLike } from "../src/extension-types.ts";
import piToolResultVirtualizer from "../src/index.ts";
import { ToolResultStore } from "../src/store.ts";

export async function makeStore(): Promise<{ dir: string; store: ToolResultStore }> {
	const dir = await mkdtemp(join(tmpdir(), "pi-trv-test-"));
	return { dir, store: new ToolResultStore(dir) };
}

export function markerLines(marker: string, count: number): string {
	return Array.from({ length: count }, (_unused, index) => `${marker} line ${String(index).padStart(4, "0")}`).join("\n") + "\n";
}

export async function supportsFts5Trigram(): Promise<boolean> {
	try {
		const sqlite = await import("node:sqlite");
		const db = new sqlite.DatabaseSync(":memory:");
		try {
			db.exec("CREATE VIRTUAL TABLE tri USING fts5(a, tokenize='trigram')");
			return true;
		} finally {
			db.close();
		}
	} catch {
		return false;
	}
}

export type RegisteredTool = ToolDefinitionLike;

export type ExtensionFixture = {
	dir: string;
	tools: Map<string, RegisteredTool>;
	runContext(messages: unknown[]): Promise<unknown>;
	runToolResult(event: unknown): Promise<unknown>;
	runTool(toolName: string, params: unknown): Promise<{ content: TextContent[]; details?: Record<string, unknown> }>;
};

export function schemaProperties(tool: RegisteredTool): Record<string, unknown> {
	const properties = tool.parameters.properties;
	assert.ok(properties && typeof properties === "object" && !Array.isArray(properties));
	return properties as Record<string, unknown>;
}

export async function withRegisteredExtension<T>(body: (fixture: ExtensionFixture) => Promise<T>): Promise<T> {
	const { dir } = await makeStore();
	const previousRoot = process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR;
	process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR = dir;
	try {
		const tools = new Map<string, RegisteredTool>();
		let toolResultHandler: ((event: unknown, ctx: ToolExecutionContextLike) => Promise<unknown>) | undefined;
		let contextHandler: ((event: { messages?: unknown }, ctx: ToolExecutionContextLike) => Promise<unknown>) | undefined;
		piToolResultVirtualizer({
			registerTool(definition) {
				tools.set(definition.name, definition);
			},
			on(event, handler) {
				if (event === "tool_result") toolResultHandler = handler as (event: unknown, ctx: ToolExecutionContextLike) => Promise<unknown>;
				if (event === "context") contextHandler = handler as (event: { messages?: unknown }, ctx: ToolExecutionContextLike) => Promise<unknown>;
			},
		});
		assert.ok(toolResultHandler);
		assert.ok(contextHandler);
		const handler = toolResultHandler;
		const context = contextHandler;
		return await body({
			dir,
			tools,
			runContext(messages) {
				return context({ messages }, { cwd: dir });
			},
			runToolResult(event) {
				return handler(event, { cwd: dir });
			},
			runTool(toolName, params) {
				const tool = tools.get(toolName);
				assert.ok(tool, `registered tool missing: ${toolName}`);
				return tool.execute(toolName, params, undefined, undefined, { cwd: dir });
			},
		});
	} finally {
		if (previousRoot === undefined) delete process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR;
		else process.env.PI_TOOL_RESULT_VIRTUALIZER_DIR = previousRoot;
	}
}
