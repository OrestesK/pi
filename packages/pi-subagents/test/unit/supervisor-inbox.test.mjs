import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	ackSupervisorMessage,
	appendSupervisorMessage,
	formatSupervisorMessagesForContext,
	listPendingSupervisorMessages,
	listSupervisorMessages,
	markSupervisorMessagesPresented,
	supervisorInboxName,
} = await loadTs("../../src/shared/supervisor-inbox.ts");

function makeRunDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-supervisor-inbox-test-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

test("supervisor inbox tracks pending acknowledgements independently from presentation", async () => {
	const dir = makeRunDir();
	try {
		const first = await appendSupervisorMessage(dir, {
			toIndex: 0,
			agent: "run-monitor",
			text: "Also watch /tmp/build.log for TypeError",
		}, { id: () => "sm-1", now: () => 1000 });
		await appendSupervisorMessage(dir, {
			toIndex: 0,
			agent: "run-monitor",
			text: "Stop if command exits non-zero",
		}, { id: () => "sm-2", now: () => 1001 });

		assert.equal(first.from, "supervisor");
		assert.equal(first.to, supervisorInboxName(0));
		assert.equal(first.metadata.agent, "run-monitor");
		assert.equal(first.metadata.index, 0);
		assert.deepEqual((await listPendingSupervisorMessages(dir, 0)).map((message) => message.id), ["sm-1", "sm-2"]);

		await markSupervisorMessagesPresented(dir, 0, ["sm-1", "sm-2"], { now: () => 2000 });
		assert.deepEqual((await listPendingSupervisorMessages(dir, 0)).map((message) => [message.id, message.presentedCount, message.ackAction]), [
			["sm-1", 1, undefined],
			["sm-2", 1, undefined],
		]);

		await ackSupervisorMessage(dir, 0, "sm-1", {
			by: "run-monitor",
			action: "accepted",
			reason: "Will add the log and TypeError failure pattern",
		}, { now: () => 2500 });

		assert.deepEqual((await listPendingSupervisorMessages(dir, 0)).map((message) => message.id), ["sm-2"]);
		const all = await listSupervisorMessages(dir, 0);
		assert.equal(all[0].ackAction, "accepted");
		assert.equal(all[0].read, true);
		assert.equal(all[1].ackAction, undefined);
	} finally {
		cleanup(dir);
	}
});

test("supervisor context text includes stable ids and requires acknowledgement", async () => {
	const dir = makeRunDir();
	try {
		await appendSupervisorMessage(dir, {
			toIndex: 2,
			agent: "worker",
			text: "Do not write outside .scratch/runs",
			urgent: true,
		}, { id: () => "sm-urgent", now: () => 1000 });

		const pending = await listPendingSupervisorMessages(dir, 2);
		const text = formatSupervisorMessagesForContext(pending);
		assert.match(text, /SUPERVISOR MESSAGE sm-urgent \[urgent\]/);
		assert.match(text, /Do not write outside \.scratch\/runs/);
		assert.match(text, /Call ack_supervisor_message before continuing/);
	} finally {
		cleanup(dir);
	}
});
