import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	ackTeamMessage,
	appendTeamMessage,
	listTeamMessages,
	popUnreadTeamMessages,
} = await loadTs("../../src/shared/team-mailbox.ts");

function makeTeamRunDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-mailbox-test-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

test("appendTeamMessage creates an inbox and preserves urgent flag", async () => {
	const dir = makeTeamRunDir();
	try {
		const msg = await appendTeamMessage(dir, {
			from: "lead",
			to: "worker-0",
			text: "Stop and report",
			urgent: true,
		}, { now: () => 1000, id: () => "msg-1" });

		assert.equal(msg.id, "msg-1");
		assert.equal(msg.runId, path.basename(dir));
		assert.equal(msg.urgent, true);
		assert.equal(msg.read, false);

		assert.deepEqual(await listTeamMessages(dir, "worker-0"), [msg]);
	} finally {
		cleanup(dir);
	}
});

test("popUnreadTeamMessages returns unread messages and marks them read", async () => {
	const dir = makeTeamRunDir();
	try {
		await appendTeamMessage(dir, { from: "lead", to: "worker-0", text: "one" }, { id: () => "one", now: () => 1000 });
		await appendTeamMessage(dir, { from: "lead", to: "worker-0", text: "two" }, { id: () => "two", now: () => 1001 });

		const unread = await popUnreadTeamMessages(dir, "worker-0");
		assert.deepEqual(unread.map((message) => message.id), ["one", "two"]);
		assert.equal(unread.every((message) => message.read), true);

		assert.deepEqual(await popUnreadTeamMessages(dir, "worker-0"), []);
		assert.equal((await listTeamMessages(dir, "worker-0")).every((message) => message.read), true);
	} finally {
		cleanup(dir);
	}
});

test("ackTeamMessage records worker acknowledgement metadata", async () => {
	const dir = makeTeamRunDir();
	try {
		const created = await appendTeamMessage(dir, {
			from: "reviewer-a",
			to: "worker-0",
			text: "Change course before completion",
			urgent: true,
		}, { id: () => "steer-1", now: () => 1000 });
		assert.equal(created.acknowledgedAt, undefined);
		assert.equal(created.acknowledgedBy, undefined);
		assert.equal(created.ackAction, undefined);
		assert.equal(created.ackReason, undefined);

		await popUnreadTeamMessages(dir, "worker-0");
		const acknowledged = await ackTeamMessage(dir, "worker-0", "steer-1", {
			by: "worker-0",
			action: "accepted",
			reason: "Will revise before final output",
		}, { now: () => 1500 });

		assert.equal(acknowledged.id, "steer-1");
		assert.equal(acknowledged.read, true);
		assert.equal(acknowledged.acknowledgedBy, "worker-0");
		assert.equal(acknowledged.ackAction, "accepted");
		assert.equal(acknowledged.ackReason, "Will revise before final output");
		assert.equal(acknowledged.acknowledgedAt, new Date(1500).toISOString());

		const listed = await listTeamMessages(dir, "worker-0");
		assert.equal(listed[0].ackAction, "accepted");
	} finally {
		cleanup(dir);
	}
});

test("listTeamMessages does not mark messages as read", async () => {
	const dir = makeTeamRunDir();
	try {
		await appendTeamMessage(dir, { from: "lead", to: "worker-0", text: "one" }, { id: () => "one", now: () => 1000 });

		const listed = await listTeamMessages(dir, "worker-0");
		assert.equal(listed[0].read, false);
		assert.equal((await popUnreadTeamMessages(dir, "worker-0")).length, 1);
	} finally {
		cleanup(dir);
	}
});

test("concurrent appendTeamMessage preserves all messages", async () => {
	const dir = makeTeamRunDir();
	try {
		await Promise.all(
			Array.from({ length: 20 }, (_, i) => appendTeamMessage(dir, {
				from: "lead",
				to: "worker-0",
				text: `message ${i}`,
			}, { id: () => `msg-${i}`, now: () => 1000 + i })),
		);

		const messages = await listTeamMessages(dir, "worker-0");
		assert.equal(messages.length, 20);
		assert.deepEqual(new Set(messages.map((message) => message.id)).size, 20);
	} finally {
		cleanup(dir);
	}
});

test("mailbox APIs reject traversal names and symlink escape outside team run dir", async () => {
	const dir = makeTeamRunDir();
	try {
		await assert.rejects(
			() => appendTeamMessage(dir, { from: "lead", to: "../evil", text: "bad" }),
			/Invalid team mailbox name/,
		);
		await assert.rejects(() => listTeamMessages(dir, "../evil"), /Invalid team mailbox name/);
		await assert.rejects(() => popUnreadTeamMessages(dir, "../evil"), /Invalid team mailbox name/);

		fs.symlinkSync(os.tmpdir(), path.join(dir, "mailboxes"), "dir");
		await assert.rejects(
			() => appendTeamMessage(dir, { from: "lead", to: "worker-0", text: "bad" }),
			/outside team run dir/,
		);
	} finally {
		cleanup(dir);
	}
});
