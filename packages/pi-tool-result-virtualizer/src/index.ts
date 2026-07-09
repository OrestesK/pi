import { realpath } from "node:fs/promises";

import { defaultStoreRoot } from "./config.ts";
import { compactProviderContextMessages } from "./context.ts";
import type { ExtensionApiLike } from "./extension-types.ts";
import { ToolResultStore } from "./store.ts";
import { buildToolResultTools } from "./tools.ts";
import { virtualizeToolResult, type ToolResultEventLike } from "./virtualize.ts";

export { parseToolResultVirtualizerReceipt } from "./receipt.ts";
export type { ParsedToolResultVirtualizerReceipt } from "./receipt.ts";

export default function piToolResultVirtualizer(pi: ExtensionApiLike) {
	const store = new ToolResultStore(defaultStoreRoot());
	let advertisedSkillPaths = new Set<string>();

	for (const tool of buildToolResultTools(store)) {
		pi.registerTool(tool);
	}

	pi.on("before_agent_start", async (event) => {
		const canonicalPaths = await Promise.all(
			(event.systemPromptOptions.skills ?? [])
				.filter((skill) => skill.disableModelInvocation === false)
				.map(async (skill) => {
					try {
						return await realpath(skill.filePath);
					} catch {
						return undefined;
					}
				}),
		);
		advertisedSkillPaths = new Set(canonicalPaths.filter((path): path is string => path !== undefined));
	});

	pi.on("tool_result", async (event, ctx) => {
		try {
			return await virtualizeToolResult(event as ToolResultEventLike, store, {
				cwd: ctx.cwd,
				advertisedSkillPaths,
			});
		} catch {
			return undefined;
		}
	});

	pi.on("context", async (event) => {
		try {
			if (!Array.isArray(event.messages)) return undefined;
			const compacted = compactProviderContextMessages(event.messages);
			return compacted.compactedToolCallArgumentCount === 0 ? undefined : { messages: compacted.messages };
		} catch {
			return undefined;
		}
	});
}
