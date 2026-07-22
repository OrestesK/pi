import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import registerSubagentNotify, {
	buildCompletionDetails,
	formatGroupedCompletion,
	formatSingleCompletion,
	type RegisterSubagentNotifyOptions,
	type SubagentNotifyDetails,
} from "../../src/runs/background/notify.ts";
import { MODEL_VISIBLE_COMPLETION_BUDGET } from "../../src/shared/completion-output.ts";
import { SUBAGENT_ASYNC_COMPLETE_EVENT } from "../../src/shared/types.ts";

function createPi(currentSessionId = "session-1", registerOptions: RegisterSubagentNotifyOptions = {}) {
	const events = new EventEmitter();
	const sent: Array<{ message: unknown; options: unknown }> = [];
	const pi = {
		events,
		sendMessage(message: unknown, options: unknown) {
			sent.push({ message, options });
		},
	};

	// Formatting-focused tests run with batching disabled so single completions
	// emit synchronously. Batching behavior is covered by the dedicated suite below.
	registerSubagentNotify(pi as never, { currentSessionId }, {
		now: () => 1000,
		batchConfig: { enabled: false },
		existsSync: () => true,
		...registerOptions,
	});

	return { events, sent };
}

function createBatchingPi(clock: ReturnType<typeof createFakeClock>, currentSessionId = "session-a") {
	const events = new EventEmitter();
	const sent: Array<{ message: unknown; options: unknown }> = [];
	const pi = {
		events,
		sendMessage(message: unknown, options: unknown) {
			sent.push({ message, options });
		},
	};
	registerSubagentNotify(pi as never, { currentSessionId }, {
		batchConfig: { enabled: true, debounceMs: 150, maxWaitMs: 1000, stragglerDebounceMs: 75, stragglerMaxWaitMs: 400, stragglerWindowMs: 2000 },
		timers: clock.api,
		now: clock.now,
		existsSync: () => true,
	});
	return { events, sent };
}

interface FakeJob {
	id: number;
	fireAt: number;
	handler: () => void;
}

function createFakeClock() {
	let now = 0;
	let nextId = 1;
	const jobs = new Map<number, FakeJob>();
	const api = {
		setTimeout(handler: () => void, delayMs: number): unknown {
			const id = nextId++;
			jobs.set(id, { id, fireAt: now + delayMs, handler });
			return id;
		},
		clearTimeout(handle: unknown): void {
			if (typeof handle === "number") jobs.delete(handle);
		},
	};
	return {
		api,
		now: () => now,
		advance(ms: number): void {
			now += ms;
			const due = [...jobs.values()].filter((job) => job.fireAt <= now).sort((a, b) => a.fireAt - b.fireAt);
			for (const job of due) {
				if (!jobs.has(job.id)) continue;
				jobs.delete(job.id);
				job.handler();
			}
		},
	};
}

function completionResult(overrides: Record<string, unknown> = {}) {
	const agent = typeof overrides.agent === "string" ? overrides.agent : "worker";
	return {
		id: `notify-${Math.random().toString(36).slice(2)}`,
		agent,
		success: true,
		summary: "Done",
		exitCode: 0,
		timestamp: 123,
		durationMs: 50,
		cwd: "/repo",
		sessionId: "session-a",
		results: [{ agent, success: true, output: "Done", artifactPaths: { outputPath: `/tmp/${agent}.md` } }],
		...overrides,
	};
}

