import assert from "node:assert/strict";
import { test } from "node:test";
import {
	assistantFingerprint,
	detectDirectHumanQuestion,
	extractAssistantText,
	isAllowedGoalBlocker,
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

test("validates goal blocker reasons by documented blocker class", () => {
	const allowed = [
		"automatic command blocker denied mutating git push",
		"runtime tool guardrail blocked rm -rf",
		"tool call was rejected by automatic blocker",
		"missing required credential for the private API",
		"auth unavailable for Google Docs document",
		"required service is unavailable",
	];
	const disallowed = [
		"unapproved production/remote/external-account mutation",
		"sudo is required for a privileged local action",
		"destructive filesystem/data changes need confirmation",
		"unapproved read-only external-account access to Slack",
		"need approval for read-only cross-source discovery in Notion",
		"unapproved Google Docs mutation",
		"missing permission to access Google Docs document",
		"git add is required before continuing",
		"git checkout is required before continuing",
		"cross-source search is not approved",
		"Slack read is not approved",
		"Google Drive access is not approved",
		"remote production mutation is not approved",
		"material product/API/scope decision not implied by the goal",
		"waiting for internal plan approval",
		"routine local work remains",
		"tests still need to be run",
		"docs need updating",
		"formatting is pending",
		"routine implementation choices remain",
		"safe local/read-only/reversible next step is available",
		"Slack thread is noisy",
		"need AWS config review",
		"need database inspection",
		"material architecture decision not implied by the goal",
		"workflow decision not implied by the goal",
	];

	for (const reason of allowed)
		assert.equal(isAllowedGoalBlocker(reason), true);
	for (const reason of disallowed)
		assert.equal(isAllowedGoalBlocker(reason), false);
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
