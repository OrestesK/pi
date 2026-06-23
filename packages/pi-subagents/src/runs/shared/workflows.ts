import type { ControlConfig, MaxOutputConfig } from "../../shared/types.ts";
import type { SubagentCapability } from "./capability-requirements.ts";

type WorkflowContext = "fresh" | "fork";
type WorkflowOutputMode = "inline" | "file-only";
type WorkflowSkill = string | string[] | boolean;

type WorkflowTask = {
	agent: string;
	task: string;
	output?: string | false;
	outputMode?: WorkflowOutputMode;
	reads?: string[] | false;
	progress?: boolean;
	requiresCapabilities?: SubagentCapability[];
	liveSteeringRole?: "worker" | "reviewer";
	liveSteeringAgentName?: string;
};

type WorkflowParallelStep = {
	parallel: WorkflowTask[];
	concurrency?: number;
};

type WorkflowSequentialStep = WorkflowTask;

type WorkflowChainStep = WorkflowParallelStep | WorkflowSequentialStep;

export type WorkflowParamsLike = {
	workflow?: string;
	task?: string;
	agent?: string;
	tasks?: unknown[];
	chain?: unknown[];
	action?: string;
	config?: unknown;
	chainName?: string;
	context?: WorkflowContext;
	async?: boolean;
	clarify?: boolean;
	concurrency?: number;
	cwd?: string;
	model?: string;
	skill?: WorkflowSkill;
	output?: string | boolean;
	outputMode?: WorkflowOutputMode;
	agentScope?: string;
	control?: ControlConfig;
	artifacts?: boolean;
	includeProgress?: boolean;
	share?: boolean;
	sessionDir?: string;
	maxOutput?: MaxOutputConfig;
};

export type ExpandedWorkflowParams = Omit<
	WorkflowParamsLike,
	| "workflow"
	| "agent"
	| "tasks"
	| "chain"
	| "action"
	| "config"
	| "chainName"
	| "model"
	| "skill"
	| "output"
	| "outputMode"
> & {
	tasks?: WorkflowTask[];
	chain?: WorkflowChainStep[];
	concurrency?: number;
	context: "fresh";
	async: false;
	liveSteeringTeam?: boolean;
};

export const BUILTIN_WORKFLOW_IDS = [
	"quality-gate",
	"research-decision",
	"generate-filter",
	"live-steering-team",
] as const;

type BuiltinWorkflowId = (typeof BUILTIN_WORKFLOW_IDS)[number];

function normalizeBuiltinWorkflowId(
	workflow: string,
): BuiltinWorkflowId | undefined {
	const trimmed = workflow.trim();
	if (!trimmed.startsWith("builtin.")) return undefined;
	const id = trimmed.slice("builtin.".length);
	return (BUILTIN_WORKFLOW_IDS as readonly string[]).includes(id)
		? (id as BuiltinWorkflowId)
		: undefined;
}

function conflictingWorkflowFields(params: WorkflowParamsLike): string[] {
	const conflicts: string[] = [];
	if (params.agent !== undefined) conflicts.push("agent");
	if (params.tasks !== undefined) conflicts.push("tasks");
	if (params.chain !== undefined) conflicts.push("chain");
	if (params.action !== undefined) conflicts.push("action");
	if (params.config !== undefined) conflicts.push("config");
	if (params.chainName !== undefined) conflicts.push("chainName");
	if (params.model !== undefined) conflicts.push("model");
	if (params.skill !== undefined) conflicts.push("skill");
	if (params.output !== undefined) conflicts.push("output");
	if (params.outputMode !== undefined) conflicts.push("outputMode");
	return conflicts;
}

function qualityGateTasks(target: string): WorkflowTask[] {
	return [
		{
			agent: "reviewer",
			task: `Quality gate: attack correctness, necessity, and regression risk for this target. Do not edit. Target:\n\n${target}`,
			output: false,
			progress: false,
		},
		{
			agent: "reviewer",
			task: `Quality gate: attack evidence, tests, verification, and approval boundaries for this target. Do not edit. Target:\n\n${target}`,
			output: false,
			progress: false,
		},
		{
			agent: "reviewer",
			task: `Quality gate: attack simplicity, scope, alternatives, and operational risk for this target. Do not edit. Target:\n\n${target}`,
			output: false,
			progress: false,
		},
	];
}

function researchDecisionTasks(target: string): WorkflowTask[] {
	return [
		{
			agent: "researcher",
			task: `Research decision: gather external/current evidence relevant to this decision. Do not edit. Return sources, confidence, risks, and implications. Decision target:\n\n${target}`,
			output: false,
			progress: false,
		},
		{
			agent: "scout",
			task: `Research decision: gather local repository/config context relevant to this decision. Do not edit or implement. Return files, constraints, risks, and likely verification surfaces. Decision target:\n\n${target}`,
			output: false,
			progress: false,
		},
		{
			agent: "reviewer",
			task: `Research decision: adversarially critique the decision and compare the strongest alternatives. Do not edit. Return must-fix objections, tradeoffs, and a recommended verdict shape. Decision target:\n\n${target}`,
			output: false,
			progress: false,
		},
	];
}

