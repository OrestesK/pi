import assert from "node:assert/strict";
import {
	mkdir,
	mkdtemp,
	readFile,
	stat,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ProvenanceResolver } from "../src/provenance.ts";
import { ToolResultStore } from "../src/store.ts";
import { markerLines, withRegisteredExtension } from "./test-helpers.ts";

test("project provenance is stable across resolver instances and canonical paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-provenance-root-"));
	const project = await mkdtemp(join(tmpdir(), "pi-trv-provenance-project-"));
	const aliasParent = await mkdtemp(join(tmpdir(), "pi-trv-provenance-alias-"));
	const alias = join(aliasParent, "project-link");
	await symlink(project, alias, "dir");

	const firstResolver = new ProvenanceResolver(root);
	const competingResolver = new ProvenanceResolver(root);
	const [first, concurrent] = await Promise.all([
		firstResolver.resolve({ cwd: project }, {}),
		competingResolver.resolve({ cwd: alias }, {}),
	]);
	const restarted = await new ProvenanceResolver(root).resolve(
		{ cwd: project },
		{},
	);

	assert.equal(first.scope, "project");
	assert.equal(first.projectId?.length, 64);
	assert.equal(concurrent.projectId, first.projectId);
	assert.equal(restarted.projectId, first.projectId);
	assert.equal(first.classification, "unclassified-local");

	const keyPath = join(root, "scope.key");
	const keyStats = await stat(keyPath);
	const key = await readFile(keyPath);
	assert.equal(keyStats.mode & 0o777, 0o600);
	assert.equal(key.length, 32);
});

test("provenance records host session and existing subagent runtime identity", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-provenance-session-"));
	const project = await mkdtemp(join(tmpdir(), "pi-trv-provenance-cwd-"));
	const provenance = await new ProvenanceResolver(root).resolve(
		{
			cwd: project,
			sessionManager: { getSessionId: () => "session-1" },
		},
		{
			PI_SUBAGENT_RUN_ID: "run-1",
			PI_SUBAGENT_CHILD_AGENT: "reviewer",
		},
	);

	assert.equal(provenance.sessionId, "session-1");
	assert.equal(provenance.subagentRunId, "run-1");
	assert.equal(provenance.agentName, "reviewer");
});

test("unresolvable working directories produce honest unscoped provenance", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-provenance-unscoped-"));
	const provenance = await new ProvenanceResolver(root).resolve(
		{ cwd: join(root, "missing-project") },
		{},
	);

	assert.deepEqual(provenance, {
		scope: "unscoped",
		classification: "unclassified-local",
		scopeFailure: "cwd_unavailable",
	});
});

test("scope-key corruption is persisted as an explicit unscoped diagnostic", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-provenance-corrupt-key-"));
	const project = await mkdtemp(
		join(tmpdir(), "pi-trv-provenance-corrupt-project-"),
	);
	await writeFile(join(root, "scope.key"), "invalid", { mode: 0o600 });
	const provenance = await new ProvenanceResolver(root).resolve(
		{ cwd: project },
		{},
	);
	assert.deepEqual(provenance, {
		scope: "unscoped",
		classification: "unclassified-local",
		scopeFailure: "scope_key_unavailable",
	});

	const stored = await new ToolResultStore(root).storeSource({
		toolName: "read",
		text: "evidence\n",
		captureStatus: "event.content",
		provenance,
	});
	assert.equal(stored.scopeFailure, "scope_key_unavailable");
});

test("extension passes host session provenance into stored captures", async () => {
	const project = await mkdtemp(
		join(tmpdir(), "pi-trv-provenance-extension-project-"),
	);
	await withRegisteredExtension(
		async ({ dir, runToolResult }) => {
			await runToolResult({
				toolName: "read",
				content: [
					{ type: "text", text: markerLines("SESSION_PROVENANCE", 250) },
				],
				details: {},
			});
			const index = await readFile(join(dir, "index.jsonl"), "utf8");
			let stored: unknown;
			try {
				stored = JSON.parse(index.trim());
			} catch (error) {
				assert.fail(`stored metadata is not valid JSON: ${String(error)}`);
			}
			assert.ok(stored && typeof stored === "object" && !Array.isArray(stored));
			assert.equal(
				(stored as Record<string, unknown>).sessionId,
				"session-extension-1",
			);
			assert.equal((stored as Record<string, unknown>).scope, "project");
		},
		{
			context: () => ({
				cwd: project,
				sessionManager: { getSessionId: () => "session-extension-1" },
			}),
		},
	);
});

test("store persists provenance without raw working-directory paths", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-provenance-store-"));
	const project = join(root, "private-project-name");
	await mkdir(project);
	const provenance = await new ProvenanceResolver(root).resolve(
		{ cwd: project },
		{},
	);
	const store = new ToolResultStore(root);
	const stored = await store.storeSource({
		toolName: "read",
		text: "evidence\n",
		captureStatus: "event.content",
		storageKind: "content",
		provenance,
	});

	assert.equal(stored.metadataVersion, 2);
	assert.equal(stored.scope, "project");
	assert.equal(stored.projectId, provenance.projectId);
	assert.equal(stored.classification, "unclassified-local");
	const index = await readFile(join(root, "index.jsonl"), "utf8");
	assert.doesNotMatch(index, /private-project-name/);
});
