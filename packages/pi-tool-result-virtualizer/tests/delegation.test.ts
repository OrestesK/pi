import assert from "node:assert/strict";
import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	type DelegationRpc,
	ResultDelegationService,
} from "../src/delegation.ts";
import type { ExtensionEventBusLike } from "../src/extension-types.ts";
import { PROTECTED_TOOL_OUTPUT_BYTE_LIMIT } from "../src/formatting.ts";
import {
	RESULT_ANALYST_RUNTIME_NAME,
	RunBoundGrantRegistry,
} from "../src/grants.ts";
import { ToolResultStore } from "../src/store.ts";
import {
	SUBAGENT_RPC_PROTOCOL_VERSION,
	SUBAGENT_RPC_READY_EVENT,
	SUBAGENT_RPC_REQUEST_EVENT,
	SubagentRpcClient,
	SubagentRpcClientError,
	subagentRpcReplyEvent,
	type SubagentRpcPing,
	type SubagentSpawnParams,
} from "../src/subagent-rpc-client.ts";
import { makeStore } from "./test-helpers.ts";

const PACKAGE_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PROJECT_ID = "d".repeat(64);

class FakeEvents implements ExtensionEventBusLike {
	readonly #handlers = new Map<string, Set<(data: unknown) => void>>();

	on(event: string, handler: (data: unknown) => void): () => void {
		const handlers = this.#handlers.get(event) ?? new Set();
		handlers.add(handler);
		this.#handlers.set(event, handlers);
		return () => handlers.delete(handler);
	}

	emit(event: string, data: unknown): void {
		for (const handler of this.#handlers.get(event) ?? []) handler(data);
	}

	listenerCount(event: string): number {
		return this.#handlers.get(event)?.size ?? 0;
	}
}

const READY_PING: SubagentRpcPing = {
	version: SUBAGENT_RPC_PROTOCOL_VERSION,
	methods: ["ping", "status", "spawn", "interrupt", "stop"],
	capabilities: {
		status: true,
		asyncSpawn: true,
		interrupt: true,
		stop: true,
	},
};

class FakeRpc implements DelegationRpc {
	ready = true;
	pingResult: SubagentRpcPing = READY_PING;
	spawnRunId = "run-1";
	pingError: Error | undefined;
	spawnError: Error | undefined;
	interruptError: Error | undefined;
	spawnCalls: SubagentSpawnParams[] = [];
	interruptCalls: string[] = [];

	isReady(): boolean {
		return this.ready;
	}

	async ping(): Promise<SubagentRpcPing> {
		if (this.pingError) throw this.pingError;
		return this.pingResult;
	}

	async spawn(params: SubagentSpawnParams): Promise<string> {
		this.spawnCalls.push(params);
		if (this.spawnError) throw this.spawnError;
		return this.spawnRunId;
	}

