import assert from "node:assert/strict";
import { test } from "node:test";
import {
	applyJudgeResult,
	deterministicPrecheck,
	parseJudgeResponse,
} from "../src/judge.ts";
import { createInitialState, reduceState } from "../src/state.ts";

test("parses approved strict judge JSON", () => {
	const result = parseJudgeResponse(
		'{"verdict":"approved","score":9,"reason":"verified","missingEvidence":[]}',
	);

	assert.equal(result.verdict, "approved");
	assert.equal(result.score, 9);
});

test("malformed judge output is inconclusive and fail-closed", () => {
	const result = parseJudgeResponse("not json");

	assert.equal(result.verdict, "inconclusive");
	assert.match(result.reason, /malformed/i);
});

test("deterministic precheck rejects empty evidence and final questions", () => {
	assert.equal(deterministicPrecheck("done", "").verdict, "rejected");
	assert.equal(
		deterministicPrecheck("Should I continue?", "tests passed").verdict,
		"rejected",
	);
});

test("approved judge completes and rejected judge resumes", () => {
	const base = createInitialState({
		objective: "finish",
		cwd: "/tmp/project",
		now: "2026-06-03T00:00:00.000Z",
	});
	const judging = reduceState(base, {
		type: "done_claimed",
		evidence: "tests passed",
		source: "command",
		now: "2026-06-03T00:01:00.000Z",
	});

	const complete = applyJudgeResult(judging, {
		verdict: "approved",
		score: 9,
		reason: "verified",
		missingEvidence: [],
		at: "2026-06-03T00:02:00.000Z",
	});
	const resumed = applyJudgeResult(judging, {
		verdict: "rejected",
		score: 4,
		reason: "missing tests",
		missingEvidence: ["test output"],
		at: "2026-06-03T00:02:00.000Z",
	});

	assert.equal(complete.status, "complete");
	assert.equal(resumed.status, "running");
	assert.equal(resumed.lastJudge?.reason, "missing tests");
});
