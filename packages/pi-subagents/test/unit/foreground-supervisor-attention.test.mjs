import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { runSync } = await loadTs("../../src/runs/foreground/execution.ts");
const { compactForegroundDetails } = await loadTs("../../src/shared/utils.ts");

function makeFakePi(lines) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\n${lines.map((line) => `console.log(${JSON.stringify(JSON.stringify(line))});`).join("\n")}\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

function makeDelayedFakePi(lines, delayMs = 100) {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-fake-pi-"));
	const bin = path.join(tmp, "pi");
	fs.writeFileSync(
		bin,
		`#!/usr/bin/env node\nsetTimeout(() => {\n${lines.map((line) => `console.log(${JSON.stringify(JSON.stringify(line))});`).join("\n")}\n}, ${delayMs});\n`,
		{ mode: 0o700 },
	);
	return tmp;
}

class FakeIntercomEvents {
	#handlers = new Map();

	on(channel, handler) {
		const handlers = this.#handlers.get(channel) ?? [];
		handlers.push(handler);
		this.#handlers.set(channel, handlers);
		return () => {
			const current = this.#handlers.get(channel) ?? [];
			this.#handlers.set(channel, current.filter((candidate) => candidate !== handler));
		};
	}

	emit(channel, data) {
		for (const handler of this.#handlers.get(channel) ?? []) {
			handler(data);
		}
	}
}

test("contact_supervisor need_decision emits immediate needs_attention", async () => {
	const fakePiDir = makeFakePi([
		{
			type: "tool_execution_start",
			toolName: "contact_supervisor",
			args: { reason: "need_decision", message: "Need supervisor decision." },
		},
		{ type: "tool_execution_end", toolName: "contact_supervisor" },
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "waiting" }],
				stopReason: "stop",
			},
		},
	]);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const controlEvents = [];
	const updates = [];
	try {
		const result = await runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Ask for a decision",
			{
				runId: "run-1",
				index: 0,
				artifactsDir: path.join(fakePiDir, "artifacts"),
				onControlEvent: (event) => controlEvents.push(event),
				onUpdate: (update) => updates.push(update),
			},
		);

		assert.equal(result.exitCode, 0);
		assert.equal(controlEvents.length, 1);
		assert.equal(controlEvents[0].type, "needs_attention");
		assert.equal(controlEvents[0].reason, "supervisor_decision");
		assert.equal(controlEvents[0].currentTool, "contact_supervisor");
		assert.match(controlEvents[0].message, /delegate needs supervisor decision/);
		assert.equal(result.controlEvents?.[0]?.reason, "supervisor_decision");
		assert.equal(
			updates.some((update) => update.details?.controlEvents?.some((event) => event.reason === "supervisor_decision")),
			true,
		);
	} finally {
		process.env.PATH = oldPath;
	}
});

test("detached contact_supervisor need_decision preserves needs_attention on result", async () => {
	const fakePiDir = makeFakePi([
		{
			type: "tool_execution_start",
			toolName: "contact_supervisor",
			args: { reason: "need_decision", message: "Need supervisor decision." },
		},
	]);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const abort = new AbortController();
	try {
		const result = await runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Ask for a decision",
			{
				runId: "run-detached",
				index: 0,
				allowIntercomDetach: true,
				signal: abort.signal,
				artifactsDir: path.join(fakePiDir, "artifacts"),
				onControlEvent: () => abort.abort(),
			},
		);

		assert.equal(result.detached, true);
		assert.equal(result.exitCode, 0);
		assert.equal(result.controlEvents?.[0]?.reason, "supervisor_decision");
	} finally {
		process.env.PATH = oldPath;
	}
});

