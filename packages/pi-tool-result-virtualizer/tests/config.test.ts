import assert from "node:assert/strict";
import test from "node:test";

import { resolveStoreRoot } from "../src/config.ts";

test("store root ignores PI_CODING_AGENT_DIR unless explicit root is set", () => {
	assert.equal(resolveStoreRoot({ PI_CODING_AGENT_DIR: "." }, "/home/example"), "/home/example/.pi/tool-result-virtualizer");
	assert.equal(resolveStoreRoot({ PI_CODING_AGENT_DIR: "/tmp/pi-agent" }, "/home/example"), "/home/example/.pi/tool-result-virtualizer");
	assert.equal(resolveStoreRoot({ PI_TOOL_RESULT_VIRTUALIZER_DIR: "relative-ok" }, "/home/example"), "relative-ok");
});
