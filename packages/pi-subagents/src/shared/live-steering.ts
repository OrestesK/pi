import type { TeamDecisionRecord, TeamMessageRecord } from "./team-types.ts";

export interface LiveSteeringCompletionFailure {
	reason: string;
	messageIds: string[];
	kind: "unacknowledged" | "blocked";
}

export interface LiveSteeringReviewerPulseFailure {
	reviewer: string;
	reason: string;
	kind: "missing" | "late" | "passive-single";
}

export interface LiveSteeringReviewerPulseInput {
	decisions: TeamDecisionRecord[];
	reviewerNames: string[];
	workerStartedAtMs: number;
	workerCompletedAtMs: number;
	firstPulseWithinMs?: number;
	longRunMs?: number;
}

const DEFAULT_FIRST_PULSE_WITHIN_MS = 60_000;
const DEFAULT_LONG_RUN_MS = 120_000;

function messageCreatedAtMs(message: TeamMessageRecord): number {
	const parsed = Date.parse(message.createdAt);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function messageSummary(messages: TeamMessageRecord[]): string {
	return messages.map((message) => `${message.id} from ${message.from}`).join(", ");
}

function decisionCreatedAtMs(decision: TeamDecisionRecord): number {
	const parsed = Date.parse(decision.createdAt);
	return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

export function findLiveSteeringReviewerPulseFailures(input: LiveSteeringReviewerPulseInput): LiveSteeringReviewerPulseFailure[] {
	const firstPulseWithinMs = input.firstPulseWithinMs ?? DEFAULT_FIRST_PULSE_WITHIN_MS;
	const longRunMs = input.longRunMs ?? DEFAULT_LONG_RUN_MS;
	const activeDurationMs = Math.max(0, input.workerCompletedAtMs - input.workerStartedAtMs);
	const firstPulseDeadlineMs = Math.min(input.workerStartedAtMs + firstPulseWithinMs, input.workerCompletedAtMs);
	const failures: LiveSteeringReviewerPulseFailure[] = [];

	for (const reviewer of input.reviewerNames) {
		const activePulses = input.decisions
			.filter((decision) => decision.from === reviewer)
			.filter((decision) => {
				const createdAtMs = decisionCreatedAtMs(decision);
				return createdAtMs >= input.workerStartedAtMs && createdAtMs <= input.workerCompletedAtMs;
			})
			.sort((a, b) => decisionCreatedAtMs(a) - decisionCreatedAtMs(b));
		if (activePulses.length === 0) {
			failures.push({
				reviewer,
				kind: "missing",
				reason: `${reviewer} recorded no active team_decide pulse while worker-0 was running`,
			});
			continue;
		}
		const firstPulseAtMs = decisionCreatedAtMs(activePulses[0]!);
		if (firstPulseAtMs > firstPulseDeadlineMs) {
			failures.push({
				reviewer,
				kind: "late",
				reason: `${reviewer} first active team_decide pulse was too late`,
			});
			continue;
		}
		const activeIntervention = activePulses.some((decision) => decision.action === "steer" || decision.action === "discuss");
		if (activeDurationMs >= longRunMs && activePulses.length < 2 && !activeIntervention) {
			failures.push({
				reviewer,
				kind: "passive-single",
				reason: `${reviewer} made only one passive team_decide pulse during a long worker run`,
			});
		}
	}

	return failures;
}

export function findLiveSteeringCompletionFailure(
	messages: TeamMessageRecord[],
	workerCompletedAtMs: number,
): LiveSteeringCompletionFailure | null {
	const relevantMessages = messages.filter((message) => message.from !== "worker-0" && messageCreatedAtMs(message) <= workerCompletedAtMs);
	const incomplete = relevantMessages.filter((message) => !message.read || !message.ackAction);
	if (incomplete.length > 0) {
		return {
			kind: "unacknowledged",
			messageIds: incomplete.map((message) => message.id),
			reason: `unacknowledged live steering: ${messageSummary(incomplete)}`,
		};
	}
	const blocked = relevantMessages.filter((message) => message.ackAction === "blocked");
	if (blocked.length > 0) {
		return {
			kind: "blocked",
			messageIds: blocked.map((message) => message.id),
			reason: `blocked live steering: ${messageSummary(blocked)}`,
		};
	}
	return null;
}
