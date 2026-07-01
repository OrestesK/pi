import test from "node:test";
import assert from "node:assert/strict";

import { loadTs } from "../support/load-ts.mjs";

const {
	buildPiArgs,
	SUBAGENT_TEAM_AGENT_NAME_ENV,
	SUBAGENT_TEAM_ROLE_ENV,
	SUBAGENT_TEAM_RUN_DIR_ENV,
} = await loadTs("../../src/runs/shared/pi-args.ts");
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

test("buildPiArgs includes live steering team tools in explicit tool allowlist", () => {
	const worker = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "run with steering",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		tools: ["read"],
		team: {
			runDir: "/tmp/team-run",
			agentName: "worker-0",
			role: "worker",
		},
	});
	const workerToolsIndex = worker.args.indexOf("--tools");
	assert.notEqual(workerToolsIndex, -1);
	assert.equal(worker.args[workerToolsIndex + 1], "read,team_send_message,team_read_messages,team_ack_message");

	const reviewer = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "run with steering",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		tools: ["read"],
		team: {
			runDir: "/tmp/team-run",
			agentName: "reviewer-1",
			role: "reviewer",
		},
	});
	const reviewerToolsIndex = reviewer.args.indexOf("--tools");
	assert.notEqual(reviewerToolsIndex, -1);
	assert.equal(reviewer.args[reviewerToolsIndex + 1], "read,team_send_message,team_read_messages,team_ack_message,team_decide");
});

test("buildPiArgs keeps default extensions when extensions are omitted", () => {
	const { args } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "research with web tools",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		tools: ["read", "web_search"],
	});

	const toolsIndex = args.indexOf("--tools");
	assert.notEqual(toolsIndex, -1);
	assert.equal(args[toolsIndex + 1], "read,web_search");
	assert.equal(args.includes("--no-extensions"), false);
});

test("buildPiArgs disables normal extensions when extensions are explicitly empty", () => {
	const { args } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "inspect locally",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		tools: ["read"],
		extensions: [],
	});

	assert.equal(args.includes("--no-extensions"), true);
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

test("buildPiArgs forwards live steering team env to child", () => {
	const { env } = buildPiArgs({
		baseArgs: ["--mode", "json", "-p"],
		task: "run with steering",
		sessionEnabled: false,
		inheritProjectContext: true,
		inheritSkills: true,
		team: {
			runDir: "/tmp/team-run",
			agentName: "worker-0",
			role: "worker",
		},
	});

	assert.equal(env[SUBAGENT_TEAM_RUN_DIR_ENV], "/tmp/team-run");
	assert.equal(env[SUBAGENT_TEAM_AGENT_NAME_ENV], "worker-0");
	assert.equal(env[SUBAGENT_TEAM_ROLE_ENV], "worker");
});
