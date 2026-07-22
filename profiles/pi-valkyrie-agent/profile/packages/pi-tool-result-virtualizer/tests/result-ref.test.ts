import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
	resultRefFromMetadata,
	type CitationRef,
	type ResultRef,
} from "../src/result-ref.ts";
import { ToolResultStore } from "../src/store.ts";

test("result refs distinguish exact captures from possibly truncated event content", () => {
	const exact = resultRefFromMetadata({
		sourceId: "tr_exact_1234abcd",
		captureStatus: "read.input.path",
		byteCount: 100,
		lineCount: 5,
		sha256: "a".repeat(64),
	});
	const visibleOnly = resultRefFromMetadata({
		sourceId: "tr_visible_1234abcd",
		captureStatus: "event.content",
		byteCount: 50,
		lineCount: 2,
		sha256: "b".repeat(64),
	});

	assert.deepEqual(exact, {
		sourceId: "tr_exact_1234abcd",
		scope: { kind: "legacy" },
		availability: "available",
		contentKind: "text",
		captureStatus: "read.input.path",
		completeness: "exact_capture",
		byteCount: 100,
		lineCount: 5,
		sha256: "a".repeat(64),
	});
	assert.equal(visibleOnly.completeness, "possibly_truncated");
});

test("result refs preserve explicit project scope and honest unavailable states", () => {
	const ref = resultRefFromMetadata({
		sourceId: "tr_project_1234abcd",
		captureStatus: "details.fullOutputPath",
		byteCount: 200,
		lineCount: 10,
		sha256: "c".repeat(64),
		projectId: "project-1",
		sessionId: "session-1",
		availability: "unverified",
		contentKind: "jsonl",
	});

	assert.deepEqual(ref.scope, {
		kind: "project",
		projectId: "project-1",
		sessionId: "session-1",
	});
	assert.equal(ref.availability, "unverified");
	assert.equal(ref.contentKind, "jsonl");
	assert.equal(ref.completeness, "exact_capture");
});

test("result refs represent every availability state explicitly", () => {
	for (const availability of [
		"available",
		"missing",
		"failed",
		"unverified",
	] as const) {
		const ref = resultRefFromMetadata({
			sourceId: `tr_${availability}_1234abcd`,
			captureStatus: "event.content",
			byteCount: 0,
			lineCount: 0,
			sha256: "e".repeat(64),
			availability,
		});
		assert.equal(ref.availability, availability);
	}
});

test("store loads legacy index rows without rewriting them", async () => {
	const root = await mkdtemp(join(tmpdir(), "pi-trv-result-ref-legacy-"));
	const sources = join(root, "sources");
	await mkdir(sources);
	const textPath = join(sources, "tr_legacy_1234abcd.txt");
	await writeFile(textPath, "legacy evidence\n", "utf8");
	const row = JSON.stringify({
		sourceId: "tr_legacy_1234abcd",
		toolName: "read",
		captureStatus: "event.content",
		storageKind: "content",
		createdAt: 1,
		byteCount: 16,
		lineCount: 1,
		sha256: "f".repeat(64),
		textPath,
	});
	await writeFile(join(root, "index.jsonl"), `${row}\n`, "utf8");

	const [metadata] = await new ToolResultStore(root).listSources(1);
	assert.equal(metadata?.metadataVersion, 1);
	assert.equal(metadata?.scope, "legacy");
	assert.equal(metadata?.classification, "legacy-unclassified");
	assert.equal(await readFile(join(root, "index.jsonl"), "utf8"), `${row}\n`);
});

test("citation refs identify exact source line ranges", () => {
	const citation: CitationRef = {
		sourceId: "tr_cited_1234abcd",
		startLine: 4,
		endLine: 9,
	};
	const result: ResultRef = resultRefFromMetadata({
		sourceId: citation.sourceId,
		captureStatus: "event.content",
		byteCount: 10,
		lineCount: 9,
		sha256: "d".repeat(64),
	});

	assert.equal(citation.sourceId, result.sourceId);
	assert.equal(citation.startLine, 4);
	assert.equal(citation.endLine, 9);
});
