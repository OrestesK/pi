import type { ToolExecutionContextLike } from "./extension-types.ts";
import type { ProvenanceResolver } from "./provenance.ts";
import type { StoreAccessContext } from "./store.ts";

function nonEmpty(value: string | undefined): string | undefined {
	const trimmed = value?.trim();
	return trimmed ? trimmed : undefined;
}

export function isSubagentProcess(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return (
		env.PI_SUBAGENT_CHILD === "1" ||
		nonEmpty(env.PI_SUBAGENT_RUN_ID) !== undefined ||
		nonEmpty(env.PI_SUBAGENT_CHILD_AGENT) !== undefined
	);
}

export async function resolveStoreAccess(
	resolver: ProvenanceResolver,
	context: ToolExecutionContextLike,
	env: NodeJS.ProcessEnv = process.env,
): Promise<StoreAccessContext> {
	const provenance = await resolver.resolve(context, env);
	const access: StoreAccessContext = {
		actor: isSubagentProcess(env) ? "subagent" : "parent",
	};
	if (provenance.projectId) access.projectId = provenance.projectId;
	return access;
}
