import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	rmdir,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { StoreJournal } from "../src/journal.ts";
import { StoreQuotaError, ToolResultStore } from "../src/store.ts";
import { StoreWriteLock } from "../src/write-lock.ts";

async function expectMissing(path: string): Promise<void> {
	await assert.rejects(access(path), { code: "ENOENT" });
}

async function waitForFile(path: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		try {
			await access(path);
			return;
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				throw error;
		}
		await delay(10);
	}
	throw new Error(`timed out waiting for test marker: ${path}`);
}

async function waitForMissing(path: string): Promise<void> {
	for (let attempt = 0; attempt < 200; attempt += 1) {
		try {
			await access(path);
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "ENOENT")
				return;
			throw error;
		}
		await delay(10);
	}
	throw new Error(`timed out waiting for removal: ${path}`);
}

const recoveryChildScript = `
import { writeFile } from "node:fs/promises";
import { ToolResultStore } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "..", "src", "store.ts")).href)};
const pending = new ToolResultStore(process.env.ROOT).listSources(10);
await writeFile(process.env.ATTEMPTED, "attempted");
await pending;
`;

async function markTransactionOwnerDead(
	journalPath: string,
	sourceId: string,
	hasDetails: boolean,
): Promise<void> {
	await writeFile(
		journalPath,
		`${JSON.stringify({ version: 1, sourceId, hasDetails, ownerPid: 2_147_483_647 })}\n`,
		{ mode: 0o600 },
	);
}

test("store rejects configured source and byte quotas before writing", async () => {
	const sourceRoot = await mkdtemp(join(tmpdir(), "pi-trv-quota-sources-"));
	const sourceLimited = new ToolResultStore(sourceRoot, {
		limits: { maxSources: 1 },
	});
	const stored = await sourceLimited.storeSource({
		toolName: "read",
		text: "first\n",
		captureStatus: "event.content",
	});
	assert.match(stored.sourceId, /^tr_[a-z0-9]+_[a-f0-9]{32}$/);
	await assert.rejects(
		sourceLimited.storeSource({
			toolName: "read",
			text: "second\n",
			captureStatus: "event.content",
		}),
		(error: unknown) =>
			error instanceof StoreQuotaError && error.limit === "maxSources",
	);
	assert.equal((await sourceLimited.listSources(10)).length, 1);

	const byteRoot = await mkdtemp(join(tmpdir(), "pi-trv-quota-bytes-"));
	const byteLimited = new ToolResultStore(byteRoot, {
		limits: { maxStoredBytes: 5 },
	});
	await assert.rejects(
		byteLimited.storeSource({
			toolName: "read",
			text: "123456",
			captureStatus: "event.content",
		}),
		(error: unknown) =>
			error instanceof StoreQuotaError && error.limit === "maxStoredBytes",
	);
	assert.equal((await byteLimited.listSources(10)).length, 0);
});

test("parallel writes serialize quota admission", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-quota-parallel-"));
	const store = new ToolResultStore(root, { limits: { maxSources: 1 } });
	const results = await Promise.allSettled([
		store.storeSource({
			toolName: "read",
			text: "first\n",
			captureStatus: "event.content",
		}),
		store.storeSource({
			toolName: "read",
			text: "second\n",
			captureStatus: "event.content",
		}),
	]);
	assert.equal(
		results.filter((result) => result.status === "fulfilled").length,
		1,
	);
	assert.equal(
		results.filter((result) => result.status === "rejected").length,
		1,
	);
	assert.equal((await store.listSources(10)).length, 1);
});

test("separate store instances serialize quota admission", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-quota-shared-lock-"));
	let releaseFirst!: () => void;
	const firstRelease = new Promise<void>((resolve) => {
		releaseFirst = resolve;
	});
	let markFirstAdmitted!: () => void;
	const firstAdmitted = new Promise<void>((resolve) => {
		markFirstAdmitted = resolve;
	});
	let markSecondAdmitted!: () => void;
	const secondAdmitted = new Promise<void>((resolve) => {
		markSecondAdmitted = resolve;
	});
	const firstStore = new ToolResultStore(root, {
		limits: { maxSources: 1 },
		async failureInjector(point) {
			if (point !== "afterAdmission") return;
			markFirstAdmitted();
			await firstRelease;
		},
	});
	const secondStore = new ToolResultStore(root, {
		limits: { maxSources: 1 },
		failureInjector(point) {
			if (point === "afterAdmission") markSecondAdmitted();
		},
	});
	const firstWrite = firstStore.storeSource({
		toolName: "read",
		text: "first\n",
		captureStatus: "event.content",
	});
	await firstAdmitted;
	const secondWrite = secondStore.storeSource({
		toolName: "read",
		text: "second\n",
		captureStatus: "event.content",
	});
	const admittedBeforeRelease = await Promise.race([
		secondAdmitted.then(() => true),
		delay(50, false),
	]);
	assert.equal(admittedBeforeRelease, false);
	releaseFirst();
	const results = await Promise.allSettled([firstWrite, secondWrite]);
	assert.equal(
		results.filter((result) => result.status === "fulfilled").length,
		1,
	);
	assert.equal(
		results.filter((result) => result.status === "rejected").length,
		1,
	);
});

