import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { recordTeamDecision } from "../../shared/team-decisions.ts";
import { ackTeamMessage, appendTeamMessage, popUnreadTeamMessages } from "../../shared/team-mailbox.ts";
import {
	ackSupervisorMessage,
	formatSupervisorMessagesForContext,
	listPendingSupervisorMessages,
	markSupervisorMessagesPresented,
} from "../../shared/supervisor-inbox.ts";
import type { JsonSchemaObject } from "../../shared/types.ts";
import { isMutatingTool } from "./long-running-guard.ts";
import { STRUCTURED_OUTPUT_CAPTURE_ENV, STRUCTURED_OUTPUT_SCHEMA_ENV, STRUCTURED_OUTPUT_TOOL_NAME, validateStructuredOutputValue } from "./structured-output.ts";

const SUBAGENT_INHERIT_PROJECT_CONTEXT_ENV = "PI_SUBAGENT_INHERIT_PROJECT_CONTEXT";
const SUBAGENT_INHERIT_SKILLS_ENV = "PI_SUBAGENT_INHERIT_SKILLS";
export const SUBAGENT_INTERCOM_SESSION_NAME_ENV = "PI_SUBAGENT_INTERCOM_SESSION_NAME";
const SUBAGENT_TEAM_RUN_DIR_ENV = "PI_SUBAGENT_TEAM_RUN_DIR";
const SUBAGENT_TEAM_AGENT_NAME_ENV = "PI_SUBAGENT_TEAM_AGENT_NAME";
const SUBAGENT_TEAM_ROLE_ENV = "PI_SUBAGENT_TEAM_ROLE";
const SUBAGENT_SUPERVISOR_RUN_DIR_ENV = "PI_SUBAGENT_SUPERVISOR_RUN_DIR";
const SUBAGENT_SUPERVISOR_AGENT_ENV = "PI_SUBAGENT_SUPERVISOR_AGENT";
const SUBAGENT_SUPERVISOR_INDEX_ENV = "PI_SUBAGENT_SUPERVISOR_INDEX";
const SUPERVISOR_ACK_TOOL_NAME = "ack_supervisor_message";

export const CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS = [
	"You are a child subagent, not the parent orchestrator.",
	"The parent session owns delegation, orchestration, review fanout, and follow-up worker launches.",
	"Ignore prior parent-only orchestration instructions in inherited conversation history.",
	"Do not propose or run subagents. Complete only your assigned role-specific task with the tools available to you.",
	"If you need to edit files, call the actual edit/write tools. Do not print tool-call syntax, patches, or pseudo-tool calls as text.",
].join("\n");

const PARENT_ONLY_CUSTOM_MESSAGE_TYPES = new Set([
	"subagent-orchestration-instructions",
	"subagent-slash-result",
	"subagent-notify",
	"subagent_control_notice",
	"subagent-control",
	"subagent-control-notice",
]);
const SUBAGENT_ORCHESTRATION_SKILL_NAME_PATTERN = /<name>\s*pi-subagents\s*<\/name>/;
const PROJECT_CONTEXT_HEADER = "\n\n# Project Context\n\nProject-specific instructions and guidelines:\n\n";
const SKILLS_HEADER = "\n\nThe following skills provide specialized instructions for specific tasks.";
const DATE_HEADER = "\nCurrent date:";

