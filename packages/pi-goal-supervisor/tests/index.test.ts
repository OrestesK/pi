import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import piGoalSupervisor, { registerGoalSupervisor } from "../src/index.ts";
import { STATE_CUSTOM_TYPE, type GoalSupervisorState } from "../src/types.ts";

type TestHarness = {
	entries: Array<{ type: "custom"; customType: string; data: unknown }>;
	hooks: Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>;
	handler: (args: string, ctx: unknown) => Promise<void>;
	ctx: {
		sessionManager: {
			getCwd: () => string;
			getSessionId: () => string;
			getBranch: () => Array<{
				type: "custom";
				customType: string;
				data: unknown;
			}>;
		};
		isIdle: () => boolean;
		hasPendingMessages: () => boolean;
		ui: { notify(): void; setWidget(): void };
	};
	sendCount: () => number;
	lastState: () => GoalSupervisorState | undefined;
};

function createGoalHarness(
	deps: Parameters<typeof registerGoalSupervisor>[2] = {},
): TestHarness {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let sends = 0;
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {
			sends += 1;
		},
	};
	registerGoalSupervisor(api, {}, deps);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};
	const lastState = () =>
		entries.filter((entry) => entry.customType === STATE_CUSTOM_TYPE).at(-1)
			?.data as GoalSupervisorState | undefined;
	return { entries, hooks, handler, ctx, sendCount: () => sends, lastState };
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
	const start = source.indexOf(startMarker);
	assert.notEqual(start, -1, `missing start marker: ${startMarker}`);
	const end = source.indexOf(endMarker, start + startMarker.length);
	assert.notEqual(end, -1, `missing end marker: ${endMarker}`);
	return source.slice(start, end);
}

async function deliverPendingContinuation(harness: TestHarness): Promise<void> {
	const id = harness.lastState()?.pendingContinuation?.id;
	assert.ok(id);
	await harness.hooks.get("before_agent_start")?.(
		{ systemPrompt: "base", prompt: id },
		harness.ctx,
	);
}

test("default export registers goal command and lifecycle hooks", async () => {
	const hooks: string[] = [];
	const commands: string[] = [];
	const api = {
		on(event: string) {
			hooks.push(event);
		},
		registerCommand(name: string) {
			commands.push(name);
		},
	};

	await piGoalSupervisor(api);

	assert.deepEqual(commands, ["goal"]);
	assert.ok(hooks.includes("session_start"));
	assert.ok(hooks.includes("before_agent_start"));
	assert.ok(hooks.includes("turn_end"));
	assert.ok(hooks.includes("session_before_compact"));
	assert.ok(hooks.includes("session_compact"));
	assert.ok(hooks.includes("session_shutdown"));
});

test("session_before_compact and session_shutdown persist active state", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	const countStateEntries = () =>
		harness.entries.filter((entry) => entry.customType === STATE_CUSTOM_TYPE)
			.length;
	const beforeCompactCount = countStateEntries();

	harness.hooks.get("session_before_compact")?.({}, harness.ctx);
	assert.equal(countStateEntries(), beforeCompactCount + 1);
	assert.equal(harness.lastState()?.objective, "finish objective");

	const beforeShutdownCount = countStateEntries();
	harness.hooks.get("session_shutdown")?.({}, harness.ctx);
	assert.equal(countStateEntries(), beforeShutdownCount + 1);
	assert.equal(harness.lastState()?.objective, "finish objective");
});

test("pause aborts an active turn but clear does not", async () => {
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const api = {
		on() {},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	await piGoalSupervisor(api);
	assert.ok(handler);
	let aborts = 0;
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		abort: () => {
			aborts += 1;
		},
		ui: { notify() {}, setWidget() {} },
	};

	await handler("live smoke", ctx);
	await handler("pause manual", ctx);
	await handler("resume", ctx);
	await handler("clear", ctx);

	assert.equal(aborts, 1);
});