describe("registerSubagentNotify", () => {
	it("uses a fallback summary when a background completion is empty", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-empty-1",
			agent: "worker",
			success: true,
			summary: "",
			exitCode: 0,
			timestamp: 123,
			sessionId: "session-1",
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: [
					"Background task completed: **worker**",
					"Run: notify-empty-1",
					"Role: worker",
					"Launched: 1970-01-01T00:00:00.123Z",
					"Output: (not configured)",
					"",
					"(no output)",
				].join("\n"),
				display: true,
			},
			options: { triggerTurn: true, deliverAs: "followUp" },
		});
	});

	it("preserves non-empty completion summaries", () => {
		const { events, sent } = createPi();
		const summary = "  Done streaming\nAll clear  ";

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-summary-1",
			agent: "worker",
			success: true,
			summary,
			exitCode: 0,
			timestamp: 456,
			taskIndex: 1,
			totalTasks: 3,
			sessionId: "session-1",
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: [
					"Background task completed: **worker** (2/3)",
					"Run: notify-summary-1",
					"Role: worker",
					"Launched: 1970-01-01T00:00:00.456Z",
					"Output: (not configured)",
					"",
					summary,
				].join("\n"),
				display: true,
			},
			options: { triggerTurn: true, deliverAs: "followUp" },
		});
	});

	it("preserves session paths in notification content", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-path-1",
			runId: "run-path-1",
			agent: "worker",
			success: true,
			summary: "Done",
			exitCode: 0,
			timestamp: 456,
			durationMs: 56,
			cwd: "/repo",
			sessionFile: "/tmp/session.jsonl",
			sessionId: "session-1",
			results: [{ agent: "worker", success: true, output: "Done", artifactPaths: { outputPath: "/tmp/output.md" } }],
		});

		assert.deepEqual(sent, [{
			message: {
				customType: "subagent-notify",
				content: [
					"Background task completed: **worker**",
					"Run: run-path-1",
					"Role: worker",
					"Cwd: /repo",
					"Launched: 1970-01-01T00:00:00.400Z",
					"Output: /tmp/output.md",
					"",
					"Done",
					"",
					"Session file: /tmp/session.jsonl",
				].join("\n"),
				display: true,
			},
			options: { triggerTurn: true, deliverAs: "followUp" },
		}]);
	});

	it("labels paused completions as paused even without an exit code", () => {
		const { events, sent } = createPi();

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-paused-1",
			agent: "worker",
			success: false,
			state: "paused",
			summary: "Paused after interrupt. Waiting for explicit next action.",
			timestamp: 789,
			sessionId: "session-1",
		});

		assert.equal(sent.length, 1);
		assert.deepEqual(sent[0], {
			message: {
				customType: "subagent-notify",
				content: [
					"Background task paused: **worker**",
					"Run: notify-paused-1",
					"Role: worker",
					"Launched: 1970-01-01T00:00:00.789Z",
					"Output: (not configured)",
					"",
					"Paused after interrupt. Waiting for explicit next action.",
				].join("\n"),
				display: true,
			},
			options: { triggerTurn: true, deliverAs: "followUp" },
		});
	});

	it("ignores completions for other or missing session ids", () => {
		const { events, sent } = createPi("session-owner");

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-other-session",
			agent: "worker",
			success: true,
			summary: "Other done",
			timestamp: 100,
			sessionId: "session-other",
		});
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "notify-sessionless",
			agent: "worker",
			success: true,
			summary: "Legacy cwd-scoped done",
			timestamp: 101,
			cwd: "/repo",
		});

		assert.deepEqual(sent, []);
	});

	it("queues hidden native follow-ups for delivered intercom completions and visible fallbacks otherwise", () => {
		const { events, sent } = createPi("session-a");

		for (const [id, overrides] of [
			["delivered-success", { success: true, summary: "delivered success summary" }],
			["delivered-failure", { success: false, exitCode: 1, summary: "delivered failure summary" }],
			["delivered-paused", { success: false, state: "paused", summary: "delivered paused summary" }],
		] as const) {
			events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id, deliveryState: "delivered", ...overrides }));
		}
		assert.equal(sent.length, 3);
		for (const entry of sent) {
			assert.equal((entry.message as { display: boolean }).display, false);
			assert.deepEqual(entry.options, { triggerTurn: true, deliverAs: "followUp" });
		}
		assert.match((sent[0]!.message as { content: string }).content, /delivered success summary/);
		assert.match((sent[1]!.message as { content: string }).content, /delivered failure summary/);
		assert.match((sent[2]!.message as { content: string }).content, /delivered paused summary/);

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "failed-success",
			deliveryState: "failed",
			summary: "full success fallback",
		}));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "unrequested-failure",
			deliveryState: "not_requested",
			success: false,
			exitCode: 1,
			summary: "full failure fallback",
		}));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "failed-paused",
			deliveryState: "failed",
			success: false,
			state: "paused",
			summary: "full paused fallback",
		}));

		assert.equal(sent.length, 6);
		for (const entry of sent.slice(3)) {
			assert.equal((entry.message as { display: boolean }).display, true);
			assert.deepEqual(entry.options, { triggerTurn: true, deliverAs: "followUp" });
		}
		assert.match((sent[3]!.message as { content: string }).content, /full success fallback/);
		assert.match((sent[4]!.message as { content: string }).content, /full failure fallback/);
		assert.match((sent[5]!.message as { content: string }).content, /full paused fallback/);
	});

	it("does not advertise missing output artifacts", () => {
		const { events, sent } = createPi("session-a", { existsSync: () => false });

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "missing-artifact",
			deliveryState: "failed",
			success: false,
			exitCode: 1,
			summary: "fallback output",
		}));

		assert.equal(sent.length, 1);
		const content = (sent[0]!.message as { content: string }).content;
		assert.match(content, /Output: \(not configured\)/);
		assert.doesNotMatch(content, /\/tmp\/worker\.md/);
	});

	it("sends metadata-only retrieval notices for timed-out delivery across completion statuses", () => {
		const { events, sent } = createPi("session-a");

		for (const [id, overrides] of [
			["timeout-success", { success: true, summary: "secret success summary" }],
			["timeout-failure", { success: false, exitCode: 1, summary: "secret failure summary" }],
			["timeout-paused", { success: false, state: "paused", summary: "secret paused summary" }],
		] as const) {
			events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id, deliveryState: "timed_out", ...overrides }));
		}

		assert.equal(sent.length, 3);
		for (const entry of sent) {
			const content = (entry.message as { content: string }).content;
			assert.match(content, /intercom delivery timed out/);
			assert.match(content, /Run: timeout-/);
			assert.match(content, /Output: \/tmp\/worker\.md/);
			assert.match(content, /Inspect: subagent\(\{ action: "status", id: "timeout-/);
			assert.doesNotMatch(content, /secret (success|failure|paused) summary/);
		}
	});

	it("bounds full fallback summaries and preserves useful head and tail context", () => {
		const { events, sent } = createPi("session-a");
		const summary = `HEAD-SENTINEL\n${"middle line\n".repeat(10_000)}TAIL-SENTINEL`;

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "bounded-failure",
			deliveryState: "failed",
			success: false,
			exitCode: 1,
			summary,
		}));

		assert.equal(sent.length, 1);
		const content = (sent[0]!.message as { content: string }).content;
		assert.ok(Buffer.byteLength(content, "utf8") <= MODEL_VISIBLE_COMPLETION_BUDGET.bytes);
		assert.ok(content.split("\n").length <= MODEL_VISIBLE_COMPLETION_BUDGET.lines);
		assert.match(content, /HEAD-SENTINEL/);
		assert.match(content, /TAIL-SENTINEL/);
		assert.match(content, /TRUNCATED/);
	});

	it("flushes pending success fallbacks before disposing a stale reload batcher", () => {
		const clock = createFakeClock();
		const first = createBatchingPi(clock);

		first.events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({
			id: "reload-held-success",
			deliveryState: "not_requested",
			summary: "survives reload",
		}));
		assert.equal(first.sent.length, 0);

		createBatchingPi(clock);
		assert.equal(first.sent.length, 1);
		assert.match((first.sent[0]!.message as { content: string }).content, /survives reload/);

		clock.advance(1000);
		assert.equal(first.sent.length, 1);
	});

	it("emits failed completions immediately even while successes are held", () => {
		const clock = createFakeClock();
		const { events, sent } = createBatchingPi(clock);

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "ok-1", agent: "ok-1", summary: "ok-1 done" }));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "fail-1", agent: "fail-1", success: false, summary: "boom", exitCode: 1 }));

		// The failure must arrive immediately, and the held success must be
		// flushed ahead of it rather than waiting on the debounce timer.
		assert.equal(sent.length, 2);
		assert.match((sent[0]!.message as { content: string }).content, /Background task completed: \*\*ok-1\*\*/);
		assert.match((sent[1]!.message as { content: string }).content, /Background task failed: \*\*fail-1\*\*/);

		// No deferred emission should arrive later.
		clock.advance(1000);
		assert.equal(sent.length, 2);
	});

	it("groups sibling successes into a single notification after the debounce window", () => {
		const clock = createFakeClock();
		const { events, sent } = createBatchingPi(clock);

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "g-1", agent: "alpha", summary: "alpha done", sessionId: "session-a" }));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "g-2", agent: "beta", summary: "beta done", sessionId: "session-a" }));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "g-3", agent: "gamma", summary: "gamma done", sessionId: "session-a" }));
		assert.equal(sent.length, 0);

		clock.advance(150);
		assert.equal(sent.length, 1);
		const content = (sent[0]!.message as { content: string }).content;
		assert.match(content, /^Background tasks completed \(3\): \*\*alpha\*\*, \*\*beta\*\*, \*\*gamma\*\*/);
		assert.match(content, /1\. alpha\nRun: g-1[\s\S]*alpha done/);
		assert.match(content, /3\. gamma\nRun: g-3[\s\S]*gamma done/);
		assert.deepEqual(sent[0]!.options, { triggerTurn: true, deliverAs: "followUp" });
	});

	it("ignores successes from other sessions instead of grouping them", () => {
		const clock = createFakeClock();
		const { events, sent } = createBatchingPi(clock, "session-a");

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "s-1", agent: "alpha", summary: "alpha done", sessionId: "session-a" }));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "s-2", agent: "beta", summary: "beta done", sessionId: "session-b" }));
		clock.advance(150);

		assert.equal(sent.length, 1);
		assert.match((sent[0]!.message as { content: string }).content, /^Background task completed: \*\*alpha\*\*/);
		assert.doesNotMatch((sent[0]!.message as { content: string }).content, /beta done/);
	});

	it("does not let another session failure flush held successes", () => {
		const clock = createFakeClock();
		const { events, sent } = createBatchingPi(clock, "session-a");

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "held-a-1", agent: "alpha", summary: "alpha done", sessionId: "session-a" }));
		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, completionResult({ id: "fail-b-1", agent: "beta", success: false, summary: "boom", exitCode: 1, sessionId: "session-b" }));
		assert.equal(sent.length, 0);

		clock.advance(150);
		assert.equal(sent.length, 1);
		assert.match((sent[0]!.message as { content: string }).content, /^Background task completed: \*\*alpha\*\*/);
		assert.doesNotMatch((sent[0]!.message as { content: string }).content, /boom/);
	});

	it("suppresses stale completions instead of notifying a later session turn", () => {
		const { events, sent } = createPi("session-1", { now: () => 20 * 60 * 1000 });

		events.emit(SUBAGENT_ASYNC_COMPLETE_EVENT, {
			id: "stale-worker-1",
			agent: "worker",
			success: true,
			summary: "old worker output",
			exitCode: 0,
			timestamp: 1,
			sessionId: "session-1",
		});

		assert.deepEqual(sent, []);
	});
});

