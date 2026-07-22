import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { isSubagentProcess, resolveStoreAccess } from "./access.ts";
import { defaultStoreRoot, resolveStoreLimits } from "./config.ts";
import { compactProviderContextMessages } from "./context.ts";
import { ResultDelegationService } from "./delegation.ts";
import type { ExtensionApiLike } from "./extension-types.ts";
import { RunBoundGrantRegistry } from "./grants.ts";
import { ProvenanceResolver } from "./provenance.ts";
import { ToolResultStore } from "./store.ts";
import { SubagentRpcClient } from "./subagent-rpc-client.ts";
import {
	createTelemetrySink,
	instrumentToolDefinition,
	recordTelemetry,
} from "./telemetry.ts";
import { buildToolResultTools } from "./tools.ts";
import {
	virtualizeToolResult,
	type ToolResultEventLike,
} from "./virtualize.ts";

export { parseToolResultVirtualizerReceipt } from "./receipt.ts";
export type { ParsedToolResultVirtualizerReceipt } from "./receipt.ts";

export default function piToolResultVirtualizer(pi: ExtensionApiLike) {
	const storeRoot = defaultStoreRoot();
	const store = new ToolResultStore(storeRoot, {
		limits: resolveStoreLimits(),
	});
	const provenanceResolver = new ProvenanceResolver(storeRoot);
	const grants = new RunBoundGrantRegistry(storeRoot);
	const telemetry = createTelemetrySink(storeRoot);
	const rpc = new SubagentRpcClient(pi.events);
	const delegation = new ResultDelegationService({
		store,
		resolveAccess: (context) => resolveStoreAccess(provenanceResolver, context),
		grants,
		rpc,
		packageRoot: dirname(dirname(fileURLToPath(import.meta.url))),
	});

	for (const tool of buildToolResultTools(
		store,
		(context) => resolveStoreAccess(provenanceResolver, context),
		grants,
		delegation,
	)) {
		pi.registerTool(instrumentToolDefinition(tool, telemetry));
	}

	pi.on("tool_result", async (event, ctx) => {
		try {
			const provenance = await provenanceResolver.resolve(ctx);
			return await virtualizeToolResult(event as ToolResultEventLike, store, {
				cwd: ctx.cwd,
				provenance,
				telemetry,
				delegationAvailable:
					!isSubagentProcess() && delegation.receiptActionAvailable(),
			});
		} catch {
			return undefined;
		}
	});

	pi.on("context", async (event) => {
		try {
			if (!Array.isArray(event.messages)) return undefined;
			const compacted = compactProviderContextMessages(event.messages);
			if (compacted.compactedToolCallArgumentCount === 0) return undefined;
			await recordTelemetry(telemetry, {
				type: "context_compaction_candidate",
				argumentCount: compacted.compactedToolCallArgumentCount,
				originalBytes: compacted.originalArgumentBytes,
				returnedBytes: compacted.returnedArgumentBytes,
			});
			return { messages: compacted.messages };
		} catch {
			return undefined;
		}
	});
}
