import {
	ackLedgerMessage,
	appendLedgerMessage,
	listLedgerMessages,
	popUnreadLedgerMessages,
	type MessageLedgerOptions,
} from "./message-ledger.ts";
import type { TeamMessageAckAction, TeamMessageRecord } from "./team-types.ts";

const MAILBOX_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const TEAM_MAILBOX_DIRECTORY = "mailboxes";

export interface AppendTeamMessageInput {
	from: string;
	to: string;
	text: string;
	urgent?: boolean;
}

export interface AckTeamMessageInput {
	by: string;
	action: TeamMessageAckAction;
	reason: string;
}

export type TeamMailboxOptions = MessageLedgerOptions;

function validateMailboxName(name: string): void {
	if (!MAILBOX_NAME_RE.test(name) || name === "." || name === "..") throw new Error(`Invalid team mailbox name: ${name}`);
}

function teamInbox(agentName: string) {
	validateMailboxName(agentName);
	return { directory: TEAM_MAILBOX_DIRECTORY, name: agentName };
}

function isAckAction(value: unknown): value is TeamMessageAckAction {
	return value === "accepted" || value === "rejected" || value === "blocked";
}

function translateLedgerError(error: unknown): never {
	if (error instanceof Error && error.message.includes("outside message ledger root")) {
		throw new Error(error.message.replace(/message ledger root/g, "team run dir"));
	}
	throw error;
}

export async function appendTeamMessage(teamRunDir: string, input: AppendTeamMessageInput, options: TeamMailboxOptions = {}): Promise<TeamMessageRecord> {
	if (!input.from.trim()) throw new Error("Team message from must not be empty");
	if (!input.to.trim()) throw new Error("Team message to must not be empty");
	if (!input.text.trim()) throw new Error("Team message text must not be empty");
	try {
		return await appendLedgerMessage(teamRunDir, teamInbox(input.to), {
			from: input.from,
			to: input.to,
			text: input.text,
			urgent: input.urgent,
		}, options);
	} catch (error) {
		translateLedgerError(error);
	}
}

export async function listTeamMessages(teamRunDir: string, agentName: string): Promise<TeamMessageRecord[]> {
	try {
		return await listLedgerMessages(teamRunDir, teamInbox(agentName));
	} catch (error) {
		translateLedgerError(error);
	}
}

export async function popUnreadTeamMessages(teamRunDir: string, agentName: string): Promise<TeamMessageRecord[]> {
	try {
		return await popUnreadLedgerMessages(teamRunDir, teamInbox(agentName));
	} catch (error) {
		translateLedgerError(error);
	}
}

export async function ackTeamMessage(
	teamRunDir: string,
	agentName: string,
	messageId: string,
	input: AckTeamMessageInput,
	options: TeamMailboxOptions = {},
): Promise<TeamMessageRecord> {
	if (!messageId.trim()) throw new Error("Team message id must not be empty");
	if (!input.by.trim()) throw new Error("Team message acknowledgement by must not be empty");
	if (!input.reason.trim()) throw new Error("Team message acknowledgement reason must not be empty");
	if (!isAckAction(input.action)) throw new Error(`Invalid team message acknowledgement action: ${input.action}`);
	try {
		return await ackLedgerMessage(teamRunDir, teamInbox(agentName), messageId, input, options);
	} catch (error) {
		if (error instanceof Error && error.message === `Message not found: ${messageId}`) {
			throw new Error(`Team message not found: ${messageId}`);
		}
		translateLedgerError(error);
	}
}
