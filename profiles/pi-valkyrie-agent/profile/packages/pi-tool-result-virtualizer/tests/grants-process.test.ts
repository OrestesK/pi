import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { PROTECTED_TOOL_OUTPUT_BYTE_LIMIT } from "../src/formatting.ts";
import {
	DEFAULT_GRANT_COMMIT_WAIT_MS,
	type GrantOperation,
	RESULT_ANALYST_RUNTIME_NAME,
	RunBoundGrantRegistry,
} from "../src/grants.ts";
import { ToolResultStore } from "../src/store.ts";
import { StoreWriteLock } from "../src/write-lock.ts";
import { makeStore } from "./test-helpers.ts";

const CHILD_PATH = fileURLToPath(new URL("./grant-child.ts", import.meta.url));
const GRANT_UNAVAILABLE = /grant unavailable/i;

function parseJsonRecord(text: string, label: string): Record<string, unknown> {
	try {
		const value: unknown = JSON.parse(text);
		assert.ok(
			value && typeof value === "object" && !Array.isArray(value),
			label,
		);
		return value as Record<string, unknown>;
	} catch (error) {
		assert.fail(`${label}: ${String(error)}`);
	}
}

type ChildResult = {
	status: number | null;
	stdout: string;
	stderr: string;
};

type ChildOptions = {
	root: string;
	mode?: "tool" | "crash-before" | "reserve-crash";
	runId: string;
	agentName?: string;
	tool?: string;
	params?: unknown;
	reservation?: unknown;
	commitWaitMs?: number;
	signalWait?: boolean;
	onWaiting?: () => void | Promise<void>;
};

async function runChild(options: ChildOptions): Promise<ChildResult> {
	const child = spawn(
		process.execPath,
		["--experimental-strip-types", CHILD_PATH],
		{
			env: {
				...process.env,
				GRANT_ROOT: options.root,
				GRANT_MODE: options.mode ?? "tool",
				GRANT_TOOL: options.tool ?? "tool_result_get",
				GRANT_PARAMS: JSON.stringify(options.params ?? {}),
				GRANT_RESERVATION: JSON.stringify(options.reservation ?? {}),
				GRANT_COMMIT_WAIT_MS: String(options.commitWaitMs ?? 0),
				GRANT_SIGNAL_WAIT: options.signalWait ? "1" : "0",
				PI_SUBAGENT_CHILD: "1",
				PI_SUBAGENT_RUN_ID: options.runId,
				PI_SUBAGENT_CHILD_AGENT:
					options.agentName ?? RESULT_ANALYST_RUNTIME_NAME,
			},
			stdio: ["ignore", "pipe", "pipe"],
		},
	);
	let stdout = "";
	let stderr = "";
	let waitingHandled = false;
	const waitingActions: Promise<void>[] = [];
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => {
		stdout += chunk;
		if (!waitingHandled && stdout.includes("WAITING\n")) {
			waitingHandled = true;
			waitingActions.push(Promise.resolve(options.onWaiting?.()));
		}
	});
	child.stderr.on("data", (chunk: string) => {
		stderr += chunk;
	});
	const status = await new Promise<number | null>((resolve, reject) => {
		child.once("error", reject);
		child.once("close", resolve);
	});
	await Promise.all(waitingActions);
	return { status, stdout, stderr };
}

async function storeSource(root: string, marker: string): Promise<string> {
	return (
		await new ToolResultStore(root).storeSource({
			toolName: "grant-process-test",
			text: `${marker}\n`,
			captureStatus: "event.content",
		})
	).sourceId;
}

async function commitGrant(
	root: string,
	input: {
		runId: string;
		sourceIds: string[];
		operations: GrantOperation[];
		calls?: number;
		expiresAt?: number;
	},
): Promise<void> {
	const calls = input.calls ?? 1;
	const registry = new RunBoundGrantRegistry(root, { commitWaitMs: 0 });
	const pending = registry.prepare({
		agentName: RESULT_ANALYST_RUNTIME_NAME,
		sourceIds: input.sourceIds,
		operations: input.operations,
		budget: {
			calls,
			outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT * calls,
		},
		expiresAt: input.expiresAt ?? Date.now() + 60_000,
	});
	await registry.commit(pending, input.runId);
}

async function waitForReservedGrant(root: string): Promise<void> {
	const grantDir = join(root, "grants");
	for (let attempt = 0; attempt < 200; attempt += 1) {
		let entries: string[] = [];
		try {
			entries = await readdir(grantDir);
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				throw error;
		}
		for (const entry of entries.filter((name) => name.endsWith(".json"))) {
			const record = parseJsonRecord(
				await readFile(join(grantDir, entry), "utf8"),
				"grant record must contain valid JSON",
			);
			if (record.remainingCalls === 0) return;
		}
		await delay(10);
	}
	throw new Error("timed out waiting for grant reservation");
}

