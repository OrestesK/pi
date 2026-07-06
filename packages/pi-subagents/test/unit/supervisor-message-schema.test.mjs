import test from "node:test";
import assert from "node:assert/strict";
import { Compile } from "typebox/compile";

import { loadTs } from "../support/load-ts.mjs";

const { SubagentParams } = await loadTs("../../src/extension/schemas.ts");
const { SUBAGENT_ACTIONS } = await loadTs("../../src/shared/types.ts");

test("public schema exposes the narrow supervisor message action", () => {
	assert.equal(SUBAGENT_ACTIONS.includes("message"), true);
	const validator = Compile(SubagentParams);
	assert.equal(validator.Check({ action: "message", id: "run-123", index: 0, message: "Also watch build.log" }), true);
});
