import type { AgentConfig } from "../../agents/agents.ts";
import type {
	ExtensionConfig,
	ToolExtensionRequest,
	ToolExtensionRegistry,
} from "../../shared/types.ts";

const BUILTIN_TOOL_NAMES = new Set(["mcp"]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function validateToolExtensionRegistry(
	registry: unknown,
): asserts registry is ToolExtensionRegistry {
	if (!isRecord(registry))
		throw new Error("Malformed tool extension registry.");
	for (const [id, bundle] of Object.entries(registry)) {
		if (
			!isRecord(bundle) ||
			typeof bundle.description !== "string" ||
			!Array.isArray(bundle.builtinTools) ||
			!Array.isArray(bundle.allowedAgents)
		) {
			throw new Error(`Malformed tool extension bundle '${id}'.`);
		}
		if (
			bundle.allowedAgents.length === 0 ||
			bundle.allowedAgents.some(
				(agent) => typeof agent !== "string" || agent.length === 0,
			)
		) {
			throw new Error(
				`Tool extension bundle '${id}' allowedAgents must contain at least one agent.`,
			);
		}
		for (const toolName of bundle.builtinTools) {
			if (typeof toolName !== "string" || !BUILTIN_TOOL_NAMES.has(toolName)) {
				throw new Error(
					`Unknown builtin tool '${String(toolName)}' in bundle '${id}'.`,
				);
			}
		}
	}
}

function validateRegistry(
	registry: unknown,
	agents: readonly AgentConfig[],
): asserts registry is ToolExtensionRegistry {
	validateToolExtensionRegistry(registry);
	for (const [id, bundle] of Object.entries(registry)) {
		for (const agentName of bundle.allowedAgents) {
			if (!agents.some((agent) => agent.name === agentName)) {
				throw new Error(
					`Tool extension bundle '${id}' references unknown agent '${agentName}'.`,
				);
			}
		}
	}
}

export function resolveToolExtensionAgent(
	agents: readonly AgentConfig[],
	config: ExtensionConfig,
	agentName: string,
	request?: ToolExtensionRequest,
): AgentConfig {
	const baseAgent = agents.find((agent) => agent.name === agentName);
	if (!baseAgent) throw new Error(`Unknown agent '${agentName}'.`);
	const bundleIds = request?.add;
	if (bundleIds === undefined) return baseAgent;
	if (
		!Array.isArray(bundleIds) ||
		bundleIds.some((id) => typeof id !== "string" || id.length === 0)
	) {
		throw new Error("toolExtensions.add must contain non-empty bundle IDs.");
	}
	if (bundleIds.length === 0) return baseAgent;

	const registry = config.toolExtensions ?? {};
	validateRegistry(registry, agents);
	const additions: string[] = [];
	const seenAdditions = new Set<string>();
	for (const id of bundleIds) {
		if (!Object.keys(registry).includes(id)) {
			throw new Error(`Unknown tool extension bundle '${id}'.`);
		}
		const bundle = registry[id];
		if (!bundle.allowedAgents.includes(agentName)) {
			throw new Error(
				`Agent '${agentName}' is not allowed to use bundle '${id}'.`,
			);
		}
		for (const toolName of bundle.builtinTools) {
			if (!seenAdditions.has(toolName)) {
				seenAdditions.add(toolName);
				additions.push(toolName);
			}
		}
	}

	const mergedTools = [...(baseAgent.tools ?? [])];
	const seenTools = new Set(mergedTools);
	for (const toolName of additions) {
		if (!seenTools.has(toolName)) {
			seenTools.add(toolName);
			mergedTools.push(toolName);
		}
	}
	return { ...baseAgent, tools: mergedTools };
}
