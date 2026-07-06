import {
	ackLedgerMessage,
	appendLedgerMessage,
	listLedgerMessages,
	markLedgerMessagesPresented,
	type AckLedgerMessageInput,
	type MessageLedgerOptions,
	type MessageLedgerRecord,
} from "./message-ledger.ts";

const SUPERVISOR_DIRECTORY = "supervisor-inbox";
const SUPERVISOR_NAME_RE = /^[A-Za-z0-9_.-]+$/;

export type SupervisorMessageAckAction = AckLedgerMessageInput["action"];
export type SupervisorMessageRecord = MessageLedgerRecord;

export interface AppendSupervisorMessageInput {
	toIndex: number;
	agent: string;
	text: string;
	urgent?: boolean;
	from?: string;
}

export interface AckSupervisorMessageInput {
	by: string;
	action: SupervisorMessageAckAction;
	reason: string;
}

function validateChildIndex(index: number): void {
	if (!Number.isInteger(index) || index < 0) {
		throw new Error(`Supervisor message child index must be a non-negative integer: ${index}`);
	}
}

function validateAgentName(agent: string): void {
	if (!agent.trim()) throw new Error("Supervisor message agent must not be empty");
	if (!SUPERVISOR_NAME_RE.test(agent)) throw new Error(`Invalid supervisor message agent name: ${agent}`);
}

export function supervisorInboxName(index: number): string {
	validateChildIndex(index);
	return `child-${index}`;
}

function supervisorInbox(index: number) {
	return { directory: SUPERVISOR_DIRECTORY, name: supervisorInboxName(index) };
}

export async function appendSupervisorMessage(
	runDir: string,
	input: AppendSupervisorMessageInput,
	options: MessageLedgerOptions = {},
): Promise<SupervisorMessageRecord> {
	validateChildIndex(input.toIndex);
	validateAgentName(input.agent);
	return appendLedgerMessage(runDir, supervisorInbox(input.toIndex), {
		from: input.from ?? "supervisor",
		to: supervisorInboxName(input.toIndex),
		text: input.text,
		urgent: input.urgent,
		metadata: { agent: input.agent, index: input.toIndex },
	}, options);
}

export async function listSupervisorMessages(runDir: string, index: number): Promise<SupervisorMessageRecord[]> {
	return listLedgerMessages(runDir, supervisorInbox(index));
}

export async function listPendingSupervisorMessages(runDir: string, index: number): Promise<SupervisorMessageRecord[]> {
	const messages = await listSupervisorMessages(runDir, index);
	return messages.filter((message) => !message.ackAction);
}

export async function markSupervisorMessagesPresented(
	runDir: string,
	index: number,
	messageIds: string[],
	options: MessageLedgerOptions = {},
): Promise<SupervisorMessageRecord[]> {
	return markLedgerMessagesPresented(runDir, supervisorInbox(index), messageIds, options);
}

export async function ackSupervisorMessage(
	runDir: string,
	index: number,
	messageId: string,
	input: AckSupervisorMessageInput,
	options: MessageLedgerOptions = {},
): Promise<SupervisorMessageRecord> {
	return ackLedgerMessage(runDir, supervisorInbox(index), messageId, input, options);
}

export function formatSupervisorMessagesForContext(messages: SupervisorMessageRecord[]): string {
	if (messages.length === 0) return "";
	const lines = [
		"# Supervisor messages",
		"The parent supervisor sent the following message(s). Call ack_supervisor_message before continuing. If a message conflicts with your role or safety contract, acknowledge it with action rejected or blocked and explain why.",
	];
	for (const message of messages) {
		const urgent = message.urgent ? " [urgent]" : "";
		lines.push("", `SUPERVISOR MESSAGE ${message.id}${urgent}:`, message.text.trim());
	}
	return lines.join("\n");
}

export function summarizeSupervisorMessages(messages: SupervisorMessageRecord[]): string | undefined {
	const pending = messages.filter((message) => !message.ackAction);
	if (pending.length === 0) return undefined;
	const urgent = pending.filter((message) => message.urgent).length;
	const suffix = urgent > 0 ? ` (${urgent} urgent)` : "";
	return `${pending.length} pending supervisor message${pending.length === 1 ? "" : "s"}${suffix}`;
}
