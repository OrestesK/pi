import test from "node:test";
import assert from "node:assert/strict";

import { Compile } from "typebox/compile";

import { loadTs } from "../support/load-ts.mjs";

const {
	getNamedOutputReferences,
	readJsonPointer,
	renderChainTemplate,
	resolveDynamicFanout,
	validateChainOutputNames,
} = await loadTs("../../src/shared/chain-dynamic.ts");
const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");
const { executeAsyncChain } = await loadTs("../../src/runs/background/async-execution.ts");

test("validates named outputs and references before execution", () => {
	assert.equal(
		validateChainOutputNames([
			{ agent: "scout", as: "targets", task: "Find targets" },
			{ agent: "planner", task: "Plan from {outputs.targets}" },
		]),
		undefined,
	);

	assert.match(
		validateChainOutputNames([
			{ agent: "scout", as: "targets", task: "Find targets" },
			{ agent: "planner", as: "targets", task: "Plan" },
		]) ?? "",
		/duplicate chain output name 'targets'/,
	);
	assert.match(
		validateChainOutputNames([{ agent: "scout", as: "bad-name", task: "Find" }]) ?? "",
		/invalid chain output name 'bad-name'/,
	);
	assert.match(
		validateChainOutputNames([{ agent: "planner", task: "Plan from {outputs.missing}" }]) ?? "",
		/unknown chain output reference 'missing'/,
	);
});

test("renders templates from original task, previous output, named outputs, and item fields", () => {
	assert.deepEqual(getNamedOutputReferences("A {outputs.targets} B {outputs.reviews}"), ["targets", "reviews"]);
	assert.equal(readJsonPointer({ items: [{ path: "a.ts" }] }, "/items/0/path"), "a.ts");
	assert.equal(
		renderChainTemplate(
			"Review {target.path}: {target.reason}; all={outputs.targets}; task={task}; prev={previous}; dir={chain_dir}",
			{
				originalTask: "root task",
				previous: "prev text",
				chainDir: "/tmp/chain",
				outputs: { targets: [{ path: "a.ts", reason: "risky" }] },
				itemName: "target",
				item: { path: "a.ts", reason: "risky" },
			},
		),
		'Review a.ts: risky; all=[{"path":"a.ts","reason":"risky"}]; task=root task; prev=prev text; dir=/tmp/chain',
	);
});

test("expands one dynamic fanout task per structured output item", () => {
	const outputs = {
		targets: {
			items: [
				{ path: "a.ts", reason: "auth" },
				{ path: "b.ts", reason: "edge" },
			],
		},
	};

	const fanout = resolveDynamicFanout({
		step: {
			expand: {
				from: { output: "targets", path: "/items" },
				item: "target",
				key: "/path",
				maxItems: 3,
			},
			parallel: {
				agent: "reviewer",
				label: "Review {target.path}",
				task: "Review {target.path}: {target.reason}",
				outputSchema: { type: "object" },
			},
			collect: { as: "reviews" },
			concurrency: 2,
		},
		outputs,
		originalTask: "root task",
		previous: "previous text",
		chainDir: "/tmp/chain",
	});

	assert.equal(fanout.error, undefined);
	assert.deepEqual(fanout.collectAs, "reviews");
	assert.deepEqual(fanout.items, outputs.targets.items);
	assert.deepEqual(fanout.keys, ["a.ts", "b.ts"]);
	assert.deepEqual(fanout.parallelStep, {
		parallel: [
			{
				agent: "reviewer",
				label: "Review a.ts",
				task: "Review a.ts: auth",
				outputSchema: { type: "object" },
			},
			{
				agent: "reviewer",
				label: "Review b.ts",
				task: "Review b.ts: edge",
				outputSchema: { type: "object" },
			},
		],
		concurrency: 2,
	});
});

test("rejects unsupported dynamic fanout template fields and mixed shapes", () => {
	assert.match(
		validateChainOutputNames([
			{ agent: "scout", as: "targets", task: "Find" },
			{
				expand: { from: { output: "targets", path: "/items" }, maxItems: 2 },
				parallel: { agent: "reviewer", as: "review", task: "Review" },
				collect: { as: "reviews" },
			},
		]) ?? "",
		/dynamic fanout parallel template cannot set as/,
	);
	assert.match(
		validateChainOutputNames([
			{ agent: "scout", as: "targets", task: "Find" },
			{
				expand: { from: { output: "targets", path: "/items" }, maxItems: 2 },
				parallel: { agent: "reviewer", count: 2, task: "Review" },
				collect: { as: "reviews" },
			},
		]) ?? "",
		/dynamic fanout parallel template cannot set count/,
	);
	assert.match(
		validateChainOutputNames([
			{ agent: "scout", as: "targets", task: "Find" },
			{
				expand: { from: { output: "targets", path: "/items" }, maxItems: 2 },
				parallel: [{ agent: "reviewer", task: "Review" }],
				collect: { as: "reviews" },
			},
		]) ?? "",
		/dynamic fanout requires parallel to be a single task template object/,
	);
});

