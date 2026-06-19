import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const { buildPiArgs } = await loadTs("../../src/runs/shared/pi-args.ts");
const {
	STRUCTURED_OUTPUT_CAPTURE_ENV,
	STRUCTURED_OUTPUT_SCHEMA_ENV,
} = await loadTs("../../src/runs/shared/structured-output.ts");

test("buildPiArgs includes structured_output in explicit tool allowlist", () => {
	const { args } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "return structured output",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		tools: ["contact_supervisor"],
		structuredOutput: {
			schema: { type: "object" },
			schemaPath: "/tmp/schema.json",
			outputPath: "/tmp/output.json",
		},
	});

	const toolsIndex = args.indexOf("--tools");
	assert.notEqual(toolsIndex, -1);
	assert.equal(args[toolsIndex + 1], "contact_supervisor,structured_output");
});

test("buildPiArgs forwards structured output capture paths to child env", () => {
	const { env } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "return structured output",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		structuredOutput: {
			schema: { type: "object" },
			schemaPath: "/tmp/schema.json",
			outputPath: "/tmp/output.json",
		},
	});

	assert.equal(env[STRUCTURED_OUTPUT_SCHEMA_ENV], "/tmp/schema.json");
	assert.equal(env[STRUCTURED_OUTPUT_CAPTURE_ENV], "/tmp/output.json");
});