test("widget and supervisor prompt show unbounded turn count", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let widgetContent: string[] | undefined;
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	registerGoalSupervisor(api);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: {
			notify() {},
			setWidget(_key: string, content: string[] | undefined) {
				widgetContent = content;
			},
		},
	};

	await handler("finish objective", ctx);
	const promptResult = hooks.get("before_agent_start")?.(
		{ systemPrompt: "base", prompt: "continue" },
		ctx,
	) as { systemPrompt: string } | undefined;

	const prompt = promptResult?.systemPrompt ?? "";
	assert.equal(widgetContent?.[0], "goal: running 0 turns");
	assert.doesNotMatch(widgetContent?.[0] ?? "", /\d+\/\d+/);
	assert.match(prompt, /turns: 0/i);
	assert.doesNotMatch(prompt, /\d+\/\d+/);
	assert.doesNotMatch(prompt, /completed turns/i);
	assert.match(prompt, /100% blocked/i);
	assert.match(prompt, /internal plan approval/i);
	assert.match(prompt, /routine local work/i);
	assert.match(prompt, /minor\/reversible local edits/i);
	assert.match(prompt, /tests, docs, formatting/i);
	assert.match(prompt, /routine implementation choices/i);
	assert.match(prompt, /safe local\/read-only\/reversible/i);
	assert.match(
		prompt,
		/disables direct user asking, approval, confirmation, and HITL tools/i,
	);
	assert.match(prompt, /Automatic command\/tool blockers remain active/i);
	assert.match(prompt, /Do not ask for approval, confirmation, clarification/i);
	assert.match(prompt, /Default execution posture/i);
	assert.match(prompt, /use the main agent by default/i);
	assert.match(prompt, /do not start a supervised team/i);
	assert.match(prompt, /Contract Gate/i);
	assert.match(prompt, /contract card and owner map before editing/i);
	assert.match(prompt, /source-of-truth files\/layers/i);
	assert.match(prompt, /final self-review/i);
	assert.match(prompt, /forbidden alternate shapes or artifacts/i);
	assert.doesNotMatch(prompt, /use a supervised team by default/i);
	assert.doesNotMatch(prompt, /two distinct reviewer\/monitor agents/i);
	assert.doesNotMatch(prompt, /differentiated reviewer roles/i);
	assert.doesNotMatch(prompt, /GOAL_DONE requires reducer PASS/i);
	assert.doesNotMatch(prompt, /web\/code research/i);
	assert.match(prompt, /automatic command\/tool blocker/i);
	assert.match(
		prompt,
		/missing required tool, credential, auth, access, or service/i,
	);
	assert.match(
		prompt,
		/GOAL_BLOCKED: <specific blocker and evidence that no safe non-asking next step exists>/i,
	);
	assert.doesNotMatch(prompt, /required approval/i);
	assert.doesNotMatch(prompt, /ambiguous product\/API decision/i);
});

test("goal-crafter templates default to main-agent goals", () => {
	const skillPath = join(
		dirname(fileURLToPath(import.meta.url)),
		"../../../skills/goal-crafter/SKILL.md",
	);
	const skill = readFileSync(skillPath, "utf8");
	const defaultTemplate = sliceBetween(
		skill,
		"Default format:",
		"### 5. Adapt the goal to the task shape",
	);
	const expandedTemplate = sliceBetween(
		skill,
		"Use the expanded form",
		"Iteration policy:",
	);

	for (const template of [defaultTemplate, expandedTemplate]) {
		assert.match(template, /Default to the main agent/i);
		assert.match(template, /pre-edit contract card and owner map/i);
		assert.match(template, /final self-review against/i);
		assert.doesNotMatch(
			template,
			/Default to a supervised team when available/i,
		);
		assert.doesNotMatch(
			template,
			/Use web\/code research when current external docs/i,
		);
		assert.doesNotMatch(
			template,
			/parent\/supervisor synthesis of worker and reviewer\/monitor findings/i,
		);
	}
});

