import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tryImport } from "../support/helpers.ts";

interface TopLevelAsyncModule {
	applyForceTopLevelAsyncOverride<T extends { async?: boolean; clarify?: boolean }>(
		params: T,
		depth: number,
		forceTopLevelAsync: boolean,
	): T;
	applyForceTopLevelAsyncOverrideForExecution<T extends { async?: boolean; clarify?: boolean }>(
		params: T,
		depth: number,
		forceTopLevelAsync: boolean,
	): T;
}

interface ExpandedWorkflowParams {
	async?: boolean;
	clarify?: boolean;
	tasks?: Array<{ agent: string; task: string }>;
	chain?: unknown[];
}

interface WorkflowModule {
	expandBuiltinWorkflowParams(params: { workflow: string; task: string; async?: boolean }): {
		params?: ExpandedWorkflowParams;
		error?: string;
		expanded?: boolean;
	};
}

const mod = await tryImport<TopLevelAsyncModule>("./src/runs/background/top-level-async.ts");
const workflowMod = await tryImport<WorkflowModule>("./src/runs/shared/workflows.ts");
const available = !!mod && !!workflowMod;

describe("force top-level async helper", { skip: !available ? "pi packages not available" : undefined }, () => {
	it("forces top-level calls async and disables clarify", () => {
		const params = { async: false, clarify: true, agent: "worker" };
		const next = mod!.applyForceTopLevelAsyncOverride(params, 0, true);
		assert.notEqual(next, params);
		assert.equal(next.async, true);
		assert.equal(next.clarify, false);
		assert.equal(next.agent, "worker");
	});

	it("forces expanded builtin workflows async only at the top level", () => {
		for (const workflow of ["builtin.quality-gate", "builtin.research-decision", "builtin.generate-filter"]) {
			const expanded = workflowMod!.expandBuiltinWorkflowParams({ workflow, task: "Verify", async: false });
			assert.equal(expanded.error, undefined);
			assert.equal(expanded.expanded, true);
			assert.ok(expanded.params);

			const topLevel = mod!.applyForceTopLevelAsyncOverrideForExecution(expanded.params, 0, true);
			assert.equal(topLevel.async, true);

			const nested = mod!.applyForceTopLevelAsyncOverrideForExecution(expanded.params, 1, true);
			assert.equal(nested, expanded.params);
			assert.equal(nested.async, false);
		}
	});

	it("leaves nested calls unchanged", () => {
		const params = { async: false, clarify: true };
		const next = mod!.applyForceTopLevelAsyncOverride(params, 1, true);
		assert.equal(next, params);
	});

	it("leaves top-level calls unchanged when the feature is off", () => {
		const params = { async: false, clarify: true };
		const next = mod!.applyForceTopLevelAsyncOverride(params, 0, false);
		assert.equal(next, params);
	});
});
