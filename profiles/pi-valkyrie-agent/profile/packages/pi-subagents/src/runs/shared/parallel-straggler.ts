import { formatDuration } from "../../shared/formatters.ts";

export type ParallelStragglerTaskStatus =
	| "pending"
	| "running"
	| "complete"
	| "completed"
	| "failed"
	| "paused"
	| "detached"
	| "interrupted";

export interface ParallelStragglerTaskSnapshot {
	index: number;
	agent: string;
	status: ParallelStragglerTaskStatus;
	startedAt?: number;
	endedAt?: number;
	durationMs?: number;
	lastActivityAt?: number;
	currentTool?: string;
	toolCount?: number;
	tokens?: number;
}

export interface ParallelStragglerNoticeOptions {
	runId: string;
	mode: "parallel" | "chain";
	barrierLabel: string;
	now?: number;
	tasks: ParallelStragglerTaskSnapshot[];
	floorMs?: number;
	multiplier?: number;
	maxRunningRatio?: number;
}

export interface ParallelStragglerNoticeRunningTask {
	index: number;
	agent: string;
	elapsedMs: number;
	lastActivityAgoMs?: number;
	currentTool?: string;
	toolCount?: number;
	tokens?: number;
}

export interface ParallelStragglerNotice {
	key: string;
	runId: string;
	mode: "parallel" | "chain";
	barrierLabel: string;
	totalCount: number;
	completedCount: number;
	runningCount: number;
	thresholdMs: number;
	baselineMs: number;
	running: ParallelStragglerNoticeRunningTask[];
}

const DEFAULT_FLOOR_MS = 60_000;
const DEFAULT_MULTIPLIER = 1.5;
const DEFAULT_MAX_RUNNING_RATIO = 0.1;

function isCompletedStatus(status: ParallelStragglerTaskStatus): boolean {
	return status === "complete" || status === "completed";
}

function isTerminalProblemStatus(status: ParallelStragglerTaskStatus): boolean {
	return status === "failed" || status === "paused" || status === "detached" || status === "interrupted";
}

function completedDuration(task: ParallelStragglerTaskSnapshot): number | undefined {
	if (!isCompletedStatus(task.status)) return undefined;
	if (task.durationMs !== undefined && Number.isFinite(task.durationMs) && task.durationMs >= 0) return task.durationMs;
	if (task.startedAt !== undefined && task.endedAt !== undefined) return Math.max(0, task.endedAt - task.startedAt);
	return undefined;
}

function runningElapsed(task: ParallelStragglerTaskSnapshot, now: number): number | undefined {
	if (task.status !== "running" || task.startedAt === undefined) return undefined;
	return Math.max(0, now - task.startedAt);
}

function maxAllowedRunning(total: number, ratio: number): number {
	return Math.max(1, Math.floor(total * ratio));
}

export function buildParallelStragglerNotice(options: ParallelStragglerNoticeOptions): ParallelStragglerNotice | undefined {
	const now = options.now ?? Date.now();
	const tasks = options.tasks;
	const totalCount = tasks.length;
	if (totalCount < 2) return undefined;
	if (tasks.some((task) => task.status === "pending")) return undefined;
	if (tasks.some((task) => isTerminalProblemStatus(task.status))) return undefined;

	const running = tasks.filter((task) => task.status === "running");
	if (running.length === 0) return undefined;
	if (running.length > maxAllowedRunning(totalCount, options.maxRunningRatio ?? DEFAULT_MAX_RUNNING_RATIO)) return undefined;

	const completed = tasks.filter((task) => isCompletedStatus(task.status));
	if (completed.length + running.length !== totalCount) return undefined;
	if (completed.length === 0) return undefined;

	const completedDurations = completed.map(completedDuration).filter((duration): duration is number => duration !== undefined);
	if (completedDurations.length === 0) return undefined;

	const baselineMs = Math.max(...completedDurations);
	const thresholdMs = Math.max(options.floorMs ?? DEFAULT_FLOOR_MS, baselineMs * (options.multiplier ?? DEFAULT_MULTIPLIER));
	const runningWithElapsed = running
		.map((task) => {
			const elapsedMs = runningElapsed(task, now);
			if (elapsedMs === undefined || elapsedMs < thresholdMs) return undefined;
			return {
				index: task.index,
				agent: task.agent,
				elapsedMs,
				...(task.lastActivityAt !== undefined ? { lastActivityAgoMs: Math.max(0, now - task.lastActivityAt) } : {}),
				...(task.currentTool ? { currentTool: task.currentTool } : {}),
				...(task.toolCount !== undefined ? { toolCount: task.toolCount } : {}),
				...(task.tokens !== undefined ? { tokens: task.tokens } : {}),
			};
		})
		.filter((task): task is ParallelStragglerNoticeRunningTask => task !== undefined);
	if (runningWithElapsed.length === 0) return undefined;

	const remainingKey = runningWithElapsed.map((task) => task.index).sort((a, b) => a - b).join(",");
	return {
		key: `${options.runId}:${options.mode}:${options.barrierLabel}:${remainingKey}`,
		runId: options.runId,
		mode: options.mode,
		barrierLabel: options.barrierLabel,
		totalCount,
		completedCount: completed.length,
		runningCount: running.length,
		thresholdMs,
		baselineMs,
		running: runningWithElapsed,
	};
}

function formatNoticeDuration(ms: number): string {
	const formatted = formatDuration(ms);
	return formatted.endsWith(".0s") ? `${formatted.slice(0, -3)}s` : formatted;
}

function formatRunningTask(task: ParallelStragglerNoticeRunningTask, totalCount: number): string {
	const facts = [
		`${task.agent} ${task.index + 1}/${totalCount}`,
		`elapsed ${formatNoticeDuration(task.elapsedMs)}`,
		task.lastActivityAgoMs !== undefined ? `last activity ${formatNoticeDuration(task.lastActivityAgoMs)} ago` : undefined,
		task.currentTool ? `tool ${task.currentTool}` : undefined,
		task.toolCount !== undefined ? `${task.toolCount} tools` : undefined,
		task.tokens !== undefined ? `${task.tokens} tokens` : undefined,
	].filter((fact): fact is string => Boolean(fact));
	return facts.join(", ");
}

export function formatParallelStragglerNotice(notice: ParallelStragglerNotice): string {
	return [
		`Parallel barrier blocked by straggler: ${notice.barrierLabel}`,
		`${notice.completedCount}/${notice.totalCount} complete; ${notice.runningCount} still running.`,
		...notice.running.map((task) => `Running: ${formatRunningTask(task, notice.totalCount)}`),
		`Threshold: slower than ${formatNoticeDuration(notice.thresholdMs)} (${formatNoticeDuration(notice.baselineMs)} peer baseline).`,
		"No automatic action taken.",
		"Actions: wait, inspect status/activity, nudge if available, interrupt, or detach/background when available.",
	].join("\n");
}
