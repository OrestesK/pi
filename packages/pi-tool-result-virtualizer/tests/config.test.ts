import assert from "node:assert/strict";
import test from "node:test";

import { resolveStoreLimits, resolveStoreRoot } from "../src/config.ts";

test("store root ignores PI_CODING_AGENT_DIR unless explicit root is set", () => {
	assert.equal(
		resolveStoreRoot({ PI_CODING_AGENT_DIR: "." }, "/home/example"),
		"/home/example/.pi/tool-result-virtualizer",
	);
	assert.equal(
		resolveStoreRoot({ PI_CODING_AGENT_DIR: "/tmp/pi-agent" }, "/home/example"),
		"/home/example/.pi/tool-result-virtualizer",
	);
	assert.equal(
		resolveStoreRoot(
			{ PI_TOOL_RESULT_VIRTUALIZER_DIR: "relative-ok" },
			"/home/example",
		),
		"relative-ok",
	);
});

test("store quotas are disabled when unset and parse positive integer limits", () => {
	assert.deepEqual(resolveStoreLimits({}), {});
	assert.deepEqual(
		resolveStoreLimits({
			PI_TOOL_RESULT_VIRTUALIZER_MAX_SOURCES: "100",
			PI_TOOL_RESULT_VIRTUALIZER_MAX_STORED_BYTES: "4096",
		}),
		{ maxSources: 100, maxStoredBytes: 4096 },
	);
	assert.throws(
		() => resolveStoreLimits({ PI_TOOL_RESULT_VIRTUALIZER_MAX_SOURCES: "0" }),
		/positive integer/i,
	);
	assert.throws(
		() =>
			resolveStoreLimits({
				PI_TOOL_RESULT_VIRTUALIZER_MAX_STORED_BYTES: "1.5",
			}),
		/positive integer/i,
	);
});
