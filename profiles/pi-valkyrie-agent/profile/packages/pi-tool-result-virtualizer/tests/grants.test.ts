import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { resolveStoreAccess } from "../src/access.ts";
import {
	DEFAULT_GRANT_COMMIT_WAIT_MS,
	DEFAULT_GRANT_POLL_INTERVAL_MS,
	RESULT_ANALYST_RUNTIME_NAME,
	RunBoundGrantRegistry,
} from "../src/grants.ts";
import { PROTECTED_TOOL_OUTPUT_BYTE_LIMIT } from "../src/formatting.ts";
import { ProvenanceResolver } from "../src/provenance.ts";
import { buildToolResultTools } from "../src/tools.ts";
import { makeStore } from "./test-helpers.ts";

const GRANT_UNAVAILABLE = /grant unavailable/i;

function prepareGrant(
	registry: RunBoundGrantRegistry,
	input: {
		sourceIds?: string[];
		operations?: Array<"outline" | "search" | "get">;
		calls?: number;
		outputBytes?: number;
		expiresAt?: number;
	} = {},
) {
	return registry.prepare({
		agentName: RESULT_ANALYST_RUNTIME_NAME,
		sourceIds: input.sourceIds ?? ["tr_source_a"],
		operations: input.operations ?? ["get"],
		budget: {
			calls: input.calls ?? 1,
			outputBytes: input.outputBytes ?? PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
		},
		expiresAt: input.expiresAt ?? 2_000,
	});
}

function reservation(
	overrides: Partial<{
		runId: string;
		agentName: string;
		operation: "outline" | "search" | "get";
		sourceIds: string[];
		outputBytes: number;
	}> = {},
) {
	return {
		runId: overrides.runId ?? "run-a",
		agentName: overrides.agentName ?? RESULT_ANALYST_RUNTIME_NAME,
		operation: overrides.operation ?? ("get" as const),
		sourceIds: overrides.sourceIds ?? ["tr_source_a"],
		outputBytes: overrides.outputBytes ?? PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
	};
}

test("committed grants cross process boundaries and bind exact authority", async () => {
	const { dir } = await makeStore();
	const parentRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	const childRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	const pending = prepareGrant(parentRegistry);

	await assert.rejects(childRegistry.reserve(reservation()), GRANT_UNAVAILABLE);
	await parentRegistry.commit(pending, "run-a");
	await assert.rejects(
		childRegistry.reserve(reservation({ runId: "run-b" })),
		GRANT_UNAVAILABLE,
	);
	await assert.rejects(
		childRegistry.reserve(reservation({ agentName: "foreign-agent" })),
		GRANT_UNAVAILABLE,
	);
	await assert.rejects(
		childRegistry.reserve(reservation({ sourceIds: ["tr_source_b"] })),
		GRANT_UNAVAILABLE,
	);
	await assert.rejects(
		childRegistry.reserve(reservation({ operation: "search" })),
		GRANT_UNAVAILABLE,
	);

	await childRegistry.reserve(reservation());
	await assert.rejects(childRegistry.reserve(reservation()), GRANT_UNAVAILABLE);

	const grantDir = join(dir, "grants");
	assert.equal((await stat(grantDir)).mode & 0o777, 0o700);
	const files = await readdir(grantDir);
	assert.equal(files.length, 1);
	const grantPath = join(grantDir, files[0] ?? "missing");
	assert.equal((await stat(grantPath)).mode & 0o777, 0o600);
	assert.doesNotMatch(await readFile(grantPath, "utf8"), /run-a/);
});

test("one pending grant cannot commit to two concurrent runs", async () => {
	const { dir } = await makeStore();
	const registry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	const pending = prepareGrant(registry);

	const outcomes = await Promise.allSettled([
		registry.commit(pending, "run-a"),
		registry.commit(pending, "run-b"),
	]);
	assert.equal(
		outcomes.filter((outcome) => outcome.status === "fulfilled").length,
		1,
	);
	assert.equal(
		outcomes.filter((outcome) => outcome.status === "rejected").length,
		1,
	);
	assert.equal((await readdir(join(dir, "grants"))).length, 1);
});

test("grant expiry is exclusive at the exact deadline", async () => {
	const { dir } = await makeStore();
	let now = 1_999;
	const registry = new RunBoundGrantRegistry(dir, {
		now: () => now,
		commitWaitMs: 0,
	});
	const pending = prepareGrant(registry, {
		calls: 2,
		outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT * 2,
		expiresAt: 2_000,
	});
	await registry.commit(pending, "run-a");

	await registry.reserve(reservation());
	now = 2_000;
	await assert.rejects(registry.reserve(reservation()), GRANT_UNAVAILABLE);
});

