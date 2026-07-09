export type TextContent = { type: "text"; text: string };

export type JsonSchema = Record<string, unknown>;

export type ToolExecutionContextLike = {
	cwd: string;
};

export type AdvertisedSkillLike = {
	filePath: string;
	disableModelInvocation: boolean;
};

export type BeforeAgentStartEventLike = {
	systemPromptOptions: {
		skills?: AdvertisedSkillLike[];
	};
};

export type ToolDefinitionLike = {
	name: string;
	label: string;
	description: string;
	promptSnippet?: string;
	promptGuidelines?: string[];
	parameters: JsonSchema;
	execute(
		toolCallId: string,
		params: unknown,
		signal: AbortSignal | undefined,
		onUpdate: ((result: { content: TextContent[]; details?: Record<string, unknown> }) => void) | undefined,
		ctx: ToolExecutionContextLike,
	): Promise<{ content: TextContent[]; details?: Record<string, unknown> }>;
};

export type ExtensionApiLike = {
	registerTool(definition: ToolDefinitionLike): void;
	on(event: "before_agent_start", handler: (event: BeforeAgentStartEventLike, ctx: ToolExecutionContextLike) => Promise<unknown>): void;
	on(event: "tool_result", handler: (event: unknown, ctx: ToolExecutionContextLike) => Promise<unknown>): void;
	on(event: "context", handler: (event: { messages?: unknown }, ctx: ToolExecutionContextLike) => Promise<unknown>): void;
};