describe("completion formatting helpers", () => {
	it("formatSingleCompletion mirrors the in-handler single message shape", () => {
		const content = formatSingleCompletion({
			agent: "worker",
			status: "completed",
			taskInfo: " (2/3)",
			resultPreview: "Done",
			sessionLabel: "Session file",
			sessionValue: "/tmp/session.jsonl",
		});
		assert.equal(content, [
			"Background task completed: **worker** (2/3)",
			"Role: worker",
			"Output: (not configured)",
			"",
			"Done",
			"",
			"Session file: /tmp/session.jsonl",
		].join("\n"));
	});

	it("formatGroupedCompletion lists each agent with its summary and session", () => {
		const content = formatGroupedCompletion([
			{ agent: "alpha", status: "completed", resultPreview: "alpha done" },
			{ agent: "beta", status: "completed", taskInfo: " (1/2)", resultPreview: "", sessionLabel: "Session", sessionValue: "https://share/abc" },
		]);
		assert.equal(
			content,
			"Background tasks completed (2): **alpha**, **beta** (1/2)\n\n"
			+ "1. alpha\nRole: alpha\nOutput: (not configured)\n\nalpha done\n\n"
			+ "2. beta (1/2)\nRole: beta\nOutput: (not configured)\n\n(no output)\nSession: https://share/abc",
		);
	});

	it("buildCompletionDetails derives paused status from state and summary", () => {
		assert.equal(buildCompletionDetails({ id: "x", agent: "w", success: false, state: "paused", summary: "Paused after interrupt.", timestamp: 1 }).status, "paused");
		assert.equal(buildCompletionDetails({ id: "x", agent: "w", success: false, summary: "boom", exitCode: 1, timestamp: 1 }).status, "failed");
		assert.equal(buildCompletionDetails({ id: "x", agent: "w", success: true, summary: "ok", exitCode: 0, timestamp: 1 }).status, "completed");
	});

	it("buildCompletionDetails falls back to the unknown agent label", () => {
		const details: SubagentNotifyDetails = buildCompletionDetails({ id: "x", agent: null, success: true, summary: "ok", timestamp: 1 });
		assert.equal(details.agent, "unknown");
		assert.equal(details.status, "completed");
	});
});
