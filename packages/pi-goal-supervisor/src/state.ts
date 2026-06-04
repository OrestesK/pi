import {
	STATE_CUSTOM_TYPE,
	type ContinuationReason,
	type CustomSessionEntry,
	type GoalJudgeResult,
	type GoalSupervisorState,
} from "./types.ts";

let nextId = 0;

function createId(prefix: string): string {
	nextId += 1;
	return `${prefix}-${Date.now().toString(36)}-${nextId.toString(36)}`;
}

export type InitialStateInput = {
	objective: string;
	cwd: string;
	sessionId?: string;
	now: string;
	maxIterations?: number;
	maxNoProgressTurns?: number;
	maxWallClockMs?: number;
};

export type GoalEvent =
	| { type: "started"; objective: string; now: string }
	| { type: "paused"; reason?: string; now: string }
	| { type: "resumed"; now: string }
	| { type: "stopped"; reason?: string; now: string }
	| { type: "blocked"; reason: string; now: string }
	| {
			type: "done_claimed";
			evidence: string;
			source: "marker" | "command";
			now: string;
	  }
	| { type: "judge_applied"; result: GoalJudgeResult }
	| {
			type: "turn_recorded";
			assistantText: string;
			fingerprint: string;
			now: string;
	  }
	| {
			type: "continuation_queued";
			id: string;
			reason: ContinuationReason;
			now: string;
	  }
	| { type: "continuation_delivered"; now: string }
	| { type: "compacted"; now: string };

const DEFAULT_MAX_ITERATIONS = 50;
const DEFAULT_MAX_NO_PROGRESS_TURNS = 5;
const DEFAULT_MAX_WALL_CLOCK_MS = 6 * 60 * 60 * 1000;