	async interrupt(runId: string): Promise<void> {
		this.interruptCalls.push(runId);
		if (this.interruptError) throw this.interruptError;
	}
}

async function storedSource(root: string, marker = "DELEGATION_SOURCE") {
	return new ToolResultStore(root).storeSource({
		toolName: "delegation-test",
		text: `${marker}\nsecond line\n`,
		captureStatus: "event.content",
		provenance: {
			scope: "project",
			classification: "unclassified-local",
			projectId: PROJECT_ID,
		},
	});
}

function service(
	root: string,
	rpc: DelegationRpc,
	overrides: Partial<{
		packageRoot: string;
		access: "parent" | "subagent";
		projectId: string;
	}> = {},
): ResultDelegationService {
	return new ResultDelegationService({
		store: new ToolResultStore(root),
		resolveAccess: async () => ({
			actor: overrides.access ?? "parent",
			projectId: overrides.projectId ?? PROJECT_ID,
		}),
		grants: new RunBoundGrantRegistry(root, { commitWaitMs: 0 }),
		rpc,
		packageRoot: overrides.packageRoot ?? PACKAGE_ROOT,
	});
}

function status(result: { details?: Record<string, unknown> }): unknown {
	return result.details?.status;
}

function hasClientErrorCode(error: unknown, code: string): boolean {
	return (
		typeof error === "object" &&
		error !== null &&
		"code" in error &&
		error.code === code
	);
}

test("RPC client times out without a bridge and removes request listeners", async () => {
	const events = new FakeEvents();
	const client = new SubagentRpcClient(events, {
		timeoutMs: 5,
		requestId: () => "timeout-request",
	});

	await assert.rejects(client.ping(), (error: unknown) =>
		hasClientErrorCode(error, "timeout"),
	);
	assert.equal(
		events.listenerCount(subagentRpcReplyEvent("timeout-request")),
		0,
	);
	client.dispose();
});

test("RPC client abort and event-bus failures clean up request listeners", async () => {
	const abortedEvents = new FakeEvents();
	const abortedClient = new SubagentRpcClient(abortedEvents, {
		timeoutMs: 1_000,
		requestId: () => "aborted-request",
	});
	const controller = new AbortController();
	const pending = abortedClient.ping(controller.signal);
	controller.abort();
	await assert.rejects(pending, (error: unknown) =>
		hasClientErrorCode(error, "aborted"),
	);
	assert.equal(
		abortedEvents.listenerCount(subagentRpcReplyEvent("aborted-request")),
		0,
	);

	class ThrowingEvents extends FakeEvents {
		override emit(event: string, data: unknown): void {
			if (event === SUBAGENT_RPC_REQUEST_EVENT)
				throw new Error("event bus failed");
			super.emit(event, data);
		}
	}
	const throwingEvents = new ThrowingEvents();
	const throwingClient = new SubagentRpcClient(throwingEvents, {
		requestId: () => "throwing-request",
	});
	await assert.rejects(throwingClient.ping(), (error: unknown) =>
		hasClientErrorCode(error, "unavailable"),
	);
	assert.equal(
		throwingEvents.listenerCount(subagentRpcReplyEvent("throwing-request")),
		0,
	);
});

test("RPC client ignores stale replies and rejects forged exact replies", async () => {
	const staleEvents = new FakeEvents();
	staleEvents.on(SUBAGENT_RPC_REQUEST_EVENT, (raw) => {
		const request = raw as { requestId: string };
		staleEvents.emit(subagentRpcReplyEvent(request.requestId), {
			version: SUBAGENT_RPC_PROTOCOL_VERSION,
			requestId: "old-request",
			method: "ping",
			success: true,
			data: READY_PING,
		});
		queueMicrotask(() =>
			staleEvents.emit(subagentRpcReplyEvent(request.requestId), {
				version: SUBAGENT_RPC_PROTOCOL_VERSION,
				requestId: request.requestId,
				method: "ping",
				success: true,
				data: READY_PING,
			}),
		);
	});
	const staleClient = new SubagentRpcClient(staleEvents, {
		requestId: () => "current-request",
	});
	assert.deepEqual(await staleClient.ping(), READY_PING);

	const forgedEvents = new FakeEvents();
	forgedEvents.on(SUBAGENT_RPC_REQUEST_EVENT, (raw) => {
		const request = raw as { requestId: string };
		forgedEvents.emit(subagentRpcReplyEvent(request.requestId), {
			version: SUBAGENT_RPC_PROTOCOL_VERSION,
			requestId: request.requestId,
			method: "ping",
			success: "forged",
			data: READY_PING,
		});
	});
	const forgedClient = new SubagentRpcClient(forgedEvents, {
		requestId: () => "forged-request",
	});
	await assert.rejects(forgedClient.ping(), (error: unknown) =>
		hasClientErrorCode(error, "invalid_reply"),
	);
});

test("RPC ready state requires the complete delegation capability set", () => {
	const events = new FakeEvents();
	const client = new SubagentRpcClient(events);
	assert.equal(client.isReady(), false);
	events.emit(SUBAGENT_RPC_READY_EVENT, READY_PING);
	assert.equal(client.isReady(), true);
	events.emit(SUBAGENT_RPC_READY_EVENT, {
		...READY_PING,
		capabilities: { ...READY_PING.capabilities, asyncSpawn: false },
	});
	assert.equal(client.isReady(), false);
});

test("delegation performs preflight internally and starts one run", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	const result = await service(dir, rpc).delegate(
		{
			sourceId: source.sourceId,
			task: "Identify the decisive evidence.",
		},
		{ cwd: dir },
	);

	assert.equal(status(result), "started");
	assert.equal(rpc.spawnCalls.length, 1);
	assert.equal(result.details?.runId, "run-1");
	assert.deepEqual(result.details?.actions, [
		{
			kind: "status",
			tool: "subagent",
			args: { action: "status", id: "run-1" },
		},
		{
			kind: "interrupt",
			tool: "subagent",
			args: { action: "interrupt", id: "run-1" },
		},
	]);
});