test("spawned children reject missing and mismatched grants, then consume one exact grant", async () => {
	const { dir } = await makeStore();
	const sourceA = await storeSource(dir, "PROCESS_SOURCE_A");
	const sourceB = await storeSource(dir, "PROCESS_SOURCE_B");

	const noGrant = await runChild({
		root: dir,
		runId: "no-grant",
		params: { sourceId: sourceA },
	});
	assert.equal(noGrant.status, 1);
	assert.match(noGrant.stderr, GRANT_UNAVAILABLE);

	await commitGrant(dir, {
		runId: "run-a",
		sourceIds: [sourceA],
		operations: ["get"],
	});
	for (const mismatch of [
		{
			runId: "foreign-run",
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			sourceId: sourceA,
			tool: "tool_result_get",
			params: { sourceId: sourceA },
		},
		{
			runId: "run-a",
			agentName: "foreign-agent",
			sourceId: sourceA,
			tool: "tool_result_get",
			params: { sourceId: sourceA },
		},
		{
			runId: "run-a",
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			sourceId: sourceB,
			tool: "tool_result_get",
			params: { sourceId: sourceB },
		},
		{
			runId: "run-a",
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			sourceId: sourceA,
			tool: "tool_result_search",
			params: { query: "PROCESS", sourceId: sourceA },
		},
	]) {
		const result = await runChild({
			root: dir,
			runId: mismatch.runId,
			agentName: mismatch.agentName,
			tool: mismatch.tool,
			params: mismatch.params,
		});
		assert.equal(result.status, 1);
		assert.match(result.stderr, GRANT_UNAVAILABLE);
	}

	const granted = await runChild({
		root: dir,
		runId: "run-a",
		params: { sourceId: sourceA, lineLimit: 1 },
	});
	assert.equal(granted.status, 0);
	assert.match(granted.stdout, /PROCESS_SOURCE_A/);
	const replay = await runChild({
		root: dir,
		runId: "run-a",
		params: { sourceId: sourceA },
	});
	assert.equal(replay.status, 1);
	assert.match(replay.stderr, GRANT_UNAVAILABLE);
});

test("spawned children enforce expiry, broad/list denial, and ignore path-shaped extras", async () => {
	const { dir } = await makeStore();
	const sourceId = await storeSource(dir, "PROCESS_EXACT_SOURCE");
	await commitGrant(dir, {
		runId: "expired-run",
		sourceIds: [sourceId],
		operations: ["get"],
	});
	const grantFile = join(
		dir,
		"grants",
		(await readdir(join(dir, "grants")))[0] ?? "missing",
	);
	const expiredRecord = parseJsonRecord(
		await readFile(grantFile, "utf8"),
		"committed grant must contain valid JSON",
	);
	expiredRecord.expiresAt = Date.now() - 1;
	await writeFile(grantFile, `${JSON.stringify(expiredRecord)}\n`, "utf8");
	const expired = await runChild({
		root: dir,
		runId: "expired-run",
		params: { sourceId },
	});
	assert.equal(expired.status, 1);
	assert.match(expired.stderr, GRANT_UNAVAILABLE);

	await commitGrant(dir, {
		runId: "search-run",
		sourceIds: [sourceId],
		operations: ["search"],
	});
	const broad = await runChild({
		root: dir,
		runId: "search-run",
		tool: "tool_result_search",
		params: { query: "PROCESS" },
	});
	assert.equal(broad.status, 1);
	assert.match(broad.stderr, GRANT_UNAVAILABLE);

	const list = await runChild({
		root: dir,
		runId: "list-run",
		tool: "tool_result_list",
		params: {},
	});
	assert.equal(list.status, 0);
	assert.match(list.stdout, /"count":0/);

	const externalMarker = `PATH_SHOULD_NOT_BE_READ_${randomUUID()}`;
	const externalPath = join(tmpdir(), `${randomUUID()}.txt`);
	await writeFile(externalPath, `${externalMarker}\n`, "utf8");
	try {
		await commitGrant(dir, {
			runId: "path-run",
			sourceIds: [sourceId],
			operations: ["get"],
		});
		const pathAttempt = await runChild({
			root: dir,
			runId: "path-run",
			params: { sourceId, path: externalPath, cwd: tmpdir() },
		});
		assert.equal(pathAttempt.status, 0);
		assert.match(pathAttempt.stdout, /PROCESS_EXACT_SOURCE/);
		assert.doesNotMatch(pathAttempt.stdout, new RegExp(externalMarker));
	} finally {
		await unlink(externalPath);
	}
});

