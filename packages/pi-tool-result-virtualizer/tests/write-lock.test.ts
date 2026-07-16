import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

import { ToolResultStore } from "../src/store.ts";

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

const childScript = `
import { access, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { ToolResultStore } from ${JSON.stringify(pathToFileURL(join(import.meta.dirname, "..", "src", "store.ts")).href)};
const waitForRelease = async () => {
  while (true) {
    try { await access(process.env.RELEASE); return; }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    await delay(10);
  }
};
await writeFile(process.env.STARTED, "started");
const store = new ToolResultStore(process.env.ROOT, {
  limits: { maxSources: 1 },
  async failureInjector(point) {
    if (process.env.HOLD !== "1" || point !== "afterAdmission") return;
    await writeFile(process.env.READY, "ready");
    await waitForRelease();
  },
});
try {
  await store.storeSource({ toolName: "read", text: process.env.TEXT, captureStatus: "event.content" });
  await writeFile(process.env.RESULT, "fulfilled");
} catch (error) {
  await writeFile(process.env.RESULT, error?.name === "StoreQuotaError" ? "quota" : String(error));
}
`;

async function startWriter(
	env: NodeJS.ProcessEnv,
): Promise<ReturnType<typeof spawn>> {
	return spawn(
		process.execPath,
		["--experimental-strip-types", "--input-type=module", "-e", childScript],
		{
			env: { ...process.env, ...env },
			stdio: ["ignore", "ignore", "pipe"],
		},
	);
}

async function expectChildSuccess(
	child: ReturnType<typeof spawn>,
): Promise<void> {
	let stderr = "";
	child.stderr?.setEncoding("utf8");
	child.stderr?.on("data", (chunk: string) => {
		stderr += chunk;
	});
	const [code] = (await once(child, "exit")) as [number | null];
	assert.equal(code, 0, stderr);
}

test("dead process write locks are recovered", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-stale-lock-"));
	const lockDir = join(root, "write.lock");
	await mkdir(lockDir, { mode: 0o700 });
	await writeFile(
		join(lockDir, "owner.json"),
		`${JSON.stringify({ version: 1, ownerPid: 2_147_483_647, token: "a".repeat(32) })}\n`,
		{ mode: 0o600 },
	);
	const stored = await new ToolResultStore(root).storeSource({
		toolName: "read",
		text: "recovered\n",
		captureStatus: "event.content",
	});
	assert.match(stored.sourceId, /^tr_/);
	await assert.rejects(access(lockDir), { code: "ENOENT" });
});

test("quota admission is serialized across processes", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-process-lock-"));
	const release = join(root, "release");
	const firstReady = join(root, "first-ready");
	const firstStarted = join(root, "first-started");
	const secondStarted = join(root, "second-started");
	const firstResult = join(root, "first-result");
	const secondResult = join(root, "second-result");
	const first = await startWriter({
		ROOT: root,
		HOLD: "1",
		READY: firstReady,
		RELEASE: release,
		STARTED: firstStarted,
		RESULT: firstResult,
		TEXT: "first\n",
	});
	await waitForFile(firstReady);
	const second = await startWriter({
		ROOT: root,
		HOLD: "0",
		READY: join(root, "unused"),
		RELEASE: release,
		STARTED: secondStarted,
		RESULT: secondResult,
		TEXT: "second\n",
	});
	await waitForFile(secondStarted);
	await delay(50);
	await writeFile(release, "release");
	await Promise.all([expectChildSuccess(first), expectChildSuccess(second)]);

	assert.deepEqual(
		[
			await readFile(firstResult, "utf8"),
			await readFile(secondResult, "utf8"),
		].sort((left, right) => left.localeCompare(right)),
		["fulfilled", "quota"],
	);
	assert.equal((await new ToolResultStore(root).listSources(10)).length, 1);
});