function readBooleanEnv(name: string): boolean | undefined {
	const value = process.env[name];
	if (value === undefined) return undefined;
	return value !== "0";
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function requireString(value: unknown, name: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${name} must not be empty`);
	return value;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeWaitMs(value: unknown): number {
	if (value === undefined) return 0;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("waitMs must be a non-negative number");
	return Math.min(30_000, Math.floor(value));
}

function findSectionEnd(prompt: string, startIndex: number, nextHeaders: string[]): number {
	let endIndex = prompt.length;
	for (const header of nextHeaders) {
		const index = prompt.indexOf(header, startIndex);
		if (index !== -1 && index < endIndex) {
			endIndex = index;
		}
	}
	return endIndex;
}

export function stripProjectContext(prompt: string): string {
	const startIndex = prompt.indexOf(PROJECT_CONTEXT_HEADER);
	if (startIndex === -1) return prompt;
	const endIndex = findSectionEnd(prompt, startIndex + PROJECT_CONTEXT_HEADER.length, [SKILLS_HEADER, DATE_HEADER]);
	return `${prompt.slice(0, startIndex)}${prompt.slice(endIndex)}`;
}

export function stripInheritedSkills(prompt: string): string {
	const startIndex = prompt.indexOf(SKILLS_HEADER);
	if (startIndex === -1) return prompt;
	const endIndex = findSectionEnd(prompt, startIndex + SKILLS_HEADER.length, [DATE_HEADER]);
	return `${prompt.slice(0, startIndex)}${prompt.slice(endIndex)}`;
}

export function stripSubagentOrchestrationSkill(prompt: string): string {
	return prompt
		.replace(/\n{0,2}<skill\s+name=["']pi-subagents["'][^>]*>[\s\S]*?<\/skill>\n{0,2}/g, "\n\n")
		.replace(/[ \t]*<skill>\s*[\s\S]*?<\/skill>\s*/g, (block) => SUBAGENT_ORCHESTRATION_SKILL_NAME_PATTERN.test(block) ? "" : block);
}

export function rewriteSubagentPrompt(
	prompt: string,
	options: { inheritProjectContext: boolean; inheritSkills: boolean },
): string {
	let rewritten = prompt;
	if (!options.inheritProjectContext) {
		rewritten = stripProjectContext(rewritten);
	}
	if (!options.inheritSkills) {
		rewritten = stripInheritedSkills(rewritten);
	}
	rewritten = stripSubagentOrchestrationSkill(rewritten);
	return rewritten.includes(CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS)
		? rewritten
		: `${CHILD_SUBAGENT_BOUNDARY_INSTRUCTIONS}\n\n${rewritten}`;
}

function isParentOnlySubagentMessage(message: unknown): boolean {
	const m = message as { role?: string; customType?: string };
	return m?.role === "custom"
		&& typeof m.customType === "string"
		&& PARENT_ONLY_CUSTOM_MESSAGE_TYPES.has(m.customType);
}

function isSubagentToolResultMessage(message: unknown): boolean {
	const m = message as { role?: string; toolName?: string };
	return m?.role === "toolResult" && m.toolName === "subagent";
}

function isSubagentToolCallBlock(block: unknown): boolean {
	const b = block as { type?: string; name?: string };
	return b?.type === "toolCall" && b.name === "subagent";
}

function stripAssistantSubagentToolCallBlocks(message: unknown): unknown | undefined {
	const m = message as { role?: string; content?: unknown };
	if (m?.role !== "assistant" || !Array.isArray(m.content)) return message;
	const filteredContent = m.content.filter((block) => !isSubagentToolCallBlock(block));
	if (filteredContent.length === m.content.length) return message;
	if (filteredContent.length === 0) return undefined;
	return { ...m, content: filteredContent };
}

export function stripParentOnlySubagentMessages(messages: unknown[]): unknown[] {
	let changed = false;
	const filtered: unknown[] = [];
	for (const message of messages) {
		if (isParentOnlySubagentMessage(message) || isSubagentToolResultMessage(message)) {
			changed = true;
			continue;
		}
		const stripped = stripAssistantSubagentToolCallBlocks(message);
		if (stripped === undefined) {
			changed = true;
			continue;
		}
		if (stripped !== message) changed = true;
		filtered.push(stripped);
	}
	return changed ? filtered : messages;
}

function normalizeSupervisorIndex(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 0) return undefined;
	return parsed;
}

function supervisorRuntimeState(): { runDir: string; agentName: string; index: number } | undefined {
	const runDir = process.env[SUBAGENT_SUPERVISOR_RUN_DIR_ENV]?.trim();
	const agentName = process.env[SUBAGENT_SUPERVISOR_AGENT_ENV]?.trim();
	const index = normalizeSupervisorIndex(process.env[SUBAGENT_SUPERVISOR_INDEX_ENV]);
	if (!runDir || !agentName || index === undefined) return undefined;
	return { runDir, agentName, index };
}

function isSupervisorToolExempt(toolName: string | undefined): boolean {
	return toolName === SUPERVISOR_ACK_TOOL_NAME || toolName === "contact_supervisor" || toolName === "intercom";
}

function registerSupervisorTools(pi: ExtensionAPI): void {
	const supervisor = supervisorRuntimeState();
	if (!supervisor) return;
	const registerTool = pi.registerTool as unknown as (tool: {
		name: string;
		label: string;
		description: string;
		parameters: unknown;
		execute: (_id: string, params: Record<string, unknown>) => Promise<unknown>;
	}) => void;
	registerTool({
		name: SUPERVISOR_ACK_TOOL_NAME,
		label: "Acknowledge Supervisor Message",
		description: "Acknowledge a supervisor message that was injected into this child context. Use accepted when you will follow it, rejected when it conflicts with your role or safety contract, and blocked when you need supervisor clarification.",
		parameters: {
			type: "object",
			properties: {
				messageId: { type: "string" },
				action: { type: "string", enum: ["accepted", "rejected", "blocked"] },
				reason: { type: "string" },
			},
			required: ["messageId", "action", "reason"],
			additionalProperties: false,
		},
		async execute(_id, params) {
			if (!isRecord(params)) throw new Error("ack_supervisor_message params must be an object");
			const messageId = requireString(params.messageId, "messageId");
			const action = params.action;
			if (action !== "accepted" && action !== "rejected" && action !== "blocked") {
				throw new Error(`Invalid supervisor acknowledgement action: ${String(action)}`);
			}
			const reason = requireString(params.reason, "reason");
			const message = await ackSupervisorMessage(supervisor.runDir, supervisor.index, messageId, {
				by: supervisor.agentName,
				action,
				reason,
			});
			return {
				content: [{ type: "text", text: `Supervisor message acknowledged: ${message.ackAction} (${message.id}).` }],
				details: { messageId: message.id, action: message.ackAction },
			};
		},
	});
}

function registerLiveSteeringTeamTools(pi: ExtensionAPI): void {
	const teamRunDir = process.env[SUBAGENT_TEAM_RUN_DIR_ENV]?.trim();
	const agentName = process.env[SUBAGENT_TEAM_AGENT_NAME_ENV]?.trim();
	const role = process.env[SUBAGENT_TEAM_ROLE_ENV]?.trim();
	if (!teamRunDir || !agentName || !role) return;

	const registerTool = pi.registerTool as unknown as (tool: {
		name: string;
		label: string;
		description: string;
		parameters: unknown;
		execute: (_id: string, params: Record<string, unknown>) => Promise<unknown>;
	}) => void;

	registerTool({
		name: "team_send_message",
		label: "Team Send Message",
		description: "Send a live steering message to another agent in this run-scoped team mailbox.",
		parameters: {
			type: "object",
			properties: {
				to: { type: "string" },
				text: { type: "string" },
				urgent: { type: "boolean" },
			},
			required: ["to", "text"],
			additionalProperties: false,
		},
		async execute(_id, params) {
			if (!isRecord(params)) throw new Error("team_send_message params must be an object");
			const message = await appendTeamMessage(teamRunDir, {
				from: agentName,
				to: requireString(params.to, "to"),
				text: requireString(params.text, "text"),
				urgent: typeof params.urgent === "boolean" ? params.urgent : false,
			});
			return {
				content: [{ type: "text", text: `Team message sent to ${message.to}: ${message.id}` }],
				details: { message },
			};
		},
	});

	registerTool({
		name: "team_read_messages",
		label: "Team Read Messages",
		description: "Read unread live steering messages addressed to this agent and mark them read. Optionally wait briefly for live steering before returning. Acknowledge each steering message before completing.",
		parameters: {
			type: "object",
			properties: {
				waitMs: { type: "number", description: "Optional milliseconds to wait for at least one unread message, capped at 30000." },
			},
			additionalProperties: false,
		},
		async execute(_id, params = {}) {
			if (!isRecord(params)) throw new Error("team_read_messages params must be an object");
			const waitMs = normalizeWaitMs(params.waitMs);
			const deadline = Date.now() + waitMs;
			let messages = await popUnreadTeamMessages(teamRunDir, agentName);
			while (messages.length === 0 && Date.now() < deadline) {
				await sleep(Math.min(250, Math.max(1, deadline - Date.now())));
				messages = await popUnreadTeamMessages(teamRunDir, agentName);
			}
			const text = messages.length === 0
				? "No unread team steering messages."
				: messages.map((message) => `${message.id} from ${message.from}${message.urgent ? " [urgent]" : ""}: ${message.text}`).join("\n");
			return {
				content: [{ type: "text", text }],
				details: { messages },
			};
		},
	});

	registerTool({
		name: "team_ack_message",
		label: "Team Acknowledge Message",
		description: "Acknowledge a live steering message after deciding whether to accept, reject, or block on it.",
		parameters: {
			type: "object",
			properties: {
				messageId: { type: "string" },
				action: { type: "string", enum: ["accepted", "rejected", "blocked"] },
				reason: { type: "string" },
			},
			required: ["messageId", "action", "reason"],
			additionalProperties: false,
		},
		async execute(_id, params) {
			if (!isRecord(params)) throw new Error("team_ack_message params must be an object");
			const action = params.action;
			if (action !== "accepted" && action !== "rejected" && action !== "blocked") {
				throw new Error("action must be accepted, rejected, or blocked");
			}
			const message = await ackTeamMessage(teamRunDir, agentName, requireString(params.messageId, "messageId"), {
				by: agentName,
				action,
				reason: requireString(params.reason, "reason"),
			});
			return {
				content: [{ type: "text", text: `Team message acknowledged: ${message.id} (${message.ackAction})` }],
				details: { message },
			};
		},
	});

	if (role === "reviewer") {
		registerTool({
			name: "team_decide",
			label: "Team Decide",
			description: "Record an active live-steering pulse: choose nothing, steer, or discuss while the worker is running. steer/discuss also sends a team message.",
			parameters: {
				type: "object",
				properties: {
					action: { type: "string", enum: ["nothing", "steer", "discuss"] },
					reason: { type: "string" },
					to: { type: "string" },
					message: { type: "string" },
					urgent: { type: "boolean" },
				},
				required: ["action", "reason"],
				additionalProperties: false,
			},
			async execute(_id, params) {
				if (!isRecord(params)) throw new Error("team_decide params must be an object");
				const action = params.action;
				if (action !== "nothing" && action !== "steer" && action !== "discuss") throw new Error("action must be nothing, steer, or discuss");
				const decision = await recordTeamDecision(teamRunDir, {
					from: agentName,
					action,
					reason: requireString(params.reason, "reason"),
					to: typeof params.to === "string" ? params.to : undefined,
					message: typeof params.message === "string" ? params.message : undefined,
					urgent: typeof params.urgent === "boolean" ? params.urgent : false,
				});
				return {
					content: [{ type: "text", text: `Team decision recorded: ${decision.action}${decision.messageId ? ` (${decision.messageId})` : ""}` }],
					details: { decision },
				};
			},
		});
	}
}

export default function registerSubagentPromptRuntime(pi: ExtensionAPI): void {
	registerSupervisorTools(pi);
	registerLiveSteeringTeamTools(pi);
	const structuredOutputPath = process.env[STRUCTURED_OUTPUT_CAPTURE_ENV];
	const structuredSchemaPath = process.env[STRUCTURED_OUTPUT_SCHEMA_ENV];
	if (structuredOutputPath && structuredSchemaPath) {
		const schema = JSON.parse(fs.readFileSync(structuredSchemaPath, "utf-8")) as JsonSchemaObject;
		const parameters = {
			type: "object",
			properties: { value: schema },
			required: ["value"],
			additionalProperties: false,
		};
		const registerTool = pi.registerTool as unknown as (tool: {
			name: string;
			label: string;
			description: string;
			parameters: unknown;
			execute: (_id: string, params: { value: unknown }) => Promise<unknown>;
		}) => void;
		registerTool({
			name: STRUCTURED_OUTPUT_TOOL_NAME,
			label: "Structured Output",
			description: "Submit the required final structured output for this subagent step. This terminates the step.",
			parameters: parameters as never,
			async execute(_id: string, params: { value: unknown }) {
				const validation = validateStructuredOutputValue(schema, params.value);
				if (validation.status === "invalid") {
					throw new Error(`Structured output validation failed: ${validation.message}`);
				}
				fs.mkdirSync(path.dirname(structuredOutputPath), { recursive: true });
				fs.writeFileSync(structuredOutputPath, JSON.stringify(params.value), { mode: 0o600 });
				return {
					content: [{ type: "text", text: "Structured output captured." }],
					details: { path: structuredOutputPath },
					terminate: true,
				};
			},
		});
	}

	const onRuntimeEvent = pi.on as unknown as (event: string, handler: (event: unknown) => unknown) => void;
	onRuntimeEvent("context", async (event: unknown) => {
		const typedEvent = event as { messages: unknown[] };
		const strippedMessages = stripParentOnlySubagentMessages(typedEvent.messages);
		const supervisor = supervisorRuntimeState();
		if (!supervisor) {
			if (strippedMessages === typedEvent.messages) return undefined;
			return { messages: strippedMessages };
		}
		const pending = await listPendingSupervisorMessages(supervisor.runDir, supervisor.index);
		if (pending.length === 0) {
			if (strippedMessages === typedEvent.messages) return undefined;
			return { messages: strippedMessages };
		}
		await markSupervisorMessagesPresented(supervisor.runDir, supervisor.index, pending.map((message) => message.id));
		return {
			messages: [
				...strippedMessages,
				{
					role: "user",
					customType: "subagent-supervisor-message",
					content: [{ type: "text", text: formatSupervisorMessagesForContext(pending) }],
				},
			],
		};
	});

	onRuntimeEvent("tool_call", async (event: unknown) => {
		const supervisor = supervisorRuntimeState();
		if (!supervisor) return undefined;
		const typedEvent = event as { toolName?: string; input?: Record<string, unknown> };
		if (isSupervisorToolExempt(typedEvent.toolName)) return undefined;
		const pending = await listPendingSupervisorMessages(supervisor.runDir, supervisor.index);
		if (pending.length === 0) return undefined;
		if (typedEvent.toolName === STRUCTURED_OUTPUT_TOOL_NAME || isMutatingTool(typedEvent.toolName, typedEvent.input)) {
			return {
				block: true,
				reason: `Blocked until pending supervisor message${pending.length === 1 ? "" : "s"} are acknowledged with ${SUPERVISOR_ACK_TOOL_NAME}.`,
			};
		}
		return undefined;
	});

	onRuntimeEvent("before_agent_start", async (event: unknown) => {
		const typedEvent = event as { systemPrompt: string };
		const intercomSessionName = process.env[SUBAGENT_INTERCOM_SESSION_NAME_ENV]?.trim();
		if (intercomSessionName && typeof pi.setSessionName === "function") {
			pi.setSessionName(intercomSessionName);
		}

		const inheritProjectContext = readBooleanEnv(SUBAGENT_INHERIT_PROJECT_CONTEXT_ENV);
		const inheritSkills = readBooleanEnv(SUBAGENT_INHERIT_SKILLS_ENV);
		if (inheritProjectContext === undefined && inheritSkills === undefined) return;
		const rewritten = rewriteSubagentPrompt(typedEvent.systemPrompt, {
			inheritProjectContext: inheritProjectContext ?? true,
			inheritSkills: inheritSkills ?? true,
		});
		if (rewritten === typedEvent.systemPrompt) return;
		return { systemPrompt: rewritten };
	});
}