test("public schema accepts dynamic fanout chain shape", () => {
	const validator = Compile(SubagentParams);
	assert.equal(
		validator.Check({
			chain: [
				{
					agent: "scout",
					as: "targets",
					task: "Return targets",
					outputSchema: { type: "object" },
				},
				{
					expand: { from: { output: "targets", path: "/items" }, item: "target", maxItems: 5 },
					parallel: { agent: "reviewer", task: "Review {target.path}" },
					collect: { as: "reviews" },
				},
			],
		}),
		true,
	);
});

function asyncDynamicBase(chain) {
	return executeAsyncChain("unit-dynamic-async", {
		agents: [
			{ name: "scout", description: "Scout", source: "builtin", filePath: "builtin/scout.md", systemPrompt: "Scout.", systemPromptMode: "replace", inheritProjectContext: true, inheritSkills: false, tools: ["read"] },
			{ name: "reviewer", description: "Reviewer", source: "builtin", filePath: "builtin/reviewer.md", systemPrompt: "Review.", systemPromptMode: "replace", inheritProjectContext: true, inheritSkills: false, tools: ["read"] },
		],
		ctx: { pi: {}, cwd: "/repo", currentSessionId: "session-1" },
		cwd: "/repo",
		artifactConfig: { enabled: false, inlineOnSuccess: true, inlineOnError: true },
		shareEnabled: false,
		maxSubagentDepth: 0,
		chain,
	});
}

test("async dynamic fanout chains are rejected before background spawn", () => {
	const result = asyncDynamicBase([
		{ agent: "scout", as: "targets", task: "Return targets", outputSchema: { type: "object" } },
		{
			expand: { from: { output: "targets", path: "/items" }, item: "target", maxItems: 5 },
			parallel: { agent: "reviewer", task: "Review {target.path}" },
			collect: { as: "reviews" },
		},
	]);

	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /Dynamic fanout chain step 2 is not supported in async\/background mode yet/);
});

test("async rejects invalid dynamic fanout shapes before static parallel classification", () => {
	const result = asyncDynamicBase([
		{ agent: "scout", as: "targets", task: "Return targets", outputSchema: { type: "object" } },
		{
			expand: { from: { output: "targets", path: "/items" }, maxItems: 5 },
			parallel: [{ agent: "reviewer", task: "Review" }],
			collect: { as: "reviews" },
		},
	]);

	assert.equal(result.isError, true);
	assert.match(result.content[0].text, /dynamic fanout requires parallel to be a single task template object/);
});

test("rejects invalid dynamic fanout sources and limits", () => {
	assert.match(
		resolveDynamicFanout({
			step: { expand: { from: { output: "targets", path: "/items" } }, parallel: { agent: "reviewer" }, collect: { as: "reviews" } },
			outputs: { targets: { items: [] } },
			originalTask: "root",
			previous: "",
			chainDir: "/tmp/chain",
		}).error ?? "",
		/expand.maxItems is required/,
	);
	assert.match(
		resolveDynamicFanout({
			step: { expand: { from: { output: "targets", path: "/items" }, maxItems: 1 }, parallel: { agent: "reviewer" }, collect: { as: "reviews" } },
			outputs: { targets: { items: [{}, {}] } },
			originalTask: "root",
			previous: "",
			chainDir: "/tmp/chain",
		}).error ?? "",
		/expands to 2 items, exceeding maxItems 1/,
	);
	assert.match(
		resolveDynamicFanout({
			step: { expand: { from: { output: "missing", path: "/items" }, maxItems: 1 }, parallel: { agent: "reviewer" }, collect: { as: "reviews" } },
			outputs: {},
			originalTask: "root",
			previous: "",
			chainDir: "/tmp/chain",
		}).error ?? "",
		/unknown expand output 'missing'/,
	);
});
