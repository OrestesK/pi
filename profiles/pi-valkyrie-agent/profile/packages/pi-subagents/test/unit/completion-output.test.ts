import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { boundCompletionOutput } from "../../src/shared/types.ts";

describe("bounded completion output", () => {
	it("keeps useful head and tail context inside strict UTF-8 byte and line limits", () => {
		const input = `HEAD-SENTINEL\n${"🙂 middle line\n".repeat(40)}TAIL-SENTINEL`;
		const result = boundCompletionOutput(input, { bytes: 220, lines: 7 }, `Inspect:\n${"status line\n".repeat(100)}run-1`);

		assert.equal(result.truncated, true);
		assert.ok(Buffer.byteLength(result.text, "utf8") <= 220);
		assert.ok(result.text.split("\n").length <= 7);
		assert.match(result.text, /HEAD-SENTINEL/);
		assert.match(result.text, /TAIL-SENTINEL/);
		assert.match(result.text, /TRUNCATED/);
		assert.doesNotMatch(result.text, /�/);
	});

	it("returns compliant text unchanged", () => {
		assert.deepEqual(boundCompletionOutput("short output", { bytes: 100, lines: 3 }), {
			text: "short output",
			truncated: false,
		});
	});
});
