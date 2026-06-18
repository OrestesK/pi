import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	assertJsonSchemaObject,
	cleanupStructuredOutputRuntime,
	createStructuredOutputRuntime,
	readStructuredOutput,
	validateStructuredOutputValue,
} = await loadTs("../../src/runs/shared/structured-output.ts");

test("structured output runtime writes schema and validates captured output", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-structured-test-"));
	const schema = {
		type: "object",
		additionalProperties: false,
		required: ["summary", "count"],
		properties: {
			summary: { type: "string" },
			count: { type: "number" },
		},
	};

	const runtime = createStructuredOutputRuntime(schema, tmp);
	try {
		assert.equal(JSON.parse(fs.readFileSync(runtime.schemaPath, "utf-8")).required[0], "summary");
		assert.equal(path.dirname(runtime.schemaPath), path.dirname(runtime.outputPath));

		fs.writeFileSync(runtime.outputPath, JSON.stringify({ summary: "done", count: 2 }));
		assert.deepEqual(readStructuredOutput(runtime), { value: { summary: "done", count: 2 } });
	} finally {
		cleanupStructuredOutputRuntime(runtime);
		fs.rmSync(tmp, { recursive: true, force: true });
	}

	assert.equal(fs.existsSync(path.dirname(runtime.schemaPath)), false);
	assert.equal(fs.existsSync(tmp), false);
});

test("structured output reports missing and schema-invalid captures", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-structured-invalid-"));
	const schema = {
		type: "object",
		additionalProperties: false,
		required: ["ok"],
		properties: { ok: { type: "boolean" } },
	};
	const runtime = createStructuredOutputRuntime(schema, tmp);
	try {
		assert.match(readStructuredOutput(runtime).error ?? "", /Missing structured_output call/);

		fs.writeFileSync(runtime.outputPath, JSON.stringify({ ok: "yes" }));
		assert.match(readStructuredOutput(runtime).error ?? "", /Structured output validation failed/);
		assert.deepEqual(validateStructuredOutputValue(schema, { ok: true }), { status: "valid" });
		assert.equal(validateStructuredOutputValue(schema, { ok: "yes" }).status, "invalid");
	} finally {
		cleanupStructuredOutputRuntime(runtime);
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("structured output schema must be a JSON object", () => {
	assert.doesNotThrow(() => assertJsonSchemaObject({ type: "object" }));
	assert.throws(() => assertJsonSchemaObject(false), /outputSchema must be a JSON Schema object/);
	assert.throws(() => assertJsonSchemaObject([], "chain\[0\]\.outputSchema"), /chain\[0\]\.outputSchema must be a JSON Schema object/);
});
