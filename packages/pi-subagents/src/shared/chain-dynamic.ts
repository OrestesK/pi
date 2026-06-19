import type { SingleResult } from "./types.ts";
import type { ChainStep, DynamicFanoutStep, ParallelStep, ParallelTaskItem, SequentialStep } from "./settings.ts";
import { isDynamicFanoutStep, isParallelStep } from "./settings.ts";
import { getSingleResultOutput } from "./utils.ts";

const OUTPUT_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const OUTPUT_REF_RE = /\{outputs\.([A-Za-z_][A-Za-z0-9_]*)\}/g;

export type NamedChainOutputs = Record<string, unknown>;

export interface RenderChainTemplateInput {
	originalTask: string;
	previous: string;
	chainDir: string;
	outputs: NamedChainOutputs;
	itemName?: string;
	item?: unknown;
}

export interface DynamicFanoutResult {
	error?: string;
	parallelStep?: ParallelStep;
	items?: unknown[];
	keys?: string[];
	collectAs?: string;
}

export interface CollectedDynamicResult {
	key?: string;
	item: unknown;
	agent: string;
	output: unknown;
	exitCode: number;
	error?: string;
}

function stringifyTemplateValue(value: unknown): string {
	if (value === undefined || value === null) return "";
	if (typeof value === "string") return value;
	return JSON.stringify(value);
}