test("delegation returns typed unavailable states and accepts parent possession ids", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);

	const noBridge = new FakeRpc();
	noBridge.pingError = new SubagentRpcClientError("timeout", "no bridge");
	const noBridgeResult = await service(dir, noBridge).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);
	assert.equal(status(noBridgeResult), "delegation_unavailable");
	assert.equal(noBridgeResult.details?.reasonCode, "rpc_unavailable");

	const noCapability = new FakeRpc();
	noCapability.pingResult = {
		...READY_PING,
		capabilities: { ...READY_PING.capabilities, interrupt: false },
	};
	const noCapabilityResult = await service(dir, noCapability).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);
	assert.equal(status(noCapabilityResult), "delegation_unavailable");
	assert.equal(
		noCapabilityResult.details?.reasonCode,
		"rpc_capability_missing",
	);

	const missingPackage = await mkdtemp(join(tmpdir(), "pi-trv-no-agent-"));
	const packageResult = await service(dir, new FakeRpc(), {
		packageRoot: missingPackage,
	}).delegate({ sourceId: source.sourceId, task: "Summarize" }, { cwd: dir });
	assert.equal(status(packageResult), "delegation_unavailable");
	assert.equal(packageResult.details?.reasonCode, "analyst_unavailable");

	const missingSourceResult = await service(dir, new FakeRpc()).delegate(
		{ sourceId: "tr_missing_source", task: "Summarize" },
		{ cwd: dir },
	);
	assert.equal(status(missingSourceResult), "source_unavailable");

	const crossProjectRpc = new FakeRpc();
	const crossProjectResult = await service(dir, crossProjectRpc, {
		projectId: "e".repeat(64),
	}).delegate({ sourceId: source.sourceId, task: "Summarize" }, { cwd: dir });
	assert.equal(status(crossProjectResult), "started");
	assert.equal(crossProjectRpc.spawnCalls.length, 1);

	const legacy = await new ToolResultStore(dir).storeSource({
		toolName: "legacy-source",
		text: "legacy\n",
		captureStatus: "event.content",
	});
	const legacyRpc = new FakeRpc();
	legacyRpc.spawnRunId = "run-2";
	const legacyResult = await service(dir, legacyRpc).delegate(
		{ sourceId: legacy.sourceId, task: "Summarize" },
		{ cwd: dir },
	);
	assert.equal(status(legacyResult), "started");
	assert.equal(legacyRpc.spawnCalls.length, 1);
});

test("subagent callers cannot delegate or probe RPC readiness", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	const result = await service(dir, rpc, { access: "subagent" }).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_unavailable");
	assert.equal(result.details?.reasonCode, "parent_only");
	assert.equal(rpc.spawnCalls.length, 0);
});

