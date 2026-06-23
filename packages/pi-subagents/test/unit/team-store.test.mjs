import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	addTaskDependency,
	claimNextTask,
	completeTask,
	createTask,
	failTask,
	getTask,
	heartbeatTask,
	listTasks,
	removeTaskDependency,
	resolveTeamRunPath,
} = await loadTs("../../src/shared/team-store.ts");

function makeTeamRunDir() {
	return fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-store-test-"));
}

function cleanup(dir) {
	fs.rmSync(dir, { recursive: true, force: true });
}

const ownerA = { agent: "worker", childIndex: 0, sessionId: "session-a" };
const ownerB = { agent: "worker", childIndex: 1, sessionId: "session-b" };

test("creates, reads, and lists team tasks in run scope", async () => {
	const dir = makeTeamRunDir();
	try {
		const created = await createTask(dir, {
			id: "api",
			subject: "Update API",
			description: "Update API behavior",
		}, { now: () => 1000 });

		assert.equal(created.id, "api");
		assert.equal(created.runId, path.basename(dir));
		assert.equal(created.status, "pending");
		assert.deepEqual(created.blockedBy, []);
		assert.deepEqual(created.blocks, []);

		assert.deepEqual(await getTask(dir, "api"), created);
		assert.deepEqual((await listTasks(dir)).map((task) => task.id), ["api"]);
	} finally {
		cleanup(dir);
	}
});

test("dependency add and remove keeps blockedBy and blocks in sync", async () => {
	const dir = makeTeamRunDir();
	try {
		await createTask(dir, { id: "api", subject: "API", description: "API" });
		await createTask(dir, { id: "tests", subject: "Tests", description: "Tests" });

		await addTaskDependency(dir, "tests", "api");
		assert.deepEqual((await getTask(dir, "tests")).blockedBy, ["api"]);
		assert.deepEqual((await getTask(dir, "api")).blocks, ["tests"]);

		await addTaskDependency(dir, "tests", "api");
		assert.deepEqual((await getTask(dir, "tests")).blockedBy, ["api"]);
		assert.deepEqual((await getTask(dir, "api")).blocks, ["tests"]);

		await removeTaskDependency(dir, "tests", "api");
		assert.deepEqual((await getTask(dir, "tests")).blockedBy, []);
		assert.deepEqual((await getTask(dir, "api")).blocks, []);
	} finally {
		cleanup(dir);
	}
});

test("claimNextTask skips blocked tasks until dependencies complete", async () => {
	const dir = makeTeamRunDir();
	try {
		await createTask(dir, { id: "api", subject: "API", description: "API" });
		await createTask(dir, { id: "tests", subject: "Tests", description: "Tests" });
		await addTaskDependency(dir, "tests", "api");

		const first = await claimNextTask(dir, ownerA, { leaseMs: 1000, now: () => 1000 });
		assert.equal(first?.id, "api");
		assert.equal((await getTask(dir, "tests")).status, "pending");

		await completeTask(dir, "api", ownerA, { artifactRefs: ["api-output.md"], now: () => 1200 });
		const second = await claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 1300 });
		assert.equal(second?.id, "tests");
	} finally {
		cleanup(dir);
	}
});

test("concurrent claimNextTask calls assign each task to at most one owner", async () => {
	const dir = makeTeamRunDir();
	try {
		await createTask(dir, { id: "only", subject: "Only", description: "Only" });

		const results = await Promise.all([
			claimNextTask(dir, ownerA, { leaseMs: 1000, now: () => 1000 }),
			claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 1000 }),
		]);

		const claimed = results.filter(Boolean);
		assert.equal(claimed.length, 1);
		assert.equal((await getTask(dir, "only")).owner.sessionId, claimed[0].owner.sessionId);
	} finally {
		cleanup(dir);
	}
});

test("expired lease allows reclaim while live heartbeat prevents it", async () => {
	const dir = makeTeamRunDir();
	try {
		await createTask(dir, { id: "lease", subject: "Lease", description: "Lease" });

		const first = await claimNextTask(dir, ownerA, { leaseMs: 1000, now: () => 1000 });
		assert.equal(first?.owner.sessionId, "session-a");

		assert.equal(await claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 1500 }), null);

		await heartbeatTask(dir, "lease", ownerA, { leaseMs: 1000, now: () => 1800 });
		assert.equal(await claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 2500 }), null);

		await assert.rejects(
			() => heartbeatTask(dir, "lease", ownerA, { leaseMs: 1000, now: () => 3001 }),
			/lease expired/,
		);
		await assert.rejects(
			() => completeTask(dir, "lease", ownerA, { now: () => 3001 }),
			/lease expired/,
		);
		await assert.rejects(
			() => failTask(dir, "lease", ownerA, { reason: "late", now: () => 3001 }),
			/lease expired/,
		);

		const reclaimed = await claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 3001 });
		assert.equal(reclaimed?.owner.sessionId, "session-b");
		assert.equal(reclaimed?.attempts, 2);
	} finally {
		cleanup(dir);
	}
});

test("completeTask and failTask require matching owner", async () => {
	const dir = makeTeamRunDir();
	try {
		await createTask(dir, { id: "owned", subject: "Owned", description: "Owned" });
		await claimNextTask(dir, ownerA, { leaseMs: 1000, now: () => 1000 });

		await assert.rejects(
			() => completeTask(dir, "owned", ownerB, { now: () => 1100 }),
			/not owned by worker#1/,
		);

		const completed = await completeTask(dir, "owned", ownerA, { artifactRefs: ["result.md"], now: () => 1200 });
		assert.equal(completed.status, "completed");
		assert.deepEqual(completed.artifactRefs, ["result.md"]);

		await createTask(dir, { id: "failed", subject: "Failed", description: "Failed" });
		await claimNextTask(dir, ownerB, { leaseMs: 1000, now: () => 1300 });
		await assert.rejects(
			() => failTask(dir, "failed", ownerA, { reason: "wrong owner", now: () => 1400 }),
			/not owned by worker#0/,
		);
		const failed = await failTask(dir, "failed", ownerB, { reason: "boom", now: () => 1400 });
		assert.equal(failed.status, "failed");
		assert.equal(failed.metadata.failureReason, "boom");
	} finally {
		cleanup(dir);
	}
});

test("resolveTeamRunPath rejects traversal and symlink escape outside team run dir", () => {
	const dir = makeTeamRunDir();
	try {
		assert.equal(resolveTeamRunPath(dir, "tasks", "a.json"), path.join(dir, "tasks", "a.json"));
		assert.throws(() => resolveTeamRunPath(dir, "..", "outside.json"), /outside team run dir/);
		fs.symlinkSync(os.tmpdir(), path.join(dir, "tasks"), "dir");
		assert.throws(() => resolveTeamRunPath(dir, "tasks", "a.json"), /outside team run dir/);
	} finally {
		cleanup(dir);
	}
});
