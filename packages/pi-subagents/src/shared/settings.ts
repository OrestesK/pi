/**
 * Chain behavior, template resolution, and directory management
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { AgentConfig } from "../agents/agents.ts";
import { normalizeSkillInput } from "../agents/skills.ts";
import { CHAIN_RUNS_DIR, type AcceptanceInput, type JsonSchemaObject, type OutputMode, type ProgressConfig, type ProgressReportMode } from "./types.ts";
import type { SubagentCapability } from "../runs/shared/capability-requirements.ts";
export type { ProgressReportMode } from "./types.ts";
const CHAIN_DIR_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const INITIAL_PROGRESS_CONTENT = "# Progress\n\n## Status\nIn Progress\n\n## Tasks\n\n## Files Changed\n\n## Notes\n";
const PROGRESS_FILE_NAME = "progress.md";

// =============================================================================
// Behavior Resolution Types
// =============================================================================

export interface ResolvedStepBehavior {
	output: string | false;
	outputMode: OutputMode;
	outputSchema?: JsonSchemaObject;
	acceptance?: AcceptanceInput;
	reads: string[] | false;
	readsFromDefault?: boolean;
	progress: boolean;
	skills: string[] | false;
	model?: string;
}

export interface StepOverrides {
	output?: string | false;
	outputMode?: OutputMode;
	outputSchema?: JsonSchemaObject;
	acceptance?: AcceptanceInput;
	reads?: string[] | false;
	progress?: boolean;
	skills?: string[] | false;
	model?: string;
}

function normalizeOutputOverride(output: string | false | undefined): string | false | undefined {
	return output === "false" ? false : output;
}

// =============================================================================
// Chain Step Types
// =============================================================================

interface NamedChainStepFields {
	phase?: string;
	label?: string;
	as?: string;
}

/** Sequential step: single agent execution */
export interface SequentialStep extends NamedChainStepFields {
	agent: string;
	task?: string;
	cwd?: string;
	output?: string | false;
	outputMode?: OutputMode;
	outputSchema?: JsonSchemaObject;
	acceptance?: AcceptanceInput;
	reads?: string[] | false;
	progress?: boolean;
	skill?: string | string[] | false;
	model?: string;
	requiresCapabilities?: SubagentCapability[];
}

/** Parallel task item within a parallel step */
export interface ParallelTaskItem extends NamedChainStepFields {
	agent: string;
	task?: string;
	cwd?: string;
	count?: number;
	output?: string | false;
	outputMode?: OutputMode;
	outputSchema?: JsonSchemaObject;
	acceptance?: AcceptanceInput;
	reads?: string[] | false;
	progress?: boolean;
	skill?: string | string[] | false;
	model?: string;
	requiresCapabilities?: SubagentCapability[];
}

/** Parallel step: multiple agents running concurrently */
export interface ParallelStep {
	parallel: ParallelTaskItem[];
	cwd?: string;
	concurrency?: number;
	failFast?: boolean;
	worktree?: boolean;
}

export interface DynamicFanoutStep {
	expand: {
		from: {
			output: string;
			path?: string;
		};
		item?: string;
		key?: string;
		maxItems?: number;
	};
	parallel: ParallelTaskItem;
	collect: {
		as: string;
	};
	cwd?: string;
	concurrency?: number;
	failFast?: boolean;
	worktree?: boolean;
}

/** Union type for chain steps */
export type ChainStep = SequentialStep | ParallelStep | DynamicFanoutStep;

// =============================================================================
// Type Guards
// =============================================================================

export function isDynamicFanoutStep(step: ChainStep): step is DynamicFanoutStep {
	return "expand" in step && "collect" in step && "parallel" in step && !Array.isArray((step as { parallel?: unknown }).parallel);
}

export function isParallelStep(step: ChainStep): step is ParallelStep {
	return "parallel" in step && Array.isArray((step as ParallelStep).parallel);
}

/** Get all agent names in a step (single for sequential, multiple for parallel) */
export function getStepAgents(step: ChainStep): string[] {
	if (isDynamicFanoutStep(step)) return [step.parallel.agent];
	if (isParallelStep(step)) {
		return step.parallel.map((t) => t.agent);
	}
	return [step.agent];
}