test("restart recovery waits for the cross-process store lock", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-recovery-lock-"));
	const transaction = await new StoreJournal(root).begin(
		"tr_recoverylock_1234abcd",
		false,
	);
	await markTransactionOwnerDead(
		transaction.journalPath,
		transaction.sourceId,
		false,
	);
	await writeFile(transaction.stagedSourcePath, "staged\n", { mode: 0o600 });
	const attempted = join(root, "recovery-attempted");
	let child: ReturnType<typeof spawn> | undefined;
	let exitPromise: Promise<[number | null]> | undefined;
	let stderr = "";
	const journalRemoved = waitForMissing(transaction.journalPath);

	await new StoreWriteLock(root).runExclusive(async () => {
		child = spawn(
			process.execPath,
			[
				"--experimental-strip-types",
				"--input-type=module",
				"-e",
				recoveryChildScript,
			],
			{
				env: { ...process.env, ROOT: root, ATTEMPTED: attempted },
				stdio: ["ignore", "ignore", "pipe"],
			},
		);
		const stderrStream = child.stderr;
		assert.ok(stderrStream);
		stderrStream.setEncoding("utf8");
		stderrStream.on("data", (chunk: string) => {
			stderr += chunk;
		});
		exitPromise = once(child, "exit") as Promise<[number | null]>;
		await waitForFile(attempted);
		const premature = await Promise.race([
			exitPromise.then(() => "child-exited" as const),
			journalRemoved.then(() => "journal-removed" as const),
			delay(500, "blocked" as const),
		]);
		assert.equal(premature, "blocked");
		await Promise.all([
			access(transaction.journalPath),
			access(transaction.stagedSourcePath),
		]);
	});

	assert.ok(child);
	assert.ok(exitPromise);
	const [code] = await exitPromise;
	assert.equal(code, 0, stderr);
	await journalRemoved;
	await expectMissing(transaction.stagedSourcePath);
});

test("failed recovery can retry on the same store instance", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-recovery-retry-"));
	const indexPath = join(root, "index.jsonl");
	await mkdir(indexPath);
	const store = new ToolResultStore(root);

	await assert.rejects(store.listSources(10));
	await rmdir(indexPath);
	await writeFile(indexPath, "", { mode: 0o600 });
	assert.deepEqual(await store.listSources(10), []);
});

test("restart recovery removes only uncommitted transaction artifacts", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-journal-uncommitted-"));
	const journal = new StoreJournal(root);
	const transaction = await journal.begin("tr_recovery_1234abcd", true);
	await markTransactionOwnerDead(
		transaction.journalPath,
		transaction.sourceId,
		true,
	);
	await writeFile(transaction.stagedSourcePath, "staged\n", { mode: 0o600 });
	await writeFile(transaction.stagedDetailsPath, "{}\n", { mode: 0o600 });
	await writeFile(transaction.finalSourcePath, "promoted but uncommitted\n", {
		mode: 0o600,
	});
	await writeFile(transaction.finalDetailsPath, '{"promoted":true}\n', {
		mode: 0o600,
	});

	assert.deepEqual(await new ToolResultStore(root).listSources(10), []);
	await expectMissing(transaction.stagedSourcePath);
	await expectMissing(transaction.stagedDetailsPath);
	assert.equal(
		await readFile(transaction.finalSourcePath, "utf8"),
		"promoted but uncommitted\n",
	);
	assert.equal(
		await readFile(transaction.finalDetailsPath, "utf8"),
		'{"promoted":true}\n',
	);
	await expectMissing(transaction.journalPath);
});

test("restart recovery preserves committed sources and clears their pending journal", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-journal-committed-"));
	const store = new ToolResultStore(root);
	const stored = await store.storeSource({
		toolName: "read",
		text: "committed evidence\n",
		captureStatus: "event.content",
	});
	const transaction = await new StoreJournal(root).begin(
		stored.sourceId,
		false,
	);
	await markTransactionOwnerDead(
		transaction.journalPath,
		transaction.sourceId,
		false,
	);

	const [recovered] = await new ToolResultStore(root).listSources(10);
	assert.equal(recovered?.sourceId, stored.sourceId);
	assert.equal(await readFile(stored.textPath, "utf8"), "committed evidence\n");
	await expectMissing(transaction.journalPath);
});

test("recovery does not roll back a transaction owned by a live process", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-journal-active-"));
	const journal = new StoreJournal(root);
	const transaction = await journal.begin("tr_active_1234abcd", false);
	await writeFile(transaction.stagedSourcePath, "active\n", { mode: 0o600 });

	assert.deepEqual(await new ToolResultStore(root).listSources(10), []);
	await Promise.all([
		access(transaction.stagedSourcePath),
		access(transaction.journalPath),
	]);
	await journal.rollback(transaction);
});
