import type { AgentScope } from "./agents.ts";
import { projectResourcesIgnored } from "../shared/project-resources.ts";

export function resolveExecutionAgentScope(scope: unknown): AgentScope {
	if (projectResourcesIgnored()) return "user";
	if (scope === "user" || scope === "project" || scope === "both") return scope;
	return "both";
}