function liveSteeringTeamTasks(target: string): WorkflowTask[] {
	return [
		{
			agent: "worker",
			liveSteeringRole: "worker",
			liveSteeringAgentName: "worker-0",
			reads: false,
			progress: true,
			task: `Live steering worker. You are the only implementation/writer agent. Two live reviewers run in parallel and can steer you through the team mailbox.

Steering contract:
- Use team_read_messages at the start, after each major phase, and immediately before final output.
- For the final pre-completion read, allow reviewers a steering window by calling team_read_messages with waitMs: 10000.
- For every steering message you receive, call team_ack_message with action accepted, rejected, or blocked and a concrete reason before continuing.
- If you accept steering, visibly change course before completing and mention the message id in your final output.
- If you reject steering, explain why in the acknowledgement and final output.
- If you are blocked by steering, acknowledge with action blocked and stop with the blocker.
- Do not create summary, progress, or bookkeeping files unless the target task explicitly asks for them; put final reporting in your response.
- Do not complete while any reviewer steering message is unread or unacknowledged.

Target task:

${target}`,
		},
		{
			agent: "reviewer",
			liveSteeringRole: "reviewer",
			liveSteeringAgentName: "reviewer-1",
			reads: false,
			output: false,
			progress: false,
			task: `Live steering reviewer A. Do not edit files. Your job is to actively steer the worker while it is running.

Run a live pulse loop:
- Inspect the current worker direction, files, output, and any team messages available to you.
- Call team_decide repeatedly while the worker is active.
- Use action nothing when no intervention is needed right now, with a concrete reason.
- Use action steer addressed to worker-0 when you see a correctness, scope, or safety issue. Put the concrete instruction in message and use urgent:true for must-fix steering.
- Use action discuss when you need another reviewer to weigh in before steering.
- Pulse early and keep watching; active steering is the job.

Target task:

${target}`,
		},
		{
			agent: "reviewer",
			liveSteeringRole: "reviewer",
			liveSteeringAgentName: "reviewer-2",
			reads: false,
			output: false,
			progress: false,
			task: `Live steering reviewer B. Do not edit files. Your job is to actively steer the worker while it is running, focusing on verification evidence and readiness risks.

Run a live pulse loop:
- Inspect the current worker direction, files, output, and any team messages available to you.
- Call team_decide repeatedly while the worker is active.
- Use action nothing when no intervention is needed right now, with a concrete reason.
- Use action steer addressed to worker-0 for missing verification, weak evidence, or completion risks. Put the concrete instruction in message and use urgent:true for must-fix steering.
- Use action discuss when you need another reviewer to weigh in before steering.
- Pulse early and keep watching; active steering is the job.

Target task:

${target}`,
		},
	];
}

function generateFilterChain(target: string): WorkflowChainStep[] {
	return [
		{
			parallel: [
				{
					agent: "delegate",
					task: `Generate practical, low-risk options for this request. Return concrete options only; do not filter yet. Request:\n\n${target}`,
					output: false,
					progress: false,
				},
				{
					agent: "delegate",
					task: `Generate ambitious/high-upside options for this request. Return concrete options only; do not filter yet. Request:\n\n${target}`,
					output: false,
					progress: false,
				},
				{
					agent: "delegate",
					task: `Generate minimal/simplifying options for this request. Return concrete options only; do not filter yet. Request:\n\n${target}`,
					output: false,
					progress: false,
				},
			],
			concurrency: 3,
		},
		{
			agent: "reviewer",
			task: "Filter the generated options from {previous}. Dedupe aggressively, reject weak or duplicate ideas, rank the strongest few, include tradeoffs and the next validation step. Do not edit.",
			output: false,
			progress: false,
		},
	];
}

export function expandBuiltinWorkflowParams<T extends WorkflowParamsLike>(
	params: T,
): {
	params?: T | ExpandedWorkflowParams;
	error?: string;
	expanded?: boolean;
	routeLabel?: string;
} {
	if (params.workflow === undefined) return { params, expanded: false };
	if (
		typeof params.workflow !== "string" ||
		params.workflow.trim().length === 0
	) {
		return { error: "workflow must be a non-empty string." };
	}

	const conflicts = conflictingWorkflowFields(params);
	if (conflicts.length > 0) {
		return {
			error: `workflow is mutually exclusive with ${conflicts.join(", ")}. Use either a named workflow or explicit execution/management parameters, not both.`,
		};
	}

	const task = params.task?.trim();
	if (!task) return { error: "workflow requires a non-empty task." };

	if (params.async === true) {
		return {
			error:
				"builtin workflows are foreground by default because parent synthesis depends on their result. Omit async or set async:false.",
		};
	}

	if (params.context !== undefined && params.context !== "fresh") {
		return {
			error:
				"builtin workflows require context:'fresh' for independent review/research.",
		};
	}

	const workflowId = normalizeBuiltinWorkflowId(params.workflow);
	if (!workflowId) {
		return {
			error: `Unknown workflow: ${params.workflow}. Builtin workflows: ${BUILTIN_WORKFLOW_IDS.map((id) => `builtin.${id}`).join(", ")}.`,
		};
	}

	const {
		workflow: _workflow,
		agent: _agent,
		tasks: _tasks,
		chain: _chain,
		action: _action,
		config: _config,
		chainName: _chainName,
		model: _model,
		skill: _skill,
		output: _output,
		outputMode: _outputMode,
		...rest
	} = params;
	const base = {
		...rest,
		task,
		context: "fresh" as const,
		async: false as const,
	};

	if (workflowId === "generate-filter") {
		return {
			params: {
				...base,
				chain: generateFilterChain(task),
			},
			expanded: true,
			routeLabel: `builtin.${workflowId}`,
		};
	}

	if (workflowId === "live-steering-team") {
		return {
			params: {
				...base,
				liveSteeringTeam: true,
				tasks: liveSteeringTeamTasks(task),
				concurrency: 3,
			},
			expanded: true,
			routeLabel: `builtin.${workflowId}`,
		};
	}

	const tasks =
		workflowId === "quality-gate"
			? qualityGateTasks(task)
			: researchDecisionTasks(task);
	return {
		params: {
			...base,
			tasks,
			concurrency: 3,
		},
		expanded: true,
		routeLabel: `builtin.${workflowId}`,
	};
}