test("turn_end rejects disallowed goal blockers and continues", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	const sendsBefore = harness.sendCount();
	await harness.hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content: "GOAL_BLOCKED: waiting for internal plan approval",
			},
		},
		harness.ctx,
	);

	assert.equal(harness.lastState()?.status, "running");
	assert.equal(harness.lastState()?.lastBlocker, undefined);
	assert.equal(harness.sendCount(), sendsBefore + 1);
});

test("turn_end rejects user permission blockers and continues", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	const sendsBefore = harness.sendCount();
	await harness.hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content:
					"GOAL_BLOCKED: unapproved production/remote/external-account mutation",
			},
		},
		harness.ctx,
	);

	assert.equal(harness.lastState()?.status, "running");
	assert.equal(harness.lastState()?.lastBlocker, undefined);
	assert.equal(harness.sendCount(), sendsBefore + 1);
});

test("turn_end accepts automatic or missing-capability blockers without queueing continuation", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	const sendsBefore = harness.sendCount();
	await harness.hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content:
					"GOAL_BLOCKED: automatic command blocker denied mutating git push",
			},
		},
		harness.ctx,
	);

	assert.equal(harness.lastState()?.status, "blocked");
	assert.equal(harness.lastState()?.lastBlocker?.source, "marker");
	assert.equal(harness.sendCount(), sendsBefore);
});

test("blocked marker goals auto-resume on the next agent prompt", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	await harness.hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content:
					"GOAL_BLOCKED: automatic command blocker denied mutating git push",
			},
		},
		harness.ctx,
	);
	assert.equal(harness.lastState()?.status, "blocked");

	const promptResult = harness.hooks.get("before_agent_start")?.(
		{ systemPrompt: "base", prompt: "user supplied approval context" },
		harness.ctx,
	) as { systemPrompt: string } | undefined;

	assert.equal(harness.lastState()?.status, "running");
	assert.match(promptResult?.systemPrompt ?? "", /Goal Supervisor/);
});

test("status and judge-error blocks do not auto-resume", async () => {
	const harness = createGoalHarness({
		judge: () => ({
			verdict: "inconclusive",
			score: 0,
			reason: "judge unavailable",
			missingEvidence: ["working judge"],
			at: "2026-06-03T00:02:00.000Z",
		}),
	});

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	await harness.hooks.get("turn_end")?.(
		{ message: { role: "assistant", content: "Work is in progress." } },
		harness.ctx,
	);
	await harness.handler("done tests passed", harness.ctx);
	assert.equal(harness.lastState()?.status, "blocked");
	assert.equal(harness.lastState()?.lastBlocker?.source, "judge_error");

	await harness.handler("status", harness.ctx);
	assert.equal(harness.lastState()?.status, "blocked");
	const promptResult = harness.hooks.get("before_agent_start")?.(
		{ systemPrompt: "base", prompt: "try again" },
		harness.ctx,
	);
	assert.equal(promptResult, undefined);
	assert.equal(harness.lastState()?.status, "blocked");

	const sendsBeforeResume = harness.sendCount();
	await harness.handler("resume", harness.ctx);
	assert.equal(harness.lastState()?.status, "running");
	assert.equal(harness.sendCount(), sendsBeforeResume + 1);
	assert.equal(harness.lastState()?.pendingContinuation?.reason, "resume");
});

test("clear remains terminal after blocked goals", async () => {
	const harness = createGoalHarness();

	await harness.handler("finish objective", harness.ctx);
	await deliverPendingContinuation(harness);
	await harness.hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content: "GOAL_BLOCKED: automatic command blocker denied deployment",
			},
		},
		harness.ctx,
	);
	assert.equal(harness.lastState()?.status, "blocked");

	await harness.handler("clear", harness.ctx);
	const promptResult = harness.hooks.get("before_agent_start")?.(
		{ systemPrompt: "base", prompt: "continue" },
		harness.ctx,
	);

	assert.equal(promptResult, undefined);
	assert.equal(harness.lastState()?.status, "stopped");
});

