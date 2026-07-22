import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { mapSavedChainSteps, registerSlashCommands } = await loadTs("../../src/slash/slash-commands.ts");
const { SLASH_RESULT_TYPE, SLASH_TEXT_RESULT_TYPE } = await loadTs("../../src/shared/types.ts");

function makePi() {
	const commands = new Map();
	const messages = [];
	return {
		commands,
		messages,
		registerCommand(name, config) { commands.set(name, config); },
		sendMessage(message) { messages.push(message); },
	};
}

function makeContext(branch) {
	return {
		hasUI: false,
		ui: { notify() {}, setToolsExpanded() {}, setStatus() {} },
		sessionManager: {
			getBranch: () => branch,
			getSessionFile: () => null,
		},
	};
}

function makeChildResult(agent, usage, sessionFile, messages = []) {
	return {
		agent,
		task: "task",
		exitCode: 0,
		messages,
		usage,
		...(sessionFile ? { sessionFile } : {}),
	};
}

test("subagent-cost slash command reports parent and child usage totals", async () => {
	const pi = makePi();
	registerSlashCommands(pi, { baseCwd: process.cwd() });
	const command = pi.commands.get("subagent-cost");
	assert.equal(typeof command?.handler, "function");

	await command.handler("", makeContext([
		{
			type: "message",
			message: {
				role: "assistant",
				usage: { input: 1000, output: 250, cacheRead: 50, cacheWrite: 10, cost: { total: 0.02 } },
			},
		},
		{
			type: "custom_message",
			customType: SLASH_RESULT_TYPE,
			details: {
				requestId: "request-1",
				result: {
					content: [],
					details: {
						mode: "single",
						results: [makeChildResult("worker", { input: 200, output: 100, cacheRead: 0, cacheWrite: 0, cost: 0.005, turns: 1 }, "/tmp/worker.jsonl")],
					},
				},
			},
		},
	]));

	assert.equal(pi.messages.length, 1);
	assert.equal(pi.messages[0].customType, SLASH_TEXT_RESULT_TYPE);
	assert.equal(pi.messages[0].display, true);
	assert.match(pi.messages[0].content, /^Subagent cost/);
	assert.match(pi.messages[0].content, /Parent: ↑1\.0k ↓250 \$0\.0200 \(cache read 50, cache write 10, 1 turn\)/);
	assert.match(pi.messages[0].content, /Child 1 \(worker\): ↑200 ↓100 \$0\.0050 \(1 turn\)/);
	assert.match(pi.messages[0].content, /Session: \/tmp\/worker\.jsonl/);
	assert.match(pi.messages[0].content, /Children: ↑200 ↓100 \$0\.0050 \(1 turn\)/);
	assert.match(pi.messages[0].content, /Total: ↑1\.2k ↓350 \$0\.0250 \(cache read 50, cache write 10, 2 turns\)/);
});

test("subagent-cost slash command reports no child usage when none exists", async () => {
	const pi = makePi();
	registerSlashCommands(pi, { baseCwd: process.cwd() });

	await pi.commands.get("subagent-cost").handler("", makeContext([]));

	assert.equal(pi.messages[0].customType, SLASH_TEXT_RESULT_TYPE);
	assert.match(pi.messages[0].content, /No subagent child usage found in this session\./);
});

test("subagent-cost slash command marks missing structured cost as unknown", async () => {
	const pi = makePi();
	registerSlashCommands(pi, { baseCwd: process.cwd() });

	await pi.commands.get("subagent-cost").handler("", makeContext([
		{
			type: "message",
			message: {
				role: "assistant",
				usage: { input: 100, output: 20 },
			},
		},
		{
			type: "custom_message",
			customType: SLASH_RESULT_TYPE,
			details: {
				requestId: "request-2",
				result: {
					content: [],
					details: {
						mode: "single",
						results: [makeChildResult("worker", { input: 20, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 })],
					},
				},
			},
		},
	]));

	assert.match(pi.messages[0].content, /Parent: ↑100 ↓20 cost unknown \(1 turn\)/);
	assert.match(pi.messages[0].content, /Child 1 \(worker\): ↑20 ↓10 cost unknown \(1 turn\)/);
	assert.match(pi.messages[0].content, /Total: ↑120 ↓30 cost unknown \(2 turns\)/);
});

test("subagent-cost slash command reports structured zero child cost as zero", async () => {
	const pi = makePi();
	registerSlashCommands(pi, { baseCwd: process.cwd() });

	await pi.commands.get("subagent-cost").handler("", makeContext([
		{
			type: "custom_message",
			customType: SLASH_RESULT_TYPE,
			details: {
				requestId: "request-3",
				result: {
					content: [],
					details: {
						mode: "single",
						results: [makeChildResult(
							"worker",
							{ input: 20, output: 10, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
							undefined,
							[{ role: "assistant", usage: { input: 20, output: 10, cost: { total: 0 } } }],
						)],
					},
				},
			},
		},
	]));

	assert.match(pi.messages[0].content, /Child 1 \(worker\): ↑20 ↓10 \$0\.0000 \(1 turn\)/);
	assert.match(pi.messages[0].content, /Children: ↑20 ↓10 \$0\.0000 \(1 turn\)/);
	assert.match(pi.messages[0].content, /Total: ↑20 ↓10 \$0\.0000 \(1 turn\)/);
});

test("saved chain mapping preserves dynamic fanout steps", () => {
	const dynamicStep = {
		expand: { from: { output: "targets", path: "/items" }, item: "target", maxItems: 3 },
		parallel: { agent: "reviewer", task: "Review {target.path}" },
		collect: { as: "reviews" },
		concurrency: 2,
	};
	const mapped = mapSavedChainSteps({
		name: "fanout",
		description: "dynamic fanout",
		source: "project",
		filePath: "/tmp/fanout.chain.md",
		steps: [dynamicStep],
	});

	assert.deepEqual(mapped, [dynamicStep]);
});
