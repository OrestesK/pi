import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	STRUCTURED_OUTPUT_CAPTURE_ENV,
	STRUCTURED_OUTPUT_SCHEMA_ENV,
} = await loadTs("../../src/runs/shared/structured-output.ts");

async function withStructuredOutputEnv(fn) {
	const previousCapture = process.env[STRUCTURED_OUTPUT_CAPTURE_ENV];
	const previousSchema = process.env[STRUCTURED_OUTPUT_SCHEMA_ENV];
	try {
		await fn();
	} finally {
		if (previousCapture === undefined) delete process.env[STRUCTURED_OUTPUT_CAPTURE_ENV];
		else process.env[STRUCTURED_OUTPUT_CAPTURE_ENV] = previousCapture;
		if (previousSchema === undefined) delete process.env[STRUCTURED_OUTPUT_SCHEMA_ENV];
		else process.env[STRUCTURED_OUTPUT_SCHEMA_ENV] = previousSchema;
	}
}

test("prompt runtime registers structured_output tool when structured output env is present", async () => {
	await withStructuredOutputEnv(async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-runtime-"));
		try {
			const schemaPath = path.join(tmp, "schema.json");
			const outputPath = path.join(tmp, "output.json");
			fs.writeFileSync(schemaPath, JSON.stringify({
				type: "object",
				additionalProperties: false,
				required: ["ok"],
				properties: { ok: { type: "boolean" } },
			}));
			process.env[STRUCTURED_OUTPUT_SCHEMA_ENV] = schemaPath;
			process.env[STRUCTURED_OUTPUT_CAPTURE_ENV] = outputPath;

			let registeredTool;
			const handlers = new Map();
			const { default: registerSubagentPromptRuntime } = await loadTs("../../src/runs/shared/subagent-prompt-runtime.ts");
			registerSubagentPromptRuntime({
				registerTool(tool) {
					registeredTool = tool;
				},
				on(event, handler) {
					handlers.set(event, handler);
				},
			});

			assert.equal(registeredTool?.name, "structured_output");
			assert.deepEqual(registeredTool?.parameters?.required, ["value"]);
			await assert.rejects(
				() => registeredTool.execute("call-1", { value: { ok: "yes" } }),
				/Structured output validation failed/,
			);
			const result = await registeredTool.execute("call-2", { value: { ok: true } });
			assert.equal(result.terminate, true);
			assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf-8")), { ok: true });
			assert.equal(typeof handlers.get("context"), "function");
			assert.equal(typeof handlers.get("before_agent_start"), "function");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});