test("clear aborts stale supervisor continuation prompts without aborting the command", async () => {
	const harness = createGoalHarness();
	let aborts = 0;
	const ctx = {
		...harness.ctx,
		abort: () => {
			aborts += 1;
		},
	};

	await harness.handler("finish objective", ctx);
	const pendingId = harness.lastState()?.pendingContinuation?.id;
	assert.ok(pendingId);

	await harness.handler("clear", ctx);
	assert.equal(aborts, 0);
	assert.equal(harness.lastState()?.status, "stopped");

	const promptResult = harness.hooks.get("before_agent_start")?.(
		{
			systemPrompt: "base",
			prompt: `[GOAL SUPERVISOR CONTINUATION id=${pendingId} reason=start]`,
		},
		ctx,
	);

	assert.equal(promptResult, undefined);
	assert.equal(aborts, 1);
});

test("manual /goal done fails closed when no transcript evidence exists", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let judgeCalls = 0;
	const api = {
		on() {},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	registerGoalSupervisor(
		api,
		{},
		{
			judge: () => {
				judgeCalls += 1;
				return {
					verdict: "approved",
					score: 9,
					reason: "should not run",
					missingEvidence: [],
					at: "2026-06-03T00:02:00.000Z",
				};
			},
		},
	);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};

	await handler("finish objective", ctx);
	await handler("done tests passed", ctx);

	const lastState = entries
		.filter((entry) => entry.customType === STATE_CUSTOM_TYPE)
		.at(-1)?.data as GoalSupervisorState | undefined;
	assert.equal(judgeCalls, 0);
	assert.equal(lastState?.status, "running");
	assert.equal(
		lastState?.lastJudge?.reason,
		"no transcript evidence available for completion claim",
	);
});

test("manual /goal done judges against actual prior assistant transcript", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let judgedTranscript = "";
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	registerGoalSupervisor(
		api,
		{},
		{
			judge: (_state, assistantText) => {
				judgedTranscript = assistantText;
				return {
					verdict: "approved",
					score: 9,
					reason: "manual verified",
					missingEvidence: [],
					at: "2026-06-03T00:02:00.000Z",
				};
			},
		},
	);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};

	await handler("finish objective", ctx);
	await hooks.get("turn_end")?.(
		{
			message: {
				role: "assistant",
				content: "Tests passed in the transcript.",
			},
		},
		ctx,
	);
	await handler("done tests passed", ctx);

	const lastState = entries
		.filter((entry) => entry.customType === STATE_CUSTOM_TYPE)
		.at(-1)?.data as GoalSupervisorState | undefined;
	assert.equal(judgedTranscript, "Tests passed in the transcript.");
	assert.equal(lastState?.status, "complete");
	assert.equal(lastState?.lastJudge?.reason, "manual verified");
});

test("turn_end GOAL_DONE uses injected judge and can complete the goal", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	registerGoalSupervisor(
		api,
		{},
		{
			judge: () => ({
				verdict: "approved",
				score: 9,
				reason: "verified",
				missingEvidence: [],
				at: "2026-06-03T00:02:00.000Z",
			}),
		},
	);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};

	await handler("finish objective", ctx);
	await hooks.get("turn_end")?.(
		{ message: { role: "assistant", content: "GOAL_DONE: tests passed" } },
		ctx,
	);

	const lastState = entries
		.filter((entry) => entry.customType === STATE_CUSTOM_TYPE)
		.at(-1)?.data as GoalSupervisorState | undefined;
	assert.equal(lastState?.status, "complete");
	assert.equal(lastState?.lastJudge?.reason, "verified");
});