function decodePointerSegment(segment: string): string {
	return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

export function readJsonPointer(value: unknown, pointer?: string): unknown {
	if (!pointer) return value;
	if (pointer === "") return value;
	if (!pointer.startsWith("/")) return undefined;
	let current = value;
	for (const rawSegment of pointer.slice(1).split("/")) {
		const segment = decodePointerSegment(rawSegment);
		if (Array.isArray(current)) {
			if (!/^\d+$/.test(segment)) return undefined;
			current = current[Number(segment)];
		} else if (current && typeof current === "object") {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current;
}

function readDotPath(value: unknown, dottedPath: string): unknown {
	if (!dottedPath) return value;
	let current = value;
	for (const segment of dottedPath.split(".")) {
		if (!segment) return undefined;
		if (Array.isArray(current) && /^\d+$/.test(segment)) {
			current = current[Number(segment)];
		} else if (current && typeof current === "object") {
			current = (current as Record<string, unknown>)[segment];
		} else {
			return undefined;
		}
	}
	return current;
}

export function getNamedOutputReferences(template: string | undefined): string[] {
	if (!template) return [];
	const references: string[] = [];
	for (const match of template.matchAll(OUTPUT_REF_RE)) references.push(match[1]!);
	return references;
}

function hasDynamicMarkers(step: ChainStep): boolean {
	return "expand" in step || "collect" in step;
}

function collectStepReferences(step: ChainStep): string[] {
	const refs: string[] = [];
	if (isDynamicFanoutStep(step)) {
		refs.push(step.expand.from.output);
		refs.push(...getNamedOutputReferences(step.parallel.task));
		refs.push(...getNamedOutputReferences(step.parallel.label));
		return refs;
	}
	if (isParallelStep(step)) {
		for (const task of step.parallel) {
			refs.push(...getNamedOutputReferences(task.task));
			refs.push(...getNamedOutputReferences(task.label));
		}
		return refs;
	}
	refs.push(...getNamedOutputReferences((step as SequentialStep).task));
	refs.push(...getNamedOutputReferences((step as SequentialStep).label));
	return refs;
}

function stepOutputNames(step: ChainStep): string[] {
	if (isDynamicFanoutStep(step)) return [step.collect.as];
	if (isParallelStep(step)) return step.parallel.map((task) => task.as).filter((name): name is string => Boolean(name));
	return (step as SequentialStep).as ? [(step as SequentialStep).as!] : [];
}

export function validateChainOutputNames(steps: ChainStep[]): string | undefined {
	const available = new Set<string>();
	for (const [stepIndex, step] of steps.entries()) {
		if (hasDynamicMarkers(step) && !isDynamicFanoutStep(step)) {
			return `Chain step ${stepIndex + 1} dynamic fanout requires parallel to be a single task template object with expand and collect.`;
		}
		if (isDynamicFanoutStep(step)) {
			if ("agent" in step || "task" in step) return `Chain step ${stepIndex + 1} dynamic fanout cannot mix top-level agent/task fields with expand/collect.`;
			if (step.parallel.as) return `Chain step ${stepIndex + 1} dynamic fanout parallel template cannot set as; use collect.as for the ordered collection.`;
			if (step.parallel.count !== undefined) return `Chain step ${stepIndex + 1} dynamic fanout parallel template cannot set count; it already runs once per expanded item.`;
		}
		for (const reference of collectStepReferences(step)) {
			if (!available.has(reference)) return `Chain step ${stepIndex + 1} references unknown chain output reference '${reference}'. Use as on an earlier successful step or parallel task.`;
		}
		for (const name of stepOutputNames(step)) {
			if (!OUTPUT_NAME_RE.test(name)) return `Chain step ${stepIndex + 1} has invalid chain output name '${name}'. Use /^[A-Za-z_][A-Za-z0-9_]*$/.`;
			if (available.has(name)) return `Chain step ${stepIndex + 1} has duplicate chain output name '${name}'. Each as/collect.as name must be unique.`;
			available.add(name);
		}
	}
	return undefined;
}

export function renderChainTemplate(template: string, input: RenderChainTemplateInput): string {
	let rendered = template;
	rendered = rendered.replace(/\{task\}/g, input.originalTask);
	rendered = rendered.replace(/\{previous\}/g, input.previous);
	rendered = rendered.replace(/\{chain_dir\}/g, input.chainDir);
	rendered = rendered.replace(OUTPUT_REF_RE, (_match, name: string) => stringifyTemplateValue(input.outputs[name]));
	if (input.itemName) {
		const escaped = input.itemName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		rendered = rendered.replace(new RegExp(`\\{${escaped}(?:\\.([^}]+))?\\}`, "g"), (_match, path: string | undefined) => stringifyTemplateValue(readDotPath(input.item, path ?? "")));
	}
	return rendered;
}

function cloneTemplateTask(template: ParallelTaskItem): ParallelTaskItem {
	return { ...template };
}

export function resolveDynamicFanout(input: {
	step: DynamicFanoutStep;
	outputs: NamedChainOutputs;
	originalTask: string;
	previous: string;
	chainDir: string;
}): DynamicFanoutResult {
	const { step, outputs, originalTask, previous, chainDir } = input;
	const maxItems = step.expand.maxItems;
	if (typeof maxItems !== "number" || !Number.isInteger(maxItems) || maxItems <= 0) {
		return { error: "Dynamic fanout expand.maxItems is required and must be a positive integer." };
	}
	const source = outputs[step.expand.from.output];
	if (source === undefined) return { error: `Dynamic fanout references unknown expand output '${step.expand.from.output}'.` };
	const itemsValue = readJsonPointer(source, step.expand.from.path);
	if (!Array.isArray(itemsValue)) {
		return { error: `Dynamic fanout source '${step.expand.from.output}' at path '${step.expand.from.path ?? ""}' must be an array from structured output.` };
	}
	if (itemsValue.length > maxItems) {
		return { error: `Dynamic fanout expands to ${itemsValue.length} items, exceeding maxItems ${maxItems}.` };
	}
	const itemName = step.expand.item || "item";
	if (!OUTPUT_NAME_RE.test(itemName)) return { error: `Dynamic fanout item name '${itemName}' is invalid. Use /^[A-Za-z_][A-Za-z0-9_]*$/.` };
	const keys = itemsValue.map((item) => stringifyTemplateValue(readJsonPointer(item, step.expand.key)));
	const parallel = itemsValue.map((item) => {
		const task = cloneTemplateTask(step.parallel);
		if (task.task) task.task = renderChainTemplate(task.task, { originalTask, previous, chainDir, outputs, itemName, item });
		if (task.label) task.label = renderChainTemplate(task.label, { originalTask, previous, chainDir, outputs, itemName, item });
		return task;
	});
	return {
		parallelStep: {
			parallel,
			...(step.cwd ? { cwd: step.cwd } : {}),
			...(step.concurrency !== undefined ? { concurrency: step.concurrency } : {}),
			...(step.failFast !== undefined ? { failFast: step.failFast } : {}),
			...(step.worktree !== undefined ? { worktree: step.worktree } : {}),
		},
		items: itemsValue,
		keys,
		collectAs: step.collect.as,
	};
}

export function namedOutputFromResult(result: SingleResult): unknown {
	return result.structuredOutput !== undefined ? result.structuredOutput : getSingleResultOutput(result);
}

export function collectDynamicResults(results: SingleResult[], items: unknown[], keys: string[] | undefined): CollectedDynamicResult[] {
	return results.map((result, index) => ({
		...(keys?.[index] ? { key: keys[index] } : {}),
		item: items[index],
		agent: result.agent,
		output: namedOutputFromResult(result),
		exitCode: result.exitCode,
		...(result.error ? { error: result.error } : {}),
	}));
}