test("targeted intercom detach accepts only the matching child", async () => {
	const fakePiDir = makeFakePi([
		{
			type: "tool_execution_start",
			toolName: "contact_supervisor",
			args: { reason: "need_decision", message: "Need supervisor decision." },
		},
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "done" }],
				stopReason: "stop",
			},
		},
	]);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const intercomEvents = new FakeIntercomEvents();
	try {
		const nonMatching = await runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Intercom orchestration channel: Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Ask for a decision",
			{
				runId: "run-targeted",
				index: 0,
				allowIntercomDetach: true,
				intercomEvents,
				artifactsDir: path.join(fakePiDir, "artifacts"),
				onControlEvent: () => intercomEvents.emit("pi-intercom:detach-request", {
					requestId: "request-nonmatching",
					runId: "other-run",
					childIndex: "0",
					messageId: "message-1",
				}),
			},
		);
		assert.equal(nonMatching.detached, undefined);
		assert.equal(nonMatching.exitCode, 0);

		const matching = await runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Intercom orchestration channel: Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Ask for a decision",
			{
				runId: "run-targeted",
				index: 0,
				allowIntercomDetach: true,
				intercomEvents,
				artifactsDir: path.join(fakePiDir, "artifacts"),
				onControlEvent: () => intercomEvents.emit("pi-intercom:detach-request", {
					requestId: "request-matching",
					runId: "run-targeted",
					childIndex: "0",
					messageId: "message-1",
				}),
			},
		);
		assert.equal(matching.detached, true);
		assert.equal(matching.exitCode, 0);
	} finally {
		process.env.PATH = oldPath;
	}
});

test("targeted intercom detach can arrive before contact_supervisor tool start is parsed", async () => {
	const fakePiDir = makeDelayedFakePi([
		{
			type: "tool_execution_start",
			toolName: "contact_supervisor",
			args: { reason: "need_decision", message: "Need supervisor decision." },
		},
	], 100);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const intercomEvents = new FakeIntercomEvents();
	try {
		const run = runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Intercom orchestration channel: Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Ask for a decision",
			{
				runId: "run-race",
				index: 0,
				allowIntercomDetach: true,
				intercomEvents,
				artifactsDir: path.join(fakePiDir, "artifacts"),
			},
		);
		setTimeout(() => intercomEvents.emit("pi-intercom:detach-request", {
			requestId: "request-before-tool-start",
			runId: "run-race",
			childIndex: "0",
			messageId: "message-before-tool-start",
		}), 10);
		const result = await run;
		assert.equal(result.detached, true);
		assert.equal(result.exitCode, 0);
	} finally {
		process.env.PATH = oldPath;
	}
});

test("compact foreground details exposes result control events at top level", () => {
	const event = {
		type: "needs_attention",
		to: "needs_attention",
		ts: Date.now(),
		agent: "delegate",
		runId: "run-details",
		message: "delegate needs supervisor decision",
		reason: "supervisor_decision",
		currentTool: "contact_supervisor",
	};
	const details = compactForegroundDetails({
		mode: "single",
		runId: "run-details",
		results: [
			{
				agent: "delegate",
				task: "Ask for a decision",
				exitCode: 0,
				messages: [],
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 0 },
				controlEvents: [event],
			},
		],
	});

	assert.equal(details.controlEvents?.[0]?.reason, "supervisor_decision");
	assert.equal(details.results[0].controlEvents?.[0]?.reason, "supervisor_decision");
});

test("contact_supervisor progress_update does not emit supervisor-decision attention", async () => {
	const fakePiDir = makeFakePi([
		{
			type: "tool_execution_start",
			toolName: "contact_supervisor",
			args: { reason: "progress_update", message: "UPDATE: still working." },
		},
		{ type: "tool_execution_end", toolName: "contact_supervisor" },
		{
			type: "message_end",
			message: {
				role: "assistant",
				content: [{ type: "text", text: "done" }],
				stopReason: "stop",
			},
		},
	]);
	const oldPath = process.env.PATH;
	process.env.PATH = `${fakePiDir}${path.delimiter}${oldPath ?? ""}`;
	const controlEvents = [];
	try {
		await runSync(
			fakePiDir,
			[
				{
					name: "delegate",
					description: "Delegate",
					source: "builtin",
					filePath: "builtin/delegate.md",
					systemPrompt: "Delegate.",
					systemPromptMode: "replace",
					inheritProjectContext: true,
					inheritSkills: false,
					tools: ["contact_supervisor"],
				},
			],
			"delegate",
			"Send progress",
			{
				runId: "run-2",
				index: 0,
				artifactsDir: path.join(fakePiDir, "artifacts"),
				onControlEvent: (event) => controlEvents.push(event),
			},
		);

		assert.equal(controlEvents.some((event) => event.reason === "supervisor_decision"), false);
	} finally {
		process.env.PATH = oldPath;
	}
});