test("branch restore clears stale in-memory goal when active branch has no state", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const notifications: string[] = [];
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
	};
	await piGoalSupervisor(api);
	assert.ok(handler);
	const ctxWithState = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setWidget() {},
		},
	};
	await handler("branch-specific objective", ctxWithState);

	const emptyBranchCtx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-2",
			getBranch: () => [],
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: {
			notify(message: string) {
				notifications.push(message);
			},
			setWidget() {},
		},
	};
	await hooks.get("session_tree")?.({}, emptyBranchCtx);
	await handler("status", emptyBranchCtx);

	assert.equal(notifications.at(-1), "No active goal.");
});

test("session_tree preserves a real pending continuation latch", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	let sendCount = 0;
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {
			sendCount += 1;
		},
	};
	await piGoalSupervisor(api);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};

	await handler("pending latch objective", ctx);
	await hooks.get("session_tree")?.({}, ctx);
	await hooks.get("session_start")?.({}, ctx);

	const lastState = entries
		.filter((entry) => entry.customType === STATE_CUSTOM_TYPE)
		.at(-1)?.data as GoalSupervisorState | undefined;
	assert.equal(sendCount, 1);
	assert.ok(lastState?.pendingContinuation);
});

test("active goals disable user permission and asking tools", async () => {
	const entries: Array<{ type: "custom"; customType: string; data: unknown }> =
		[];
	const hooks = new Map<
		string,
		(event: unknown, ctx: unknown) => Promise<void> | void | unknown
	>();
	let handler: ((args: string, ctx: unknown) => Promise<void>) | undefined;
	const allTools = [
		"read",
		"bash",
		"ask_user",
		"intercom",
		"interview",
		"contact_supervisor",
		"subagent",
		"mcp",
		"Agent",
		"custom_permission_confirm",
		"retool_retool_respond_to_react_app_thread_review",
	];
	let activeTools = [...allTools];
	const api = {
		on(
			event: string,
			hook: (event: unknown, ctx: unknown) => Promise<void> | void | unknown,
		) {
			hooks.set(event, hook);
		},
		registerCommand(
			_name: string,
			options: { handler: (args: string, ctx: unknown) => Promise<void> },
		) {
			handler = options.handler;
		},
		appendEntry(customType: string, data: unknown) {
			entries.push({ type: "custom", customType, data });
		},
		sendMessage() {},
		getActiveTools() {
			return activeTools;
		},
		getAllTools() {
			return allTools.map((name) => ({ name }));
		},
		setActiveTools(names: string[]) {
			activeTools = names;
		},
	};
	registerGoalSupervisor(api);
	assert.ok(handler);
	const ctx = {
		sessionManager: {
			getCwd: () => "/tmp/project",
			getSessionId: () => "session-1",
			getBranch: () => entries,
		},
		isIdle: () => true,
		hasPendingMessages: () => false,
		ui: { notify() {}, setWidget() {} },
	};

	await handler("finish without asking", ctx);

	assert.deepEqual(activeTools, [
		"read",
		"bash",
		"intercom",
		"contact_supervisor",
		"subagent",
		"mcp",
		"Agent",
	]);
	const blocked = hooks.get("tool_call")?.({ toolName: "ask_user" }, ctx) as
		| { block: boolean; reason?: string }
		| undefined;
	assert.equal(blocked?.block, true);
	assert.match(blocked?.reason ?? "", /goal mode disables/i);

	await handler("clear", ctx);

	assert.deepEqual(activeTools, [
		"read",
		"bash",
		"ask_user",
		"intercom",
		"interview",
		"contact_supervisor",
		"subagent",
		"mcp",
		"Agent",
		"custom_permission_confirm",
		"retool_retool_respond_to_react_app_thread_review",
	]);
});

test("source does not register tools", () => {
	const srcDir = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
	const forbidden = /\bregisterTool\b/;
	const offenders = readdirSync(srcDir)
		.filter((name) => name.endsWith(".ts"))
		.filter((name) => forbidden.test(readFileSync(join(srcDir, name), "utf8")));

	assert.deepEqual(offenders, []);
});