function copy(state: GoalSupervisorState): GoalSupervisorState {
	return structuredClone(state) as GoalSupervisorState;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

export function createInitialState(
	input: InitialStateInput,
): GoalSupervisorState {
	const objective = input.objective.trim();
	if (!objective) throw new Error("Goal objective must not be empty");
	return {
		version: 1,
		id: createId("goal"),
		cwd: input.cwd,
		sessionId: input.sessionId,
		objective,
		status: "running",
		createdAt: input.now,
		updatedAt: input.now,
		startedAt: input.now,
		iteration: 0,
		repeatedFingerprintCount: 0,
		noProgressTurns: 0,
		budget: {
			maxIterations: input.maxIterations ?? DEFAULT_MAX_ITERATIONS,
			maxNoProgressTurns:
				input.maxNoProgressTurns ?? DEFAULT_MAX_NO_PROGRESS_TURNS,
			maxWallClockMs: input.maxWallClockMs ?? DEFAULT_MAX_WALL_CLOCK_MS,
		},
		counters: {
			judgeAttempts: 0,
			judgeErrors: 0,
			compactionsObserved: 0,
			continuationsQueued: 0,
		},
	};
}

function maybeBudgetLimit(
	state: GoalSupervisorState,
	now: string,
): GoalSupervisorState {
	if (state.status !== "running") return state;
	const startedAt = Date.parse(state.startedAt);
	const checkedAt = Date.parse(now);
	if (
		Number.isFinite(startedAt) &&
		Number.isFinite(checkedAt) &&
		checkedAt - startedAt > state.budget.maxWallClockMs
	) {
		return {
			...state,
			status: "budget_limited",
			updatedAt: now,
			pendingContinuation: undefined,
			lastBlocker: {
				reason: `wall-clock budget exceeded (${checkedAt - startedAt}/${state.budget.maxWallClockMs}ms)`,
				at: now,
				source: "budget",
			},
		};
	}
	if (state.iteration > state.budget.maxIterations) {
		return {
			...state,
			status: "budget_limited",
			updatedAt: now,
			pendingContinuation: undefined,
			lastBlocker: {
				reason: `iteration budget exceeded (${state.iteration}/${state.budget.maxIterations})`,
				at: now,
				source: "budget",
			},
		};
	}
	if (state.noProgressTurns >= state.budget.maxNoProgressTurns) {
		return {
			...state,
			status: "budget_limited",
			updatedAt: now,
			pendingContinuation: undefined,
			lastBlocker: {
				reason: `no-progress budget exceeded (${state.noProgressTurns}/${state.budget.maxNoProgressTurns})`,
				at: now,
				source: "budget",
			},
		};
	}
	return state;
}

export function reduceState(
	state: GoalSupervisorState,
	event: GoalEvent,
): GoalSupervisorState {
	switch (event.type) {
		case "started":
			return {
				...createInitialState({
					objective: event.objective,
					cwd: state.cwd,
					sessionId: state.sessionId,
					now: event.now,
					maxIterations: state.budget.maxIterations,
					maxNoProgressTurns: state.budget.maxNoProgressTurns,
					maxWallClockMs: state.budget.maxWallClockMs,
				}),
				createdAt: state.createdAt,
			};
		case "paused": {
			const next = copy(state);
			next.status = "paused";
			next.updatedAt = event.now;
			next.pendingContinuation = undefined;
			if (event.reason)
				next.lastBlocker = {
					reason: event.reason,
					at: event.now,
					source: "marker",
				};
			return next;
		}
		case "resumed":
			return {
				...state,
				status: "running",
				updatedAt: event.now,
				pendingContinuation: undefined,
			};
		case "stopped":
			return {
				...state,
				status: "stopped",
				updatedAt: event.now,
				pendingContinuation: undefined,
			};
		case "blocked":
			return {
				...state,
				status: "blocked",
				updatedAt: event.now,
				pendingContinuation: undefined,
				lastBlocker: { reason: event.reason, at: event.now, source: "marker" },
			};
		case "done_claimed":
			return {
				...state,
				status: "judging",
				updatedAt: event.now,
				pendingContinuation: undefined,
				lastDoneClaim: {
					evidence: event.evidence,
					at: event.now,
					source: event.source,
				},
			};
		case "judge_applied":
			return {
				...state,
				status: event.result.verdict === "approved" ? "complete" : "running",
				completedAt:
					event.result.verdict === "approved"
						? event.result.at
						: state.completedAt,
				updatedAt: event.result.at,
				lastJudge: event.result,
				pendingContinuation: undefined,
			};
		case "turn_recorded": {
			const repeated = state.lastAssistantFingerprint === event.fingerprint;
			const next: GoalSupervisorState = {
				...state,
				updatedAt: event.now,
				iteration: state.iteration + 1,
				lastAssistantText: event.assistantText,
				lastAssistantFingerprint: event.fingerprint,
				repeatedFingerprintCount: repeated
					? state.repeatedFingerprintCount + 1
					: 0,
				noProgressTurns: repeated ? state.noProgressTurns + 1 : 0,
			};
			return maybeBudgetLimit(next, event.now);
		}
		case "continuation_queued":
			return {
				...state,
				updatedAt: event.now,
				lastContinuationAt: event.now,
				pendingContinuation: {
					id: event.id,
					queuedAt: event.now,
					reason: event.reason,
				},
				counters: {
					...state.counters,
					continuationsQueued: state.counters.continuationsQueued + 1,
				},
			};
		case "continuation_delivered":
			return { ...state, updatedAt: event.now, pendingContinuation: undefined };
		case "compacted":
			return {
				...state,
				updatedAt: event.now,
				counters: {
					...state.counters,
					compactionsObserved: state.counters.compactionsObserved + 1,
				},
			};
	}
}

export function serializeState(state: GoalSupervisorState): unknown {
	return structuredClone(state) as unknown;
}

function parseJudgeResult(value: unknown): GoalJudgeResult | undefined {
	if (!isRecord(value)) return undefined;
	const verdict = value.verdict;
	const score = value.score;
	const reason = value.reason;
	const missingEvidence = value.missingEvidence;
	const at = value.at;
	if (
		(verdict !== "approved" &&
			verdict !== "rejected" &&
			verdict !== "inconclusive") ||
		!isNumber(score) ||
		!isString(reason) ||
		!Array.isArray(missingEvidence) ||
		!missingEvidence.every(isString) ||
		!isString(at)
	) {
		return undefined;
	}
	const nextAction = isString(value.nextAction) ? value.nextAction : undefined;
	const model = isString(value.model) ? value.model : undefined;
	return { verdict, score, reason, missingEvidence, at, nextAction, model };
}

export function parseState(value: unknown): GoalSupervisorState | undefined {
	if (!isRecord(value) || value.version !== 1) return undefined;
	if (
		!isString(value.id) ||
		!isString(value.cwd) ||
		!isString(value.objective) ||
		!isString(value.status) ||
		!isString(value.createdAt) ||
		!isString(value.updatedAt) ||
		!isString(value.startedAt) ||
		!isNumber(value.iteration)
	)
		return undefined;
	if (
		![
			"idle",
			"running",
			"paused",
			"judging",
			"blocked",
			"complete",
			"budget_limited",
			"stopped",
		].includes(value.status)
	)
		return undefined;
	if (
		!isRecord(value.budget) ||
		!isNumber(value.budget.maxIterations) ||
		!isNumber(value.budget.maxNoProgressTurns) ||
		!isNumber(value.budget.maxWallClockMs)
	)
		return undefined;
	if (
		!isRecord(value.counters) ||
		!isNumber(value.counters.judgeAttempts) ||
		!isNumber(value.counters.judgeErrors) ||
		!isNumber(value.counters.compactionsObserved) ||
		!isNumber(value.counters.continuationsQueued)
	)
		return undefined;
	const pending =
		isRecord(value.pendingContinuation) &&
		isString(value.pendingContinuation.id) &&
		isString(value.pendingContinuation.queuedAt) &&
		isString(value.pendingContinuation.reason)
			? {
					id: value.pendingContinuation.id,
					queuedAt: value.pendingContinuation.queuedAt,
					reason: value.pendingContinuation.reason as ContinuationReason,
					deliveredAt: isString(value.pendingContinuation.deliveredAt)
						? value.pendingContinuation.deliveredAt
						: undefined,
				}
			: undefined;
	const lastJudge = parseJudgeResult(value.lastJudge);
	return {
		version: 1,
		id: value.id,
		cwd: value.cwd,
		sessionId: isString(value.sessionId) ? value.sessionId : undefined,
		objective: value.objective,
		status: value.status as GoalSupervisorState["status"],
		createdAt: value.createdAt,
		updatedAt: value.updatedAt,
		startedAt: value.startedAt,
		completedAt: isString(value.completedAt) ? value.completedAt : undefined,
		iteration: value.iteration,
		pendingContinuation: pending,
		lastContinuationAt: isString(value.lastContinuationAt)
			? value.lastContinuationAt
			: undefined,
		lastAssistantFingerprint: isString(value.lastAssistantFingerprint)
			? value.lastAssistantFingerprint
			: undefined,
		repeatedFingerprintCount: isNumber(value.repeatedFingerprintCount)
			? value.repeatedFingerprintCount
			: 0,
		noProgressTurns: isNumber(value.noProgressTurns)
			? value.noProgressTurns
			: 0,
		lastAssistantText: isString(value.lastAssistantText)
			? value.lastAssistantText
			: undefined,
		lastDoneClaim:
			isRecord(value.lastDoneClaim) &&
			isString(value.lastDoneClaim.evidence) &&
			isString(value.lastDoneClaim.at) &&
			(value.lastDoneClaim.source === "marker" ||
				value.lastDoneClaim.source === "command")
				? {
						evidence: value.lastDoneClaim.evidence,
						at: value.lastDoneClaim.at,
						source: value.lastDoneClaim.source,
					}
				: undefined,
		lastBlocker:
			isRecord(value.lastBlocker) &&
			isString(value.lastBlocker.reason) &&
			isString(value.lastBlocker.at) &&
			(value.lastBlocker.source === "marker" ||
				value.lastBlocker.source === "question" ||
				value.lastBlocker.source === "budget" ||
				value.lastBlocker.source === "judge_error")
				? {
						reason: value.lastBlocker.reason,
						at: value.lastBlocker.at,
						source: value.lastBlocker.source,
					}
				: undefined,
		lastJudge,
		budget: {
			maxIterations: value.budget.maxIterations,
			maxNoProgressTurns: value.budget.maxNoProgressTurns,
			maxWallClockMs: value.budget.maxWallClockMs,
		},
		counters: {
			judgeAttempts: value.counters.judgeAttempts,
			judgeErrors: value.counters.judgeErrors,
			compactionsObserved: value.counters.compactionsObserved,
			continuationsQueued: value.counters.continuationsQueued,
		},
	};
}

export function restoreStateFromEntries(
	entries: CustomSessionEntry[],
	customType = STATE_CUSTOM_TYPE,
): GoalSupervisorState | undefined {
	let restored: GoalSupervisorState | undefined;
	for (const entry of entries) {
		if (entry.type !== "custom" || entry.customType !== customType) continue;
		const parsed = parseState(entry.data);
		if (parsed) restored = parsed;
	}
	return restored;
}

export function appendState(
	api: { appendEntry?: (customType: string, data?: unknown) => void },
	state: GoalSupervisorState,
): void {
	api.appendEntry?.(STATE_CUSTOM_TYPE, serializeState(state));
}