test("explicit delegation spawns once, commits the returned run, and exposes typed actions", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Find the root cause." },
		{ cwd: dir },
	);

	assert.equal(status(result), "started");
	assert.equal(result.details?.runId, "run-1");
	assert.deepEqual(result.details?.actions, [
		{
			kind: "status",
			tool: "subagent",
			args: { action: "status", id: "run-1" },
		},
		{
			kind: "interrupt",
			tool: "subagent",
			args: { action: "interrupt", id: "run-1" },
		},
	]);
	assert.equal(rpc.spawnCalls.length, 1);
	const spawn = rpc.spawnCalls[0];
	assert.equal(spawn?.agent, RESULT_ANALYST_RUNTIME_NAME);
	assert.equal(spawn?.context, "fresh");
	assert.equal(spawn?.async, true);
	assert.equal(spawn?.toolBudget?.hard, 8);
	assert.deepEqual(spawn?.toolBudget?.block, "*");
	const task = spawn?.task ?? "";
	assert.match(task, new RegExp(source.sourceId));
	assert.match(task, /Objective: Find the root cause\./);
	assert.match(task, /Access status: complete \| partial \| blocked/);
	assert.match(task, /Completion status: complete \| incomplete/);
	assert.match(task, /Findings: concise bullets/);
	assert.match(task, /line citations/i);
	assert.match(task, /Uncertainty: explicit unknowns or none\./);
	assert.match(task, /Residual risks: explicit remaining risks or none\./);
	assert.doesNotMatch(task, /grant/i);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(source.sourceId));

	await new RunBoundGrantRegistry(dir, { commitWaitMs: 0 }).reserve({
		runId: "run-1",
		agentName: RESULT_ANALYST_RUNTIME_NAME,
		operation: "get",
		sourceIds: [source.sourceId],
		outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
	});
});

test("spawn failure aborts the pending grant and returns typed unavailability", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	rpc.spawnError = new Error("spawn failed");
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_unavailable");
	assert.equal(result.details?.reasonCode, "spawn_failed");
	await assert.rejects(readdir(join(dir, "grants")), { code: "ENOENT" });
});

test("spawn timeout returns unknown outcome without committing source access", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	rpc.spawnError = new SubagentRpcClientError("timeout", "spawn timeout");
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_unavailable");
	assert.equal(result.details?.reasonCode, "spawn_outcome_unknown");
	await assert.rejects(readdir(join(dir, "grants")), { code: "ENOENT" });
});

test("grant commit failure interrupts the spawned run and returns management actions", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const existingRegistry = new RunBoundGrantRegistry(dir, { commitWaitMs: 0 });
	await existingRegistry.commit(
		existingRegistry.prepare({
			agentName: RESULT_ANALYST_RUNTIME_NAME,
			sourceIds: [source.sourceId],
			operations: ["get"],
			budget: {
				calls: 1,
				outputBytes: PROTECTED_TOOL_OUTPUT_BYTE_LIMIT,
			},
			expiresAt: Date.now() + 60_000,
		}),
		"run-1",
	);
	const rpc = new FakeRpc();
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_failed");
	assert.equal(result.details?.reasonCode, "grant_commit_failed");
	assert.deepEqual(rpc.interruptCalls, ["run-1"]);
	assert.equal(result.details?.runId, "run-1");
	assert.equal(result.details?.cleanupStatus, "interrupt_requested");
	assert.equal((result.details?.actions as unknown[] | undefined)?.length, 2);

	const failedCleanupRpc = new FakeRpc();
	failedCleanupRpc.interruptError = new Error("interrupt failed");
	const failedCleanup = await service(dir, failedCleanupRpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);
	assert.equal(status(failedCleanup), "delegation_failed");
	assert.equal(failedCleanup.details?.cleanupStatus, "interrupt_failed");
	assert.doesNotMatch(JSON.stringify(failedCleanup), /interrupt failed/);
});
