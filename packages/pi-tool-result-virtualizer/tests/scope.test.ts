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
};
const forgedChildA = {
	...childA,
	subagentRunId: "forged-run",
	subagentAgentName: "forged-agent",
} as StoreAccessContext;

test("broad discovery is project scoped equally for parents and children", async () => {
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
		(await store.listSources(20, childA)).map((entry) => entry.sourceId),
		[projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...childA,
				includeGlobal: true,
			})
		).map((entry) => entry.sourceId),
		[projectB.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...childA,
				includeLegacy: true,
			})
		).map((entry) => entry.sourceId),
		[legacy.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.listSources(20, {
				...childA,
				includeGlobal: true,
				includeLegacy: true,
			})
		).map((entry) => entry.sourceId),
		[legacy.sourceId, projectB.sourceId, projectA.sourceId],
	);
	assert.equal(
		(
			await store.listSources(20, {
				...childA,
				includeGlobal: true,
				includeLegacy: true,
			})
		).some((entry) => entry.sourceId === unscoped.sourceId),
		false,
	);
	assert.deepEqual(
		(await store.search("needle", { limit: 20, access: childA })).map(
			(match) => match.sourceId,
		),
		[projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.search("needle", {
				limit: 20,
				access: { ...childA, includeGlobal: true },
			})
		).map((match) => match.sourceId),
		[projectB.sourceId, projectA.sourceId],
	);
	assert.deepEqual(
		(
			await store.search("needle", {
				limit: 20,
				access: {
					...childA,
					includeGlobal: true,
					includeLegacy: true,
				},
			})
		).map((match) => match.sourceId),
		[legacy.sourceId, projectB.sourceId, projectA.sourceId],
	);
});

test("exact ids are possession capabilities for parents and children", async () => {
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

	const exactSources = [
		[projectA, "project-a"],
		[projectB, "project-b"],
		[unscoped, "unscoped"],
		[legacy, "legacy"],
	] as const;
	for (const access of [parentA, childA, forgedChildA]) {
		for (const [source, query] of exactSources) {
			assert.equal(
				(await store.readSource(source.sourceId, access)).metadata.sourceId,
				source.sourceId,
			);
			assert.deepEqual(
				(
					await store.search(query, {
						sourceId: source.sourceId,
						access,
					})
				).map((match) => match.sourceId),
				[source.sourceId],
			);
		}
	}
});
