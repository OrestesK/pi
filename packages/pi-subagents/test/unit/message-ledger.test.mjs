import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	ackLedgerMessage,
	appendLedgerMessage,
	listLedgerMessages,
	markLedgerMessagesPresented,
	popUnreadLedgerMessages,
} = await loadTs("../../src/shared/message-ledger.ts");

function makeRunDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-message-ledger-test-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

const inbox = { directory: "mailboxes", name: "worker-0" };

test("message ledger appends, pops unread messages, and records acknowledgement", async () => {
	const dir = makeRunDir();
	try {
		const created = await appendLedgerMessage(dir, inbox, {
			from: "lead",
			to: "worker-0",
			text: "Stop and report",
			urgent: true,
		}, { now: () => 1000, id: () => "msg-1" });

		assert.equal(created.id, "msg-1");
		assert.equal(created.runId, path.basename(dir));
		assert.equal(created.urgent, true);
		assert.equal(created.read, false);
		assert.equal(created.presentedAt, undefined);
		assert.equal(created.presentedCount, undefined);
		assert.deepEqual(await listLedgerMessages(dir, inbox), [created]);

		const unread = await popUnreadLedgerMessages(dir, inbox);
		assert.deepEqual(unread.map((message) => message.id), ["msg-1"]);
		assert.equal(unread[0].read, true);

		const acknowledged = await ackLedgerMessage(dir, inbox, "msg-1", {
			by: "worker-0",
			action: "accepted",
			reason: "Will revise before final output",
		}, { now: () => 1500 });

		assert.equal(acknowledged.id, "msg-1");
		assert.equal(acknowledged.read, true);
		assert.equal(acknowledged.acknowledgedBy, "worker-0");
		assert.equal(acknowledged.ackAction, "accepted");
		assert.equal(acknowledged.ackReason, "Will revise before final output");
		assert.equal(acknowledged.acknowledgedAt, new Date(1500).toISOString());
	} finally {
		cleanup(dir);
	}
});

test("message ledger presentation state is idempotent per call and independent from read state", async () => {
	const dir = makeRunDir();
	try {
		await appendLedgerMessage(dir, inbox, { from: "supervisor", to: "worker-0", text: "Watch log A" }, { id: () => "one", now: () => 1000 });
		await appendLedgerMessage(dir, inbox, { from: "supervisor", to: "worker-0", text: "Watch log B" }, { id: () => "two", now: () => 1001 });

		const first = await markLedgerMessagesPresented(dir, inbox, ["one", "two"], { now: () => 2000 });
		assert.deepEqual(first.map((message) => [message.id, message.presentedAt, message.presentedCount, message.read]), [
			["one", new Date(2000).toISOString(), 1, false],
			["two", new Date(2000).toISOString(), 1, false],
		]);

		const second = await markLedgerMessagesPresented(dir, inbox, ["one"], { now: () => 3000 });
		assert.deepEqual(second.map((message) => [message.id, message.presentedAt, message.presentedCount, message.read]), [
			["one", new Date(3000).toISOString(), 2, false],
		]);

		const listed = await listLedgerMessages(dir, inbox);
		assert.deepEqual(listed.map((message) => [message.id, message.presentedCount, message.read]), [
			["one", 2, false],
			["two", 1, false],
		]);
	} finally {
		cleanup(dir);
	}
});

test("message ledger preserves all concurrent appends", async () => {
	const dir = makeRunDir();
	try {
		await Promise.all(
			Array.from({ length: 20 }, (_, index) => appendLedgerMessage(dir, inbox, {
				from: "lead",
				to: "worker-0",
				text: `message ${index}`,
			}, { id: () => `msg-${index}`, now: () => 1000 + index })),
		);

		const messages = await listLedgerMessages(dir, inbox);
		assert.equal(messages.length, 20);
		assert.deepEqual(new Set(messages.map((message) => message.id)).size, 20);
	} finally {
		cleanup(dir);
	}
});

test("message ledger rejects traversal inbox names and symlink escape outside root", async () => {
	const dir = makeRunDir();
	try {
		await assert.rejects(
			() => appendLedgerMessage(dir, { directory: "mailboxes", name: "../evil" }, { from: "lead", to: "../evil", text: "bad" }),
			/Invalid message inbox name/,
		);
		await assert.rejects(() => listLedgerMessages(dir, { directory: "../mailboxes", name: "worker-0" }), /outside message ledger root|Invalid message ledger directory/);

		fs.symlinkSync(os.tmpdir(), path.join(dir, "mailboxes"), "dir");
		await assert.rejects(
			() => appendLedgerMessage(dir, inbox, { from: "lead", to: "worker-0", text: "bad" }),
			/outside message ledger root/,
		);
	} finally {
		cleanup(dir);
	}
});