// =============================================================================
// Chain Directory Management
// =============================================================================

export function createChainDir(runId: string, baseDir?: string): string {
	const chainDir = path.join(baseDir ? path.resolve(baseDir) : CHAIN_RUNS_DIR, runId);
	fs.mkdirSync(chainDir, { recursive: true });
	return chainDir;
}

export function removeChainDir(chainDir: string): void {
	try {
		fs.rmSync(chainDir, { recursive: true });
	} catch {
		// Chain cleanup is best-effort. Runs can already have cleaned their temp dir.
	}
}

export function cleanupOldChainDirs(): void {
	if (!fs.existsSync(CHAIN_RUNS_DIR)) return;
	const now = Date.now();
	let dirs: string[];
	try {
		dirs = fs.readdirSync(CHAIN_RUNS_DIR);
	} catch {
		// Startup cleanup is best-effort. If the scoped temp root is unreadable,
		// skip cleanup instead of failing extension startup.
		return;
	}

	for (const dir of dirs) {
		try {
			const dirPath = path.join(CHAIN_RUNS_DIR, dir);
			const stat = fs.statSync(dirPath);
			if (stat.isDirectory() && now - stat.mtimeMs > CHAIN_DIR_MAX_AGE_MS) {
				fs.rmSync(dirPath, { recursive: true });
			}
		} catch {
			// Skip directories that can't be processed; continue with others
		}
	}
}

// =============================================================================
// Template Resolution
// =============================================================================

/** Resolved templates for a chain - string for sequential, string[] for parallel */
export type ResolvedTemplates = (string | string[])[];

/**
 * Resolve templates for a chain with parallel step support.
 * Returns string for sequential steps, string[] for parallel steps.
 */
export function resolveChainTemplates(
	steps: ChainStep[],
): ResolvedTemplates {
	return steps.map((step, i) => {
		if (isParallelStep(step)) {
			// Parallel step: resolve each task's template
			return step.parallel.map((task) => {
				if (task.task) return task.task;
				// Default for parallel tasks is {previous}
				return "{previous}";
			});
		}
		// Sequential step: existing logic
		const seq = step as SequentialStep;
		if (seq.task) return seq.task;
		// Default: first step uses {task}, others use {previous}
		return i === 0 ? "{task}" : "{previous}";
	});
}

// =============================================================================
// Behavior Resolution
// =============================================================================

/**
 * Resolve effective chain behavior per step.
 * Priority: step override > agent frontmatter > false (disabled)
 */
export function resolveStepBehavior(
	agentConfig: AgentConfig,
	stepOverrides: StepOverrides,
	chainSkills?: string[],
): ResolvedStepBehavior {
	// Output: step override > frontmatter > false (no output)
	const stepOutput = normalizeOutputOverride(stepOverrides.output);
	const output =
		stepOutput !== undefined
			? stepOutput
			: normalizeOutputOverride(agentConfig.output) ?? false;

	// Reads: step override > frontmatter defaultReads > false (no reads)
	const readsFromDefault = stepOverrides.reads === undefined && agentConfig.defaultReads !== undefined;
	const reads =
		stepOverrides.reads !== undefined
			? stepOverrides.reads
			: agentConfig.defaultReads ?? false;

	// Progress: step override > frontmatter defaultProgress > false
	const progress =
		stepOverrides.progress !== undefined
			? stepOverrides.progress
			: agentConfig.defaultProgress ?? false;

	let skills: string[] | false;
	if (stepOverrides.skills === false) {
		skills = false;
	} else if (stepOverrides.skills !== undefined) {
		skills = [...stepOverrides.skills];
		if (chainSkills && chainSkills.length > 0) {
			skills = [...new Set([...skills, ...chainSkills])];
		}
	} else {
		skills = agentConfig.skills ? [...agentConfig.skills] : [];
		if (chainSkills && chainSkills.length > 0) {
			skills = [...new Set([...skills, ...chainSkills])];
		}
	}

	const outputMode = stepOverrides.outputMode ?? "inline";
	const model = stepOverrides.model ?? agentConfig.model;
	return {
		output,
		outputMode,
		...(stepOverrides.outputSchema ? { outputSchema: stepOverrides.outputSchema } : {}),
		...(stepOverrides.acceptance ? { acceptance: stepOverrides.acceptance } : {}),
		reads,
		readsFromDefault,
		progress,
		skills,
		model,
	};
}

