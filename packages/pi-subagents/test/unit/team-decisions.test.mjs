import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { listTeamMessages } = await loadTs("../../src/shared/team-mailbox.ts");
const { listTeamDecisions, recordTeamDecision } = await loadTs("../../src/shared/team-decisions.ts");

function makeTeamRunDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-decisions-test-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

test("recordTeamDecision records a nothing pulse without sending a message", async () => {
	const dir = makeTeamRunDir();
	try {
		const decision = await recordTeamDecision(dir, {
			from: "reviewer-1",
			action: "nothing",
			reason: "No intervention needed right now",
		}, { id: () => "decision-1", now: () => 1000 });

		assert.equal(decision.id, "decision-1");
		assert.equal(decision.runId, path.basename(dir));
		assert.equal(decision.from, "reviewer-1");
		assert.equal(decision.action, "nothing");
		assert.equal(decision.messageId, undefined);
		assert.deepEqual(await listTeamDecisions(dir), [decision]);
		assert.deepEqual(await listTeamMessages(dir, "worker-0"), []);
	} finally {
		cleanup(dir);
	}
});

test("recordTeamDecision steer pulse appends a live worker message", async () => {
	const dir = makeTeamRunDir();
	try {
		const decision = await recordTeamDecision(dir, {
			from: "reviewer-1",
			action: "steer",
			reason: "Worker is about to keep unsafe behavior",
			to: "worker-0",
			message: "Change course now",
			urgent: true,
		}, { id: () => "decision-2", messageId: () => "msg-2", now: () => 2000 });

		assert.equal(decision.action, "steer");
		assert.equal(decision.to, "worker-0");
		assert.equal(decision.message, "Change course now");
		assert.equal(decision.urgent, true);
		assert.equal(decision.messageId, "msg-2");

		const messages = await listTeamMessages(dir, "worker-0");
		assert.equal(messages.length, 1);
		assert.equal(messages[0].id, "msg-2");
		assert.equal(messages[0].from, "reviewer-1");
		assert.equal(messages[0].text, "Change course now");
		assert.equal(messages[0].urgent, true);
	} finally {
		cleanup(dir);
	}
});

test("recordTeamDecision discuss pulse appends a teammate message", async () => {
	const dir = makeTeamRunDir();
	try {
		const decision = await recordTeamDecision(dir, {
			from: "reviewer-1",
			action: "discuss",
			reason: "Need second reviewer on API shape",
			to: "reviewer-2",
			message: "Do you agree this API should be smaller?",
		}, { id: () => "decision-3", messageId: () => "msg-3", now: () => 3000 });

		assert.equal(decision.action, "discuss");
		assert.equal(decision.messageId, "msg-3");
		assert.equal((await listTeamMessages(dir, "reviewer-2"))[0].text, "Do you agree this API should be smaller?");
	} finally {
		cleanup(dir);
	}
});

test("recordTeamDecision rejects invalid active pulse shapes", async () => {
	const dir = makeTeamRunDir();
	try {
		await assert.rejects(
			() => recordTeamDecision(dir, { from: "reviewer-1", action: "nothing", reason: "x", to: "worker-0" }),
			/nothing decision must not include to or message/,
		);
		await assert.rejects(
			() => recordTeamDecision(dir, { from: "reviewer-1", action: "steer", reason: "x" }),
			/steer decision requires to and message/,
		);
		await assert.rejects(
			() => recordTeamDecision(dir, { from: "reviewer-1", action: "discuss", reason: "x", to: "../evil", message: "bad" }),
			/Invalid team mailbox name/,
		);
	} finally {
		cleanup(dir);
	}
});
