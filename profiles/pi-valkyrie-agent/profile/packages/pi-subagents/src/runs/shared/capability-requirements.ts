import type { AgentConfig } from "../../agents/agents.ts";
import { getStepAgents, isDynamicFanoutStep, isParallelStep, type ChainStep } from "../../shared/settings.ts";
import type {
	ExtensionConfig,
	ToolExtensionRequest,
} from "../../shared/types.ts";
import { resolveToolExtensionAgent } from "./tool-extensions.ts";

export const SUBAGENT_CAPABILITY_IDS = [
	"mcp",
	"direct-mcp",
	"custom-extension",
] as const;

export type SubagentCapability = (typeof SUBAGENT_CAPABILITY_IDS)[number];

type CapabilityTask = {
	agent?: string;
	requiresCapabilities?: SubagentCapability[];
	toolExtensions?: ToolExtensionRequest;
};

type CapabilityParams = {
	agent?: string;
	requiresCapabilities?: SubagentCapability[];
	tasks?: CapabilityTask[];
	chain?: ChainStep[];
	toolExtensions?: ToolExtensionRequest;
};

function isExtensionTool(tool: string): boolean {
	return tool.includes("/") || tool.endsWith(".ts") || tool.endsWith(".js");
}

export function agentSatisfiesCapability(
	agent: AgentConfig,
	capability: SubagentCapability,
): boolean {
	if (capability === "mcp") return (agent.tools ?? []).includes("mcp");
	if (capability === "direct-mcp") return (agent.mcpDirectTools?.length ?? 0) > 0;
	return (
		agent.extensions === undefined || agent.extensions.length > 0 || (agent.tools ?? []).some(isExtensionTool)
	);
}

function formatCapabilityList(capabilities: readonly SubagentCapability[]): string {
	return capabilities.join(", ");
}

function validateTaskCapabilities(
	task: CapabilityTask,
	agentsByName: Map<string, AgentConfig>,
	location: string,
	extensionConfig?: ExtensionConfig,
): string | undefined {
	const required = task.requiresCapabilities ?? [];
	if (required.length === 0) return undefined;
	if (!task.agent) {
		return `Capability mismatch: ${location} declares ${formatCapabilityList(required)}, but capability requirements must be attached to a concrete agent-bearing task.`;
	}
	const baseAgent = agentsByName.get(task.agent);
	if (!baseAgent) return undefined;
	let agent = baseAgent;
	if (task.toolExtensions && extensionConfig) {
		try {
			agent = resolveToolExtensionAgent(
				[...agentsByName.values()],
				extensionConfig,
				task.agent,
				task.toolExtensions,
			);
		} catch (error) {
			return error instanceof Error ? error.message : String(error);
		}
	}
	const missing = required.filter(
		(capability) => !agentSatisfiesCapability(agent, capability),
	);
	if (missing.length === 0) return undefined;
	return `Capability mismatch: ${task.agent} (${location}) requires ${formatCapabilityList(missing)}, but that agent cannot satisfy ${missing.length === 1 ? "it" : "them"}. Choose an agent with the required capability, or have the parent perform that capability-gated work and pass sanitized findings to the child.`;
}

export function validateCapabilityRequirements(
	params: CapabilityParams,
	agents: AgentConfig[],
	extensionConfig?: ExtensionConfig,
): string | undefined {
	const agentsByName = new Map(agents.map((agent) => [agent.name, agent]));
	const validate = (task: CapabilityTask, location: string) =>
		validateTaskCapabilities(task, agentsByName, location, extensionConfig);
	const singleError = validate(params, "single task");
	if (singleError) return singleError;
	for (let i = 0; i < (params.tasks ?? []).length; i++) {
		const error = validate(
			params.tasks![i]!, `parallel task ${i + 1}`,
		);
		if (error) return error;
	}
	for (let stepIndex = 0; stepIndex < (params.chain ?? []).length; stepIndex++) {
		const step = params.chain![stepIndex]!;
		const wrapperError = validate(
			step as CapabilityTask,
			`chain step ${stepIndex + 1}`,
		);
		if (wrapperError) return wrapperError;
		if (isDynamicFanoutStep(step)) {
			const error = validate(
				step.parallel,
				`chain step ${stepIndex + 1} dynamic fanout task`,
			);
			if (error) return error;
			continue;
		}
		if (isParallelStep(step)) {
			for (let taskIndex = 0; taskIndex < step.parallel.length; taskIndex++) {
				const error = validate(
					step.parallel[taskIndex]!,
					`chain step ${stepIndex + 1} parallel task ${taskIndex + 1}`,
				);
				if (error) return error;
			}
			continue;
		}
		if (getStepAgents(step).length > 0) {
			const error = validate(
				step, `chain step ${stepIndex + 1}`,
			);
			if (error) return error;
		}
	}
	return undefined;
}