export function resolveTaskTextForFileUpdatePolicy(task: string | undefined, originalTask?: string): string | undefined {
	if (!task) return originalTask;
	return originalTask ? task.split("{task}").join(originalTask) : task;
}

export function taskDisallowsFileUpdates(task: string | undefined): boolean {
	if (!task) return false;
	return /\breview[- ]only\b/i.test(task)
		|| /\bread[- ]only\s+(?:review|audit|inspection|pass)\b/i.test(task)
		|| /\b(?:no|without)\s+(?:file\s+)?edits?\b/i.test(task)
		|| /\b(?:do not|don't|must not)\s+(?:edit|modify|write|touch)\b/i.test(task)
		|| /\bleave\s+files?\s+unchanged\b/i.test(task);
}

export function suppressProgressForReadOnlyTask(behavior: ResolvedStepBehavior, task: string | undefined, originalTask?: string): ResolvedStepBehavior {
	const policyTask = resolveTaskTextForFileUpdatePolicy(task, originalTask);
	return behavior.progress && taskDisallowsFileUpdates(policyTask) ? { ...behavior, progress: false } : behavior;
}

// =============================================================================
// Chain Instruction Injection
// =============================================================================

/**
 * Resolve a file path: absolute paths pass through, relative paths get chainDir prepended.
 */
function resolveChainPath(filePath: string, chainDir: string): string {
	return path.isAbsolute(filePath) ? filePath : path.join(chainDir, filePath);
}

export function resolveProgressReportMode(config: ProgressConfig | undefined): ProgressReportMode {
	return config?.reportMode === "supervisor" ? "supervisor" : "file";
}

export function progressFileDirForRun(runRoot: string): string {
	return path.join(runRoot, "progress");
}

function isProgressRead(filePath: string): boolean {
	return path.basename(filePath) === PROGRESS_FILE_NAME;
}

function progressReadsForMode(behavior: ResolvedStepBehavior, reportMode: ProgressReportMode): string[] | false {
	if (!behavior.reads || reportMode === "file" || !behavior.readsFromDefault) return behavior.reads;
	const filtered = behavior.reads.filter((filePath) => !isProgressRead(filePath));
	return filtered.length > 0 ? filtered : false;
}

function buildSupervisorProgressInstruction(): string {
	return 'Report concise progress with contact_supervisor({ reason: "progress_update", message: "UPDATE: <summary>" }) when meaningful progress, blockers, or unexpected discoveries change what the parent needs to know. Do not write progress files.';
}

/**
 * Build chain instructions from resolved behavior.
 * These are appended to the task to tell the agent what to read/write.
 */
export function writeInitialProgressFile(progressDir: string): void {
	fs.mkdirSync(progressDir, { recursive: true });
	fs.writeFileSync(path.join(progressDir, PROGRESS_FILE_NAME), INITIAL_PROGRESS_CONTENT);
}

export function buildChainInstructions(
	behavior: ResolvedStepBehavior,
	chainDir: string,
	isFirstProgressAgent: boolean,
	previousSummary?: string,
	progressReportMode: ProgressReportMode = "file",
	progressDir: string = chainDir,
): { prefix: string; suffix: string } {
	const prefixParts: string[] = [];
	const suffixParts: string[] = [];

	// READS - prepend to override any hardcoded filenames in task text
	const reads = progressReadsForMode(behavior, progressReportMode);
	if (reads && reads.length > 0) {
		const files = reads.map((f) => resolveChainPath(f, chainDir));
		prefixParts.push(`[Read from: ${files.join(", ")}]`);
	}

	// OUTPUT - prepend so the save location stays visible even when task text is long
	if (behavior.output) {
		const outputPath = resolveChainPath(behavior.output, chainDir);
		prefixParts.push(`[Final response will be saved to: ${outputPath}]`);
	}

	// Progress instructions in suffix (less critical)
	if (behavior.progress) {
		if (progressReportMode === "supervisor") {
			suffixParts.push(buildSupervisorProgressInstruction());
		} else {
			const progressPath = path.join(progressDir, PROGRESS_FILE_NAME);
			if (isFirstProgressAgent) {
				suffixParts.push(`Create and maintain progress at: ${progressPath}`);
			} else {
				suffixParts.push(`Update progress at: ${progressPath}`);
			}
		}
	}

	// Include previous step's summary in suffix if available
	if (previousSummary && previousSummary.trim()) {
		suffixParts.push(`Previous step output:\n${previousSummary.trim()}`);
	}

	const prefix = prefixParts.length > 0 
		? prefixParts.join("\n") + "\n\n"
		: "";
	
	const suffix = suffixParts.length > 0
		? "\n\n---\n" + suffixParts.join("\n")
		: "";

	return { prefix, suffix };
}

// =============================================================================
// Parallel Step Support
// =============================================================================

/**
 * Resolve behaviors for all tasks in a parallel step.
 * Creates namespaced output paths to avoid collisions.
 */
export function resolveParallelBehaviors(
	tasks: ParallelTaskItem[],
	agentConfigs: AgentConfig[],
	stepIndex: number,
	chainSkills?: string[],
): ResolvedStepBehavior[] {
	return tasks.map((task, taskIndex) => {
		const config = agentConfigs.find((a) => a.name === task.agent);
		if (!config) {
			throw new Error(`Unknown agent: ${task.agent}`);
		}

		// Build subdirectory path for this parallel task
		const subdir = path.join(`parallel-${stepIndex}`, `${taskIndex}-${task.agent}`);

		// Output: task override > agent default (namespaced) > false
		// Absolute paths pass through unchanged; relative paths get namespaced under subdir
		let output: string | false = false;
		const taskOutput = normalizeOutputOverride(task.output);
		const configOutput = normalizeOutputOverride(config.output);
		if (taskOutput !== undefined) {
			if (taskOutput === false) {
				output = false;
			} else if (path.isAbsolute(taskOutput)) {
				output = taskOutput; // Absolute path: use as-is
			} else {
				output = path.join(subdir, taskOutput); // Relative: namespace under subdir
			}
		} else if (configOutput) {
			// Agent defaults are always relative, so namespace them
			output = path.join(subdir, configOutput);
		}

		// Reads: task override > agent default > false
		const readsFromDefault = task.reads === undefined && config.defaultReads !== undefined;
		const reads =
			task.reads !== undefined ? task.reads : config.defaultReads ?? false;

		// Progress: task override > agent default > false
		const progress =
			task.progress !== undefined
				? task.progress
				: config.defaultProgress ?? false;

		const taskSkillInput = normalizeSkillInput(task.skill);
		let skills: string[] | false;
		if (taskSkillInput === false) {
			skills = false;
		} else if (taskSkillInput !== undefined) {
			skills = [...taskSkillInput];
			if (chainSkills && chainSkills.length > 0) {
				skills = [...new Set([...skills, ...chainSkills])];
			}
		} else {
			skills = config.skills ? [...config.skills] : [];
			if (chainSkills && chainSkills.length > 0) {
				skills = [...new Set([...skills, ...chainSkills])];
			}
		}

		const outputMode = task.outputMode ?? "inline";
		const model = task.model ?? config.model;
		return {
			output,
			outputMode,
			...(task.outputSchema ? { outputSchema: task.outputSchema } : {}),
			...(task.acceptance ? { acceptance: task.acceptance } : {}),
			reads,
			readsFromDefault,
			progress,
			skills,
			model,
		};
	});
}

/**
 * Create subdirectories for parallel step outputs
 */
export function createParallelDirs(
	chainDir: string,
	stepIndex: number,
	taskCount: number,
	agentNames: string[],
): void {
	for (let i = 0; i < taskCount; i++) {
		const subdir = path.join(chainDir, `parallel-${stepIndex}`, `${i}-${agentNames[i]}`);
		fs.mkdirSync(subdir, { recursive: true });
	}
}

export type { ParallelTaskResult } from "../runs/shared/parallel-utils.ts";
export { aggregateParallelOutputs } from "../runs/shared/parallel-utils.ts";
