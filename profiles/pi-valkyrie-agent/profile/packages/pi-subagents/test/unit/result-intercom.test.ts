import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import {
	MODEL_VISIBLE_COMPLETION_BUDGET,
} from "../../src/shared/completion-output.ts";
import {
	attachNestedChildrenToResultChildren,
	buildSubagentResultIntercomPayload,
	deliverSubagentIntercomMessageEvent,
	deliverSubagentResultIntercomEvent,
	formatSubagentResultReceipt,
	resolveSubagentResultStatus,
	stripDetailsOutputsForIntercomReceipt,
} from "../../src/intercom/result-intercom.ts";

describe("result intercom formatter", () => {
	it("builds one grouped intercom payload with status counts and child sections", () => {
		const payload = buildSubagentResultIntercomPayload({
			to: "subagent-chat-main",
			runId: "run-123",
			mode: "chain",
			source: "foreground",
			chainSteps: 4,
			children: [
				{
					agent: "reviewer-a",
					status: "completed",
					summary: "Completed checks",
					artifactPath: "/tmp/a.md",
					sessionPath: "/tmp/a-session.jsonl",
					intercomTarget: "subagent-reviewer-a-run-123-1",
				},
				{
					agent: "reviewer-b",
					status: "failed",
					summary: "Failed checks",
					artifactPath: "/tmp/b.md",
				},
			],
		});

		assert.equal(payload.status, "failed");
		assert.equal(payload.summary, "1 completed, 1 failed");
		assert.equal(payload.children.length, 2);
		assert.match(payload.message, /^subagent results/m);
		assert.match(payload.message, /Run: run-123/);
		assert.match(payload.message, /Mode: chain/);
		assert.match(payload.message, /Status: failed/);
		assert.match(payload.message, /Children: 1 completed, 1 failed/);
		assert.match(payload.message, /Chain steps: 4/);
		assert.match(payload.message, /Intercom targets below identify child sessions used while they were running/);
		assert.match(payload.message, /1\. reviewer-a — completed/);
		assert.match(payload.message, /Run intercom target: subagent-reviewer-a-run-123-1/);
		assert.match(payload.message, /2\. reviewer-b — failed/);
		assert.match(payload.message, /Output artifact: \/tmp\/a\.md/);
		assert.match(payload.message, /Session: \/tmp\/a-session\.jsonl/);
	});

	it("advertises async revive only for single-child results with an existing session", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-result-intercom-"));
		try {
			const sessionPath = path.join(root, "session.jsonl");
			fs.writeFileSync(sessionPath, "", "utf-8");
			const payload = buildSubagentResultIntercomPayload({
				to: "chat",
				runId: "run-single",
				mode: "single",
				source: "async",
				asyncId: "run-single",
				children: [{ agent: "worker", status: "completed", summary: "done", sessionPath }],
			});

			assert.match(payload.message, /Revive: subagent\(\{ action: "resume", id: "run-single", message: "\.\.\." \}\)/);
			assert.doesNotMatch(payload.message, /unsupported for multi-child/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("advertises indexed revive for multi-child async results with existing child sessions", () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-result-intercom-"));
		try {
			const firstSession = path.join(root, "a.jsonl");
			const secondSession = path.join(root, "b.jsonl");
			fs.writeFileSync(firstSession, "", "utf-8");
			fs.writeFileSync(secondSession, "", "utf-8");
			const payload = buildSubagentResultIntercomPayload({
				to: "chat",
				runId: "run-multi",
				mode: "parallel",
				source: "async",
				asyncId: "run-multi",
				children: [
					{ agent: "a", status: "completed", summary: "done", sessionPath: firstSession },
					{ agent: "b", status: "completed", summary: "done", sessionPath: secondSession },
				],
			});

			assert.match(payload.message, /Revive child: subagent\(\{ action: "resume", id: "run-multi", index: 0, message: "\.\.\." \}\)/);
			assert.doesNotMatch(payload.message, /unsupported for multi-child/);
		} finally {
			fs.rmSync(root, { recursive: true, force: true });
		}
	});

	it("does not advertise async revive for missing child session files", () => {
		const payload = buildSubagentResultIntercomPayload({
			to: "chat",
			runId: "run-missing-session",
			mode: "single",
			source: "async",
			asyncId: "run-missing-session",
			children: [{ agent: "worker", status: "failed", summary: "failed", sessionPath: path.join(os.tmpdir(), "missing-pi-session.jsonl") }],
		});

		assert.match(payload.message, /Resume: unavailable; no child session file was persisted/);
		assert.doesNotMatch(payload.message, /Revive:/);
	});

	it("attaches compact nested children under their parent result child without route secrets", () => {
		const payload = buildSubagentResultIntercomPayload({
			to: "chat",
			runId: "root-run",
			mode: "parallel",
			source: "foreground",
			children: attachNestedChildrenToResultChildren("root-run", [
				{ agent: "owner-a", status: "completed", summary: "done", index: 0 },
				{ agent: "owner-b", status: "completed", summary: "done", index: 1 },
			], [{
				id: "nested-a",
				parentRunId: "root-run",
				parentStepIndex: 1,
				depth: 1,
				path: [{ runId: "root-run", stepIndex: 1 }],
				state: "complete",
				agent: "reviewer",
				error: `HEAD-NESTED-ERROR\n${"nested error line\n".repeat(5_000)}TAIL-NESTED-ERROR`,
				sessionFile: path.join(os.tmpdir(), "nested-a.jsonl"),
				controlInbox: "/tmp/should-not-leak",
				capabilityToken: "secret-token",
				children: [{
					id: "nested-grandchild",
					parentRunId: "nested-a",
					depth: 2,
					path: [{ runId: "root-run", stepIndex: 1 }, { runId: "nested-a" }],
					state: "complete",
					agent: "auditor",
					controlInbox: "/tmp/grandchild-should-not-leak",
					capabilityToken: "grandchild-secret",
				}],
			}]),
		});

		const nested = payload.children[1]?.children?.[0];
		const grandchild = nested?.children?.[0];
		assert.equal(payload.children[0]?.children, undefined);
		assert.equal(nested?.id, "nested-a");
		assert.ok(Buffer.byteLength(nested?.error ?? "", "utf8") <= 2_048);
		assert.match(nested?.error ?? "", /HEAD-NESTED-ERROR/);
		assert.match(nested?.error ?? "", /TAIL-NESTED-ERROR/);
		assert.equal(Object.prototype.hasOwnProperty.call(nested ?? {}, "controlInbox"), false);
		assert.equal(Object.prototype.hasOwnProperty.call(nested ?? {}, "capabilityToken"), false);
		assert.equal(grandchild?.id, "nested-grandchild");
		assert.equal(Object.prototype.hasOwnProperty.call(grandchild ?? {}, "controlInbox"), false);
		assert.equal(Object.prototype.hasOwnProperty.call(grandchild ?? {}, "capabilityToken"), false);
		assert.match(payload.message, /Nested subagents:/);
		assert.match(payload.message, /↳ reviewer — complete \[nested-a\]/);
	});

	it("bounds grouped child summaries and the aggregate model-visible payload", () => {
		const longSummary = (label: string) => `HEAD-${label}\n${`${label}-middle-line\n`.repeat(300)}TAIL-${label}`;
		const payload = buildSubagentResultIntercomPayload({
			to: "chat",
			runId: "run-bound",
			mode: "parallel",
			source: "foreground",
			children: ["alpha", "beta", "gamma"].map((agent) => ({
				agent,
				status: "completed" as const,
				summary: longSummary(agent),
				artifactPath: `/tmp/${agent}.md`,
			})),
		});

		assert.equal(payload.truncated, true);
		assert.ok(Buffer.byteLength(payload.message, "utf8") <= MODEL_VISIBLE_COMPLETION_BUDGET.bytes);
		assert.ok(payload.message.split("\n").length <= MODEL_VISIBLE_COMPLETION_BUDGET.lines);
		assert.ok(payload.children.reduce((bytes, child) => bytes + Buffer.byteLength(child.summary, "utf8"), 0) <= MODEL_VISIBLE_COMPLETION_BUDGET.bytes);
		for (let index = 0; index < payload.children.length; index++) {
			const child = payload.children[index]!;
			assert.notEqual(child.summary, longSummary(child.agent));
			assert.ok(child.summary.includes(`HEAD-${child.agent}`));
			assert.ok(child.summary.includes(`TAIL-${child.agent}`));
			assert.ok(payload.message.includes(`${index + 1}. ${child.agent} — completed`));
		}
		assert.match(formatSubagentResultReceipt({ mode: "parallel", runId: "run-bound", payload }), /Bounded grouped output excerpts/);
	});

	it("formats compact grouped receipts with artifacts and sessions", () => {
		const payload = buildSubagentResultIntercomPayload({
			to: "chat",
			runId: "run-abc",
			mode: "parallel",
			source: "foreground",
			children: [
				{ agent: "a", status: "completed", summary: "done", artifactPath: "/tmp/a.md", intercomTarget: "subagent-a-run-abc-1" },
				{ agent: "b", status: "failed", summary: "failed", sessionPath: "/tmp/b.jsonl" },
			],
		});
		const receipt = formatSubagentResultReceipt({
			mode: "parallel",
			runId: "run-abc",
			payload,
		});

		assert.match(receipt, /Delivered parallel subagent results via intercom\./);
		assert.match(receipt, /Children: 1 completed, 1 failed/);
		assert.match(receipt, /Artifacts:\n- a \[completed\]: \/tmp\/a\.md/);
		assert.match(receipt, /Run intercom targets \(may be inactive after completion\):\n- a \[completed\]: subagent-a-run-abc-1/);
		assert.match(receipt, /Sessions:\n- b \[failed\]: \/tmp\/b\.jsonl/);
		assert.match(receipt, /Full grouped output was sent over intercom\./);
	});

	it("strips heavy output fields from receipt details", () => {
		const stripped = stripDetailsOutputsForIntercomReceipt({
			mode: "single",
			results: [{
				agent: "worker",
				task: "Task",
				exitCode: 0,
				messages: [{ role: "assistant", content: [{ type: "text", text: "full" }] } as never],
				usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, cost: 0, turns: 1 },
				finalOutput: "full output",
				truncation: { text: "truncated", truncated: true },
			}],
		});
		assert.equal(stripped.results[0]?.messages, undefined);
		assert.equal(stripped.results[0]?.finalOutput, undefined);
		assert.equal(stripped.results[0]?.truncation, undefined);
	});

	it("resolves paused and detached statuses", () => {
		assert.equal(resolveSubagentResultStatus({ interrupted: true }), "paused");
		assert.equal(resolveSubagentResultStatus({ detached: true }), "detached");
		assert.equal(resolveSubagentResultStatus({ success: true }), "completed");
		assert.equal(resolveSubagentResultStatus({ exitCode: 1 }), "failed");
	});
});

describe("result intercom delivery", () => {
	function createEvents(acknowledgement?: boolean) {
		const listeners = new Map<string, Set<(data: unknown) => void>>();
		let resultEvents = 0;
		let lastRequestId: string | undefined;
		const events = {
			on(event: string, handler: (data: unknown) => void) {
				const handlers = listeners.get(event) ?? new Set();
				handlers.add(handler);
				listeners.set(event, handlers);
				return () => handlers.delete(handler);
			},
			emit(event: string, data: unknown) {
				for (const handler of listeners.get(event) ?? []) handler(data);
				if (event !== "subagent:result-intercom") return;
				resultEvents++;
				const requestId = (data as { requestId: string }).requestId;
				lastRequestId = requestId;
				if (acknowledgement === undefined) return;
				for (const handler of listeners.get("subagent:result-intercom-delivery") ?? []) {
					handler({ requestId, delivered: acknowledgement });
				}
			},
		};
		return { events, listeners, resultEvents: () => resultEvents, lastRequestId: () => lastRequestId };
	}

	it("distinguishes acknowledged, rejected, and unavailable delivery", async () => {
		const acknowledged = createEvents(true);
		assert.equal(await deliverSubagentIntercomMessageEvent(acknowledged.events, "chat", "done"), "delivered");
		const rejected = createEvents(false);
		assert.equal(await deliverSubagentIntercomMessageEvent(rejected.events, "chat", "done"), "failed");
		assert.equal(await deliverSubagentIntercomMessageEvent({} as never, "chat", "done"), "not_requested");
	});

	it("classifies timeout separately and ignores a late acknowledgement", async () => {
		const pending = createEvents();
		const payload = buildSubagentResultIntercomPayload({
			to: "chat",
			runId: "run-timeout",
			mode: "single",
			source: "async",
			children: [{ agent: "worker", status: "completed", summary: "secret child summary" }],
		});
		const state = await deliverSubagentResultIntercomEvent(pending.events, payload, 5);
		assert.equal(state, "timed_out");
		assert.equal(pending.resultEvents(), 1);
		assert.equal(typeof pending.lastRequestId(), "string");
		assert.equal(pending.listeners.get("subagent:result-intercom-delivery")?.size, 0);
		for (const handler of pending.listeners.get("subagent:result-intercom-delivery") ?? []) {
			handler({ requestId: pending.lastRequestId(), delivered: true });
		}
		assert.equal(pending.resultEvents(), 1);
	});

	it("classifies listener registration and emit exceptions as failed", async () => {
		const registrationError = {
			on() { throw new Error("registration failed"); },
			emit() {},
		};
		assert.equal(await deliverSubagentIntercomMessageEvent(registrationError as never, "chat", "done"), "failed");
		const emitError = {
			on() { return () => {}; },
			emit() { throw new Error("emit failed"); },
		};
		assert.equal(await deliverSubagentIntercomMessageEvent(emitError as never, "chat", "done"), "failed");
	});
});
