import type { AgentScope, AgentConfig } from "./agents.ts";

const PROTECTED_ADVISORY_AGENT_NAMES = new Set([
	"context-builder",
	"delegate",
	"oracle",
	"planner",
	"researcher",
	"reviewer",
	"scout",
]);

const LOCAL_TREE_SITTER_MCP_DIRECT_TOOL = "tree-sitter";

const TREE_SITTER_INSPECTION_TOOLS = [
	"tree_sitter_search_symbols",
	"tree_sitter_document_symbols",
	"tree_sitter_symbol_definition",
	"tree_sitter_pattern_search",
	"tree_sitter_codebase_overview",
	"tree_sitter_codebase_map",
];

const TREE_SITTER_INSPECTION_TOOL_NAMES = new Set(TREE_SITTER_INSPECTION_TOOLS);

const LOCAL_CODE_INSPECTION_TOOLS = [
	...TREE_SITTER_INSPECTION_TOOLS,
	"ast_grep_search",
	"lsp_navigation",
	"lsp_diagnostics",
];

const ADVISORY_DEFAULT_TOOLS: Record<string, string[]> = {
	"context-builder": [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"code_search",
		"web_search",
		"fetch_content",
		"get_search_content",
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
	delegate: [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"memory_search",
		"memory_list",
		"contact_supervisor",
	],
	oracle: [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
	planner: [
		"read",
		"grep",
		"find",
		"ls",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
	researcher: [
		"read",
		"code_search",
		"web_search",
		"fetch_content",
		"get_search_content",
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
	reviewer: [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
	scout: [
		"read",
		"grep",
		"find",
		"ls",
		"bash",
		...LOCAL_CODE_INSPECTION_TOOLS,
		"memory_search",
		"memory_list",
		"contact_supervisor",
		"intercom",
	],
};

const ADVISORY_ALLOWED_TOOLS = new Set([
	"read",
	"grep",
	"find",
	"ls",
	"bash",
	"contact_supervisor",
	"intercom",
	"tree_sitter_search_symbols",
	"tree_sitter_document_symbols",
	"tree_sitter_symbol_definition",
	"tree_sitter_pattern_search",
	"tree_sitter_codebase_overview",
	"tree_sitter_codebase_map",
	"ast_grep_search",
	"lsp_navigation",
	"lsp_diagnostics",
	"code_search",
	"web_search",
	"fetch_content",
	"get_search_content",
	"memory_search",
	"memory_list",
]);

const EXTENSION_BACKED_ADVISORY_TOOLS = new Set([
	"code_search",
	"web_search",
	"fetch_content",
	"get_search_content",
	"memory_search",
	"memory_list",
]);

const RESEARCH_EXTENSION_BACKED_TOOLS = new Set([
	"code_search",
	"web_search",
	"fetch_content",
	"get_search_content",
	"memory_search",
	"memory_list",
]);

const MEMORY_EXTENSION_BACKED_TOOLS = new Set(["memory_search", "memory_list"]);

const ROLE_EXTENSION_BACKED_ADVISORY_TOOLS: Record<string, Set<string>> = {
	"context-builder": RESEARCH_EXTENSION_BACKED_TOOLS,
	delegate: MEMORY_EXTENSION_BACKED_TOOLS,
	oracle: MEMORY_EXTENSION_BACKED_TOOLS,
	planner: MEMORY_EXTENSION_BACKED_TOOLS,
	researcher: RESEARCH_EXTENSION_BACKED_TOOLS,
	reviewer: MEMORY_EXTENSION_BACKED_TOOLS,
	scout: MEMORY_EXTENSION_BACKED_TOOLS,
};

const LOCAL_CODE_ADVISORY_AGENT_NAMES = new Set([
	"context-builder",
	"delegate",
	"oracle",
	"planner",
	"reviewer",
	"scout",
]);

function protectedAdvisoryRoleName(agent: AgentConfig): string {
	const rawName = agent.localName ?? agent.name;
	const normalized = rawName.trim().toLowerCase();
	return normalized.split(".").pop() ?? normalized;
}

export function isProtectedAdvisoryAgentConfig(agent: AgentConfig): boolean {
	return PROTECTED_ADVISORY_AGENT_NAMES.has(protectedAdvisoryRoleName(agent));
}

export function sanitizeProtectedAdvisoryAgentTools(
	agent: AgentConfig,
): AgentConfig {
	const roleName = protectedAdvisoryRoleName(agent);
	if (!PROTECTED_ADVISORY_AGENT_NAMES.has(roleName)) return agent;
	const defaultTools = ADVISORY_DEFAULT_TOOLS[roleName]!;
	const roleExtensionBackedTools =
		ROLE_EXTENSION_BACKED_ADVISORY_TOOLS[roleName]!;
	const tools = (agent.tools ?? defaultTools).filter((tool) => {
		if (!ADVISORY_ALLOWED_TOOLS.has(tool)) return false;
		if (!EXTENSION_BACKED_ADVISORY_TOOLS.has(tool)) return true;
		return roleExtensionBackedTools.has(tool);
	});
	const wantsTreeSitter = LOCAL_CODE_ADVISORY_AGENT_NAMES.has(roleName)
		&& tools.some((tool) => TREE_SITTER_INSPECTION_TOOL_NAMES.has(tool));
	const mcpDirectTools = wantsTreeSitter
		? [LOCAL_TREE_SITTER_MCP_DIRECT_TOOL]
		: undefined;
	const {
		mcpDirectTools: _mcpDirectTools,
		extensions: _extensions,
		...rest
	} = agent;
	const needsDefaultExtensions = tools.some((tool) =>
		roleExtensionBackedTools.has(tool),
	);
	return needsDefaultExtensions
		? { ...rest, tools, ...(mcpDirectTools ? { mcpDirectTools } : {}) }
		: {
				...rest,
				tools,
				...(mcpDirectTools ? { mcpDirectTools } : {}),
				extensions: [],
			};
}

export function mergeAgentsForScope(
	scope: AgentScope,
	userAgents: AgentConfig[],
	projectAgents: AgentConfig[],
	builtinAgents: AgentConfig[] = [],
): AgentConfig[] {
	const agentMap = new Map<string, AgentConfig>();

	for (const agent of builtinAgents)
		agentMap.set(agent.name, sanitizeProtectedAdvisoryAgentTools(agent));

	if (scope === "both") {
		for (const agent of userAgents)
			agentMap.set(agent.name, sanitizeProtectedAdvisoryAgentTools(agent));
		for (const agent of projectAgents)
			agentMap.set(agent.name, sanitizeProtectedAdvisoryAgentTools(agent));
	} else if (scope === "user") {
		for (const agent of userAgents)
			agentMap.set(agent.name, sanitizeProtectedAdvisoryAgentTools(agent));
	} else {
		for (const agent of projectAgents)
			agentMap.set(agent.name, sanitizeProtectedAdvisoryAgentTools(agent));
	}

	return Array.from(agentMap.values());
}
