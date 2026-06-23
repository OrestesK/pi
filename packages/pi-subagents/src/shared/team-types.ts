export type TeamTaskStatus = "pending" | "in_progress" | "blocked" | "completed" | "failed" | "cancelled";

export interface TeamTaskOwner {
	agent: string;
	childIndex: number;
	sessionId?: string;
	intercomTarget?: string;
}

export interface TeamTaskLease {
	acquiredAt: string;
	expiresAt: string;
	heartbeatAt?: string;
}

export interface TeamTaskRecord {
	id: string;
	runId: string;
	subject: string;
	description: string;
	status: TeamTaskStatus;
	owner?: TeamTaskOwner;
	blockedBy: string[];
	blocks: string[];
	lease?: TeamTaskLease;
	attempts: number;
	artifactRefs: string[];
	metadata: Record<string, unknown>;
	createdAt: string;
	updatedAt: string;
}

export type TeamMessageAckAction = "accepted" | "rejected" | "blocked";
export type TeamDecisionAction = "nothing" | "steer" | "discuss";

export interface TeamDecisionRecord {
	id: string;
	runId: string;
	from: string;
	action: TeamDecisionAction;
	reason: string;
	to?: string;
	message?: string;
	urgent: boolean;
	messageId?: string;
	createdAt: string;
}

export interface TeamMessageRecord {
	id: string;
	runId: string;
	from: string;
	to: string;
	text: string;
	urgent: boolean;
	read: boolean;
	createdAt: string;
	acknowledgedAt?: string;
	acknowledgedBy?: string;
	ackAction?: TeamMessageAckAction;
	ackReason?: string;
}
