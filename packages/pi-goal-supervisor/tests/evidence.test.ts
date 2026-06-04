import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assistantFingerprint,
	detectDirectHumanQuestion,
	extractAssistantText,
	parseGoalMarkers,
} from "../src/evidence.ts";

test("extracts assistant text from string and text content blocks", () => {
	assert.equal(
		extractAssistantText({ role: "assistant", content: "hello" }),
		"hello",
	);
	assert.equal(
		extractAssistantText({
			role: "assistant",
			content: [
				{ type: "text", text: "first" },
				{ type: "toolCall", name: "read" },
				{ type: "text", text: "second" },
			],
		}),
		"first\nsecond",
	);
});

test("parses final goal done and blocked markers", () => {
	assert.deepEqual(parseGoalMarkers("work\nGOAL_DONE: tests passed"), {
		done: "tests passed",
		blocked: undefined,
	});
	assert.deepEqual(parseGoalMarkers("GOAL_BLOCKED: missing credentials"), {
		done: undefined,
		blocked: "missing credentials",
	});
});

test("rejects marker-looking quoted text when marker is not line-leading claim", () => {
	assert.deepEqual(
		parseGoalMarkers("The docs say `GOAL_DONE: ok` but not yet."),
		{
			done: undefined,
			blocked: undefined,
		},
	);
});

test("detects direct human decision questions conservatively", () => {
	assert.equal(
		detectDirectHumanQuestion("Should I delete the database?"),
		true,
	);
	assert.equal(
		detectDirectHumanQuestion("Next I will inspect the database status."),
		false,
	);
});

test("fingerprint is stable for whitespace and case", () => {
	assert.equal(
		assistantFingerprint("Same   Text\n"),
		assistantFingerprint("same text"),
	);
});
