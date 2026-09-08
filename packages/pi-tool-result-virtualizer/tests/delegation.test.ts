import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	type DelegationRpc,
	RESULT_ANALYST_RUNTIME_NAME,
	ResultDelegationService,
} from "../src/delegation.ts";
import type { ExtensionEventBusLike } from "../src/extension-types.ts";
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
	spawnCalls: SubagentSpawnParams[] = [];

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

	async interrupt(_runId: string): Promise<void> {}
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

test("explicit delegation spawns one bounded analyst and exposes typed actions", async () => {
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
	assert.equal(spawn?.timeoutMs, 240_000);
	assert.equal(spawn?.toolBudget?.hard, 8);
	assert.deepEqual(spawn?.toolBudget?.block, "*");
	assert.deepEqual(spawn?.maxOutput, { bytes: 8_192, lines: 200 });
	const task = spawn?.task ?? "";
	assert.match(task, new RegExp(source.sourceId));
	assert.match(task, /Objective: Find the root cause\./);
	assert.match(task, /Access status: complete \| partial \| blocked/);
	assert.match(task, /Completion status: complete \| incomplete/);
	assert.match(task, /Findings: concise bullets/);
	assert.match(task, /line citations/i);
	assert.match(task, /Uncertainty: explicit unknowns or none\./);
	assert.match(task, /Residual risks: explicit remaining risks or none\./);
	assert.doesNotMatch(JSON.stringify(result), new RegExp(source.sourceId));
});

test("spawn failure returns bounded RPC diagnostics", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	rpc.spawnError = new SubagentRpcClientError(
		"rpc_error",
		"sensitive spawn failure",
		"execution_failed",
	);
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_unavailable");
	assert.equal(result.details?.reasonCode, "spawn_failed");
	assert.equal(result.details?.clientErrorCode, "rpc_error");
	assert.equal(result.details?.rpcErrorCode, "execution_failed");
	assert.doesNotMatch(JSON.stringify(result), /sensitive spawn failure/);
});

test("spawn failure omits malformed RPC codes and raw messages", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	rpc.spawnError = new SubagentRpcClientError(
		"rpc_error",
		"sensitive malformed reply",
		"../../not-bounded",
	);
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(result.details?.reasonCode, "spawn_failed");
	assert.equal(result.details?.clientErrorCode, "rpc_error");
	assert.equal(result.details?.rpcErrorCode, undefined);
	assert.doesNotMatch(JSON.stringify(result), /sensitive malformed reply|not-bounded/);
});

test("spawn timeout returns an unknown outcome", async () => {
	const { dir } = await makeStore();
	const source = await storedSource(dir);
	const rpc = new FakeRpc();
	rpc.spawnError = new SubagentRpcClientError("timeout", "sensitive timeout");
	const result = await service(dir, rpc).delegate(
		{ sourceId: source.sourceId, task: "Summarize" },
		{ cwd: dir },
	);

	assert.equal(status(result), "delegation_unavailable");
	assert.equal(result.details?.reasonCode, "spawn_outcome_unknown");
	assert.equal(result.details?.clientErrorCode, "timeout");
	assert.equal(result.details?.rpcErrorCode, undefined);
	assert.doesNotMatch(JSON.stringify(result), /sensitive timeout/);
});
