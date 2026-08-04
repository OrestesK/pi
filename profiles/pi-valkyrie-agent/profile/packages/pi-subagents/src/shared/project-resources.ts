export type ProjectResourcesPolicy = "inherit" | "ignore";

export const PROJECT_RESOURCES_ENV = "PI_SUBAGENT_PROJECT_RESOURCES";
export const PROFILE_MCP_CONFIG_ENV = "PI_PROFILE_MCP_CONFIG";
export const RUNTIME_EXTENSIONS_ENV = "PI_SUBAGENT_RUNTIME_EXTENSIONS";
export const MCP_EXTENSION_ENV = "PI_SUBAGENT_MCP_EXTENSION";
export const SKILLS_ROOT_ENV = "PI_SUBAGENT_SKILLS_ROOT";

export function projectResourcesIgnored(
	env: NodeJS.ProcessEnv = process.env,
): boolean {
	return env[PROJECT_RESOURCES_ENV] === "ignore";
}
