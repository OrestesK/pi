import { detectDirectHumanQuestion } from "./evidence.ts";
import { reduceState } from "./state.ts";
import type { GoalJudgeResult, GoalSupervisorState } from "./types.ts";

function nowIso(): string {
	return new Date().toISOString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] {
	return Array.isArray(value)
		? value.filter((item): item is string => typeof item === "string")
		: [];
}

export function parseJudgeResponse(
	text: string,
	at = nowIso(),
): GoalJudgeResult {
	try {
		const parsed = JSON.parse(text) as unknown;
		if (!isRecord(parsed)) throw new Error("not an object");
		const verdict = parsed.verdict;
		const score = parsed.score;
		const reason = parsed.reason;
		if (
			verdict !== "approved" &&
			verdict !== "rejected" &&
			verdict !== "inconclusive"
		)
			throw new Error("invalid verdict");
		if (typeof score !== "number" || !Number.isFinite(score))
			throw new Error("invalid score");
		if (typeof reason !== "string" || !reason.trim())
			throw new Error("invalid reason");
		const missingEvidence = stringArray(parsed.missingEvidence);
		const nextAction =
			typeof parsed.nextAction === "string" ? parsed.nextAction : undefined;
		const model = typeof parsed.model === "string" ? parsed.model : undefined;
		return { verdict, score, reason, missingEvidence, nextAction, model, at };
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			verdict: "inconclusive",
			score: 0,
			reason: `malformed judge output: ${reason}`,
			missingEvidence: ["valid judge JSON"],
			at,
		};
	}
}

export function deterministicPrecheck(
	finalAssistantText: string,
	evidence: string,
	at = nowIso(),
): GoalJudgeResult {
	if (!evidence.trim()) {
		return {
			verdict: "rejected",
			score: 0,
			reason: "empty completion evidence",
			missingEvidence: ["non-empty GOAL_DONE evidence"],
			at,
		};
	}
	if (!finalAssistantText.trim()) {
		return {
			verdict: "rejected",
			score: 0,
			reason: "no transcript evidence available for completion claim",
			missingEvidence: ["transcript evidence supporting completion"],
			at,
		};
	}
	if (detectDirectHumanQuestion(finalAssistantText)) {
		return {
			verdict: "rejected",
			score: 0,
			reason: "assistant ended with a direct human decision question",
			missingEvidence: ["resolved decision or GOAL_BLOCKED marker"],
			at,
		};
	}
	if (/^GOAL_BLOCKED:/im.test(finalAssistantText)) {
		return {
			verdict: "rejected",
			score: 0,
			reason: "assistant reported a blocker",
			missingEvidence: ["unblocked completion evidence"],
			at,
		};
	}
	return {
		verdict: "inconclusive",
		score: 0,
		reason: "model judge required",
		missingEvidence: [],
		at,
	};
}

export function applyJudgeResult(
	state: GoalSupervisorState,
	result: GoalJudgeResult,
): GoalSupervisorState {
	const normalized: GoalJudgeResult =
		result.verdict === "approved" && result.score < 8
			? {
					...result,
					verdict: "rejected",
					reason: `score below approval threshold: ${result.reason}`,
				}
			: result;
	const next = reduceState(state, {
		type: "judge_applied",
		result: normalized,
	});
	return normalized.verdict === "inconclusive"
		? reduceState(next, {
				type: "blocked",
				reason: normalized.reason,
				now: normalized.at,
				source: "judge_error",
			})
		: next;
}
