import { defaultStoreRoot } from "./config.ts";
import { compactProviderContextMessages } from "./context.ts";
import type { ExtensionApiLike } from "./extension-types.ts";
import { ToolResultStore } from "./store.ts";
import { buildToolResultTools } from "./tools.ts";
import { virtualizeToolResult, type ToolResultEventLike } from "./virtualize.ts";

export default function piToolResultVirtualizer(pi: ExtensionApiLike) {
	const store = new ToolResultStore(defaultStoreRoot());

	for (const tool of buildToolResultTools(store)) {
		pi.registerTool(tool);
	}

	pi.on("tool_result", async (event, ctx) => {
		try {
			return await virtualizeToolResult(event as ToolResultEventLike, store, { cwd: ctx.cwd });
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