test("concurrent consumers cannot exceed an atomic reservation budget", async () => {
	const { dir } = await makeStore();
	const parentRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	await parentRegistry.commit(prepareGrant(parentRegistry), "run-a");
	const firstChild = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	const secondChild = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});

	const outcomes = await Promise.allSettled([
		firstChild.reserve(reservation()),
		secondChild.reserve(reservation()),
	]);
	assert.equal(
		outcomes.filter((outcome) => outcome.status === "fulfilled").length,
		1,
	);
	assert.equal(
		outcomes.filter((outcome) => outcome.status === "rejected").length,
		1,
	);
});

test("reservation is consumed before retrieval and survives a caller crash", async () => {
	const { dir } = await makeStore();
	const parentRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	await parentRegistry.commit(prepareGrant(parentRegistry), "run-a");

	await new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	}).reserve(reservation());
	await assert.rejects(
		new RunBoundGrantRegistry(dir, {
			now: () => 1_000,
			commitWaitMs: 0,
		}).reserve(reservation()),
		GRANT_UNAVAILABLE,
	);
});

test("child reservation waits for the parent to commit the spawned run", async () => {
	const { dir } = await makeStore();
	let parentRegistry: RunBoundGrantRegistry;
	let committed = false;
	let pending: ReturnType<RunBoundGrantRegistry["prepare"]>;
	const childRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 50,
		pollIntervalMs: 1,
		sleep: async () => {
			if (committed) return;
			committed = true;
			await parentRegistry.commit(pending, "run-a");
		},
	});
	parentRegistry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	pending = prepareGrant(parentRegistry);

	await childRegistry.reserve(reservation());
	assert.equal(committed, true);
});

test("missing grants wait for exactly the bounded default commit window", async () => {
	const { dir } = await makeStore();
	let now = 1_000;
	const sleeps: number[] = [];
	const registry = new RunBoundGrantRegistry(dir, {
		now: () => now,
		sleep: async (milliseconds) => {
			sleeps.push(milliseconds);
			now += milliseconds;
		},
	});

	await assert.rejects(registry.reserve(reservation()), GRANT_UNAVAILABLE);
	assert.equal(
		sleeps.reduce((total, milliseconds) => total + milliseconds, 0),
		DEFAULT_GRANT_COMMIT_WAIT_MS,
	);
	assert.ok(
		sleeps.every(
			(milliseconds) => milliseconds <= DEFAULT_GRANT_POLL_INTERVAL_MS,
		),
	);
	assert.equal(now, 1_000 + DEFAULT_GRANT_COMMIT_WAIT_MS);
});

test("runner access preserves run and analyst identity but grants no authority", async () => {
	const { dir } = await makeStore();
	const access = await resolveStoreAccess(
		new ProvenanceResolver(dir),
		{ cwd: dir },
		{
			PI_SUBAGENT_CHILD: "1",
			PI_SUBAGENT_RUN_ID: "run-a",
			PI_SUBAGENT_CHILD_AGENT: RESULT_ANALYST_RUNTIME_NAME,
		},
	);

	assert.equal(access.actor, "subagent");
	assert.equal(access.subagentRunId, "run-a");
	assert.equal(access.subagentAgentName, RESULT_ANALYST_RUNTIME_NAME);
	assert.equal(access.grantedSourceIds, undefined);
});

test("real retrieval tools allow only explicitly granted exact sources", async () => {
	const { dir, store } = await makeStore();
	const sourceA = await store.storeSource({
		toolName: "bash",
		text: "needle from source A\n",
		captureStatus: "event.content",
	});
	const sourceB = await store.storeSource({
		toolName: "bash",
		text: "needle from source B\n",
		captureStatus: "event.content",
	});
	const registry = new RunBoundGrantRegistry(dir, {
		now: () => 1_000,
		commitWaitMs: 0,
	});
	await registry.commit(
		prepareGrant(registry, {
			sourceIds: [sourceA.sourceId],
			operations: ["search"],
			calls: 2,
			outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT * 2,
		}),
		"run-a",
	);
	const tools = buildToolResultTools(
		store,
		async () => ({
			actor: "subagent",
			subagentRunId: "run-a",
			subagentAgentName: RESULT_ANALYST_RUNTIME_NAME,
		}),
		registry,
	);
	const search = tools.find((tool) => tool.name === "tool_result_search");
	const list = tools.find((tool) => tool.name === "tool_result_list");
	assert.ok(search);
	assert.ok(list);

	await assert.rejects(
		search.execute("broad", { query: "needle" }, undefined, undefined, {
			cwd: dir,
		}),
		GRANT_UNAVAILABLE,
	);
	await assert.rejects(
		search.execute(
			"foreign-source",
			{ query: "needle", sourceId: sourceB.sourceId },
			undefined,
			undefined,
			{ cwd: dir },
		),
		GRANT_UNAVAILABLE,
	);
	const result = await search.execute(
		"exact",
		{ query: "needle", sourceId: sourceA.sourceId },
		undefined,
		undefined,
		{ cwd: dir },
	);
	assert.match(result.content[0]?.text ?? "", /needle from source A/);

	const listResult = await list.execute("list", {}, undefined, undefined, {
		cwd: dir,
	});
	assert.equal(listResult.details?.count, 0);
});
