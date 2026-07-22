import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	DEFAULT_MAX_OUTPUT,
	resolveMaxOutputConfig,
	truncateOutput,
} from "../../src/shared/types.ts";

describe("output truncation", () => {
	it("includes the truncation marker inside strict UTF-8 byte and line limits", () => {
		const output = `${"🙂".repeat(40)}\n${"second line ".repeat(20)}\nthird line`;
		const result = truncateOutput(output, { bytes: 96, lines: 3 }, `/tmp/full-output.md\n${"extra path line\n".repeat(200)}`);

		assert.equal(result.truncated, true);
		assert.ok(Buffer.byteLength(result.text, "utf8") <= 96);
		assert.ok(result.text.split("\n").length <= 3);
		assert.match(result.text, /TRUNCATED/);
		assert.doesNotMatch(result.text, /�/);
	});

	it("keeps even a long marker within a one-line byte budget", () => {
		const result = truncateOutput("long output that exceeds the budget", { bytes: 12, lines: 1 }, `/tmp/${"x".repeat(500)}`);

		assert.equal(result.truncated, true);
		assert.ok(Buffer.byteLength(result.text, "utf8") <= 12);
		assert.equal(result.text.split("\n").length, 1);
		assert.doesNotMatch(result.text, /�/);
	});

	it("resolves documented defaults and applies partial overrides", () => {
		assert.deepEqual(resolveMaxOutputConfig(), DEFAULT_MAX_OUTPUT);
		assert.deepEqual(resolveMaxOutputConfig({ bytes: 1024 }), {
			bytes: 1024,
			lines: DEFAULT_MAX_OUTPUT.lines,
		});
		assert.deepEqual(resolveMaxOutputConfig({ lines: 12 }), {
			bytes: DEFAULT_MAX_OUTPUT.bytes,
			lines: 12,
		});
	});
});