test("spawned concurrent consumers cannot oversubscribe one call", async () => {
	const { dir } = await makeStore();
	const sourceId = await storeSource(dir, "PROCESS_CONCURRENT");
	await commitGrant(dir, {
		runId: "concurrent-run",
		sourceIds: [sourceId],
		operations: ["get"],
	});

	const outcomes = await Promise.all([
		runChild({ root: dir, runId: "concurrent-run", params: { sourceId } }),
		runChild({ root: dir, runId: "concurrent-run", params: { sourceId } }),
	]);
	assert.equal(outcomes.filter((result) => result.status === 0).length, 1);
	assert.equal(outcomes.filter((result) => result.status === 1).length, 1);
	assert.match(
		outcomes.find((result) => result.status === 1)?.stderr ?? "",
		GRANT_UNAVAILABLE,
	);
});

test("spawned crashes before and after reservation preserve fail-closed budgets", async () => {
	const { dir } = await makeStore();
	const sourceId = await storeSource(dir, "PROCESS_CRASH");
	await commitGrant(dir, {
		runId: "before-run",
		sourceIds: [sourceId],
		operations: ["get"],
	});
	const before = await runChild({
		root: dir,
		runId: "before-run",
		mode: "crash-before",
	});
	assert.equal(before.status, 85);
	assert.equal(
		(
			await runChild({
				root: dir,
				runId: "before-run",
				params: { sourceId },
			})
		).status,
		0,
	);

	await commitGrant(dir, {
		runId: "after-run",
		sourceIds: [sourceId],
		operations: ["get"],
	});
	const after = await runChild({
		root: dir,
		runId: "after-run",
		mode: "reserve-crash",
		reservation: {
			runId: "after-run",
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			operation: "get",
			sourceIds: [sourceId],
			outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
		},
	});
	assert.equal(after.status, 86);
	const retry = await runChild({
		root: dir,
		runId: "after-run",
		params: { sourceId },
	});
	assert.equal(retry.status, 1);
	assert.match(retry.stderr, GRANT_UNAVAILABLE);
});

test("spawned child waits for a matching post-spawn grant commit", async () => {
	const { dir } = await makeStore();
	const sourceId = await storeSource(dir, "PROCESS_WAITED_COMMIT");
	const registry = new RunBoundGrantRegistry(dir, { commitWaitMs: 0 });
	const pending = registry.prepare({
		agentName: RESULT_ANALYST_RUNTIME_NAME,
		sourceIds: [sourceId],
		operations: ["get"],
		budget: {
			calls: 1,
			outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
		},
		expiresAt: Date.now() + 60_000,
	});
	const result = await runChild({
		root: dir,
		runId: "wait-run",
		params: { sourceId },
		commitWaitMs: 500,
		signalWait: true,
		onWaiting: () => registry.commit(pending, "wait-run"),
	});
	assert.equal(result.status, 0);
	assert.match(result.stdout, /WAITING/);
	assert.match(result.stdout, /PROCESS_WAITED_COMMIT/);
});

test("grant commit and reservation proceed while a source write lock is held", async () => {
	const { dir } = await makeStore();
	const sourceId = await storeSource(dir, "PROCESS_INDEPENDENT_GRANT_LOCK");
	const registry = new RunBoundGrantRegistry(dir, { commitWaitMs: 0 });
	const pending = registry.prepare({
		agentName: RESULT_ANALYST_RUNTIME_NAME,
		sourceIds: [sourceId],
		operations: ["get"],
		budget: {
			calls: 1,
			outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
		},
		expiresAt: Date.now() + 60_000,
	});
	let commitPromise: Promise<void> | undefined;
	let resultPromise: Promise<ChildResult> | undefined;

	await new StoreWriteLock(dir).runExclusive(async () => {
		resultPromise = runChild({
			root: dir,
			runId: "independent-lock-run",
			params: { sourceId },
			commitWaitMs: DEFAULT_GRANT_COMMIT_WAIT_MS,
			signalWait: true,
			onWaiting: () => {
				commitPromise = registry.commit(pending, "independent-lock-run");
			},
		});
		await waitForReservedGrant(dir);
	});

	assert.ok(commitPromise);
	assert.ok(resultPromise);
	await commitPromise;
	const result = await resultPromise;
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /WAITING/);
	assert.match(result.stdout, /PROCESS_INDEPENDENT_GRANT_LOCK/);
});
