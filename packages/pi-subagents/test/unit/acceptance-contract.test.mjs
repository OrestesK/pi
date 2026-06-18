import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	acceptanceFailureMessage,
	acceptanceSelfReviewConfig,
	attachFinalizationToLedger,
	buildFinalizationProcessFailureLedger,
	createFinalizationProcessFailureTurn,
	createFinalizationTurn,
	evaluateAcceptance,
	formatAcceptanceFinalizationPrompt,
	formatAcceptancePrompt,
	parseAcceptanceReport,
	resolveEffectiveAcceptance,
	shouldRunAcceptanceFinalization,
	stripAcceptanceReport,
	validateAcceptanceInput,
} = await loadTs("../../src/runs/shared/acceptance.ts");

test("acceptance input rejects removed and unsupported public shapes", () => {
	assert.deepEqual(validateAcceptanceInput(undefined), []);
	assert.deepEqual(validateAcceptanceInput(false), [
		"acceptance must be an object. Public acceptance levels and false disables are no longer supported.",
	]);
	assert.deepEqual(validateAcceptanceInput({ level: "verified" }), [
		"acceptance.level is no longer supported; configure criteria, evidence, verify, and review directly.",
		"acceptance must include at least one of criteria, evidence, verify, review, or stopRules.",
	]);
	assert.deepEqual(validateAcceptanceInput({ criteria: [{ id: "done", must: "ship", evidence: ["nope"] }] }), [
		"acceptance.criteria[0].evidence[0] is not a supported evidence kind.",
	]);
	assert.deepEqual(validateAcceptanceInput({ review: {} }), [
		"acceptance.review.required must be false until automatic reviewer-result propagation is implemented.",
	]);
	assert.deepEqual(validateAcceptanceInput({ review: { required: false } }), []);
});

test("acceptance config resolves explicit contracts and self-review prompt", () => {
	const acceptance = resolveEffectiveAcceptance({
		agentName: "worker",
		task: "implement feature",
		explicit: {
			criteria: ["feature works", { id: "tests", must: "tests pass", evidence: ["commands-run"] }],
			evidence: ["changed-files", "commands-run"],
			verify: [{ id: "unit", command: "node --version", timeoutMs: 10_000 }],
			stopRules: ["do not change auth"],
			maxFinalizationTurns: 2,
		},
	});

	assert.equal(acceptance.level, "verified");
	assert.equal(acceptance.explicit, true);
	assert.equal(acceptance.finalization.mode, "self-review-loop");
	assert.equal(acceptance.finalization.maxTurns, 2);
	assert.deepEqual(acceptance.criteria.map((criterion) => criterion.id), ["criterion-1", "tests"]);
	assert.equal(shouldRunAcceptanceFinalization(acceptance), true);
	assert.equal(acceptanceSelfReviewConfig(acceptance).level, "checked");

	const prompt = formatAcceptancePrompt(acceptance);
	assert.match(prompt, /Acceptance Contract/);
	assert.match(prompt, /bounded self-review\/repair loop/);
	assert.match(prompt, /changed-files -> changedFiles/);
	assert.match(prompt, /```acceptance-report/);

	const asyncAcceptance = resolveEffectiveAcceptance({
		agentName: "worker",
		task: "implement feature",
		async: true,
		explicit: { criteria: ["feature works"] },
	});
	assert.equal(asyncAcceptance.finalization.mode, "none");
	assert.equal(shouldRunAcceptanceFinalization(asyncAcceptance), false);
	assert.doesNotMatch(formatAcceptancePrompt(asyncAcceptance), /bounded self-review\/repair loop/);
	assert.match(formatAcceptancePrompt(asyncAcceptance), /accepted or rejected from the final acceptance report/);
});

test("acceptance report parser extracts fenced JSON and strips it from visible output", () => {
	const output = [
		"Completed work.",
		"```acceptance-report",
		JSON.stringify({
			criteriaSatisfied: [{ id: "criterion-1", status: "satisfied", evidence: "unit test passed" }],
			changedFiles: ["src/example.ts"],
			commandsRun: [{ command: "npm test", result: "passed", summary: "ok" }],
			residualRisks: [],
		}),
		"```",
	].join("\n");

	const parsed = parseAcceptanceReport(output);
	assert.equal(parsed.error, undefined);
	assert.deepEqual(parsed.report?.changedFiles, ["src/example.ts"]);
	assert.equal(stripAcceptanceReport(output), "Completed work.");
});

