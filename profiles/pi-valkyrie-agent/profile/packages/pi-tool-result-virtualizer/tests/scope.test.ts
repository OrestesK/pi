import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { type StoreAccessContext, ToolResultStore } from "../src/store.ts";

const PROJECT_A = "a".repeat(64);
const PROJECT_B = "b".repeat(64);
const parentA: StoreAccessContext = { actor: "parent", projectId: PROJECT_A };
const childA: StoreAccessContext = {
	actor: "subagent",
	projectId: PROJECT_A,
	sessionId: "child-session",
	subagentRunId: "run-a",
};

test("broad discovery is project scoped while unscoped rows require exact ids", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-scope-discovery-"));
	const store = new ToolResultStore(root);
	const projectA = await store.storeSource({
		toolName: "read",
		text: "project-a needle\n",
		captureStatus: "event.content",
		provenance: {
			scope: "project",
			projectId: PROJECT_A,
			classification: "unclassified-local",
		},
	});
	const projectB = await store.storeSource({
		toolName: "read",
		text: "project-b needle\n",
		captureStatus: "event.content",
		provenance: {
			scope: "project",
			projectId: PROJECT_B,
			classification: "unclassified-local",
		},
	});
	const unscoped = await store.storeSource({
		toolName: "read",
		text: "unscoped needle\n",
		captureStatus: "event.content",
		provenance: {
			scope: "unscoped",
			classification: "unclassified-local",
			scopeFailure: "cwd_unavailable",
		},
	});
	const legacy = await store.storeSource({
		toolName: "read",
		text: "legacy needle\n",
		captureStatus: "event.content",
	});

	assert.deepEqual(
		(await store.listSources(20, parentA)).map((entry) => entry.sourceId),
		[projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...parentA,
				includeGlobal: true,
			})
		).map((entry) => entry.sourceId),
		[projectB.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...parentA,
				includeLegacy: true,
			})
		).map((entry) => entry.sourceId),
		[legacy.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...parentA,
				includeGlobal: true,
				includeLegacy: true,
			})
		).map((entry) => entry.sourceId),
		[legacy.sourceId, projectB.sourceId, projectA.sourceId],
	);
	assert.equal(
		(
			await store.listSources(20, {
				...parentA,
				includeGlobal: true,
				includeLegacy: true,
			})
		).some((entry) => entry.sourceId === unscoped.sourceId),
		false,
	);
	assert.deepEqual(
		(await store.search("needle", { limit: 20, access: parentA })).map(
			(match) => match.sourceId,
		),
		[projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.search("needle", {
				limit: 20,
				access: { ...parentA, includeGlobal: true },
			})
		).map((match) => match.sourceId),
		[projectB.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		await store.listSources(20, { ...childA, includeGlobal: true }),
		[],
	);
	assert.deepEqual(
		await store.search("needle", {
			limit: 20,
			access: { ...childA, includeGlobal: true },
		}),
		[],
	);
});

test("parent exact ids are possession capabilities while subagents require grants", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-scope-exact-"));
	const store = new ToolResultStore(root);
	const projectA = await store.storeSource({
		toolName: "read",
		text: "project-a\n",
		captureStatus: "event.content",
		provenance: {
			scope: "project",
			projectId: PROJECT_A,
			classification: "unclassified-local",
		},
	});
	const projectB = await store.storeSource({
		toolName: "read",
		text: "project-b\n",
		captureStatus: "event.content",
		provenance: {
			scope: "project",
			projectId: PROJECT_B,
			classification: "unclassified-local",
		},
	});
	const unscoped = await store.storeSource({
		toolName: "read",
		text: "unscoped\n",
		captureStatus: "event.content",
		provenance: {
			scope: "unscoped",
			classification: "unclassified-local",
			scopeFailure: "cwd_unavailable",
		},
	});
	const legacy = await store.storeSource({
		toolName: "read",
		text: "legacy\n",
		captureStatus: "event.content",
	});

	assert.equal(
		(await store.readSource(projectA.sourceId, parentA)).metadata.sourceId,
		projectA.sourceId,
	);
	assert.deepEqual(
		(
			await store.search("project", {
				sourceIds: [projectA.sourceId, projectB.sourceId],
				access: parentA,
			})
		).map((match) => match.sourceId),
		[projectA.sourceId, projectB.sourceId],
	);
	await assert.rejects(
		store.search("project", {
			sourceIds: [projectA.sourceId],
			access: childA,
		}),
		/source not found/i,
	);
	assert.equal(
		(await store.readSource(unscoped.sourceId, parentA)).metadata.sourceId,
		unscoped.sourceId,
	);
	assert.equal(
		(await store.readSource(projectB.sourceId, parentA)).metadata.sourceId,
		projectB.sourceId,
	);
	assert.equal(
		(await store.readSource(legacy.sourceId, parentA)).metadata.sourceId,
		legacy.sourceId,
	);
	await assert.rejects(
		store.readSource(projectA.sourceId, childA),
		/source not found/i,
	);
	assert.equal(
		(await store.readSource(projectA.sourceId, { actor: "parent" })).metadata
			.sourceId,
		projectA.sourceId,
	);
});