test("acceptance evaluation rejects missing required evidence and passes verification commands", async () => {
	const acceptance = resolveEffectiveAcceptance({
		agentName: "worker",
		explicit: {
			criteria: [{ id: "tests", must: "tests pass", evidence: ["commands-run"] }],
			evidence: ["commands-run", "residual-risks"],
			verify: [{ id: "node", command: "node -e \"process.exit(0)\"", timeoutMs: 10_000 }],
		},
	});

	const missingEvidence = await evaluateAcceptance({
		acceptance,
		cwd: process.cwd(),
		output: "```acceptance-report\n{\"criteriaSatisfied\":[{\"id\":\"tests\",\"status\":\"satisfied\",\"evidence\":\"claimed\"}]}\n```",
	});
	assert.equal(missingEvidence.status, "rejected");
	assert.match(acceptanceFailureMessage(missingEvidence) ?? "", /commands-run evidence missing/);

	const passing = await evaluateAcceptance({
		acceptance,
		cwd: process.cwd(),
		output: "```acceptance-report\n{\"criteriaSatisfied\":[{\"id\":\"tests\",\"status\":\"satisfied\",\"evidence\":\"node command passed\"}],\"commandsRun\":[{\"command\":\"node -e\",\"result\":\"passed\",\"summary\":\"ok\"}],\"residualRisks\":[]}\n```",
	});
	assert.equal(passing.status, "verified");
	assert.equal(passing.verifyRuns[0]?.status, "passed");
});

test("acceptance no-staged-files evidence fails when git state cannot be verified", async () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-acceptance-nongit-"));
	try {
		const acceptance = resolveEffectiveAcceptance({
			agentName: "worker",
			explicit: { evidence: ["no-staged-files"] },
		});
		const ledger = await evaluateAcceptance({
			acceptance,
			cwd: tmp,
			output: "```acceptance-report\n{\"noStagedFiles\":true,\"residualRisks\":[]}\n```",
		});
		assert.equal(ledger.status, "rejected");
		assert.match(acceptanceFailureMessage(ledger) ?? "", /Unable to verify staged-file state/);
	} finally {
		fs.rmSync(tmp, { recursive: true, force: true });
	}
});

test("acceptance verify command output is bounded while streaming", async () => {
	const acceptance = resolveEffectiveAcceptance({
		agentName: "worker",
		explicit: {
			verify: [{ id: "noisy", command: "node -e \"process.stdout.write('x'.repeat(20000))\"", timeoutMs: 10_000 }],
		},
	});
	const ledger = await evaluateAcceptance({
		acceptance,
		cwd: process.cwd(),
		output: "```acceptance-report\n{\"manualNotes\":\"ok\"}\n```",
	});
	assert.equal(ledger.status, "verified");
	assert.match(ledger.verifyRuns[0]?.stdout ?? "", /\.\.\.\[truncated\]/);
	assert.ok((ledger.verifyRuns[0]?.stdout?.length ?? 0) < 12_100);
});

test("acceptance finalization helpers format prompts and attach ledgers", () => {
	const acceptance = resolveEffectiveAcceptance({
		agentName: "worker",
		explicit: { criteria: ["done"], evidence: ["manual-notes"], maxFinalizationTurns: 2 },
	});
	const initialLedger = {
		status: "rejected",
		explicit: true,
		effectiveAcceptance: acceptance,
		inferredReason: ["explicit acceptance contract"],
		criteria: acceptance.criteria,
		childReportParseError: "missing report",
		runtimeChecks: [{ id: "attestation", status: "failed", message: "missing" }],
		verifyRuns: [],
	};
	const prompt = formatAcceptanceFinalizationPrompt({
		acceptance,
		initialOutput: "visible output\n```acceptance-report\n{}\n```",
		initialLedger,
		turn: 1,
		maxTurns: 2,
		previousFailure: "missing report",
	});
	assert.match(prompt, /Acceptance Finalization/);
	assert.match(prompt, /manual-notes -> manualNotes/);
	assert.doesNotMatch(prompt, /```acceptance-report\n\{\}\n```/);

	const successfulTurn = createFinalizationTurn({
		turn: 1,
		prompt,
		rawOutput: "ok",
		ledger: { ...initialLedger, status: "checked", childReport: { manualNotes: "ok" }, childReportParseError: undefined, runtimeChecks: [], verifyRuns: [] },
	});
	const attached = attachFinalizationToLedger({
		initialLedger,
		authoritativeLedger: { ...initialLedger, status: "checked", runtimeChecks: [], verifyRuns: [] },
		turns: [successfulTurn],
		status: "completed",
		maxTurns: 2,
	});
	assert.equal(attached.finalization?.status, "completed");
	assert.equal(attached.finalization?.turns[0]?.status, "checked");

	const failedTurn = createFinalizationProcessFailureTurn({ turn: 1, prompt, rawOutput: "bad", message: "boom" });
	const failed = buildFinalizationProcessFailureLedger({ initialLedger, turns: [failedTurn], maxTurns: 2, message: "boom" });
	assert.equal(failed.status, "rejected");
	assert.match(failed.finalization?.turns[0]?.failureMessage ?? "", /boom/);
});
