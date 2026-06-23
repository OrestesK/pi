import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const {
	STRUCTURED_OUTPUT_CAPTURE_ENV,
	STRUCTURED_OUTPUT_SCHEMA_ENV,
} = await loadTs("../../src/runs/shared/structured-output.ts");

const TEAM_ENV_NAMES = [
	"PI_SUBAGENT_TEAM_RUN_DIR",
	"PI_SUBAGENT_TEAM_AGENT_NAME",
	"PI_SUBAGENT_TEAM_ROLE",
];

async function withStructuredOutputEnv(fn) {
	const previousCapture = process.env[STRUCTURED_OUTPUT_CAPTURE_ENV];
	const previousSchema = process.env[STRUCTURED_OUTPUT_SCHEMA_ENV];
	try {
		await fn();
	} finally {
		if (previousCapture === undefined) delete process.env[STRUCTURED_OUTPUT_CAPTURE_ENV];
		else process.env[STRUCTURED_OUTPUT_CAPTURE_ENV] = previousCapture;
		if (previousSchema === undefined) delete process.env[STRUCTURED_OUTPUT_SCHEMA_ENV];
		else process.env[STRUCTURED_OUTPUT_SCHEMA_ENV] = previousSchema;
	}
}

async function withTeamEnv(values, fn) {
	const previous = new Map(TEAM_ENV_NAMES.map((name) => [name, process.env[name]]));
	try {
		for (const name of TEAM_ENV_NAMES) delete process.env[name];
		for (const [name, value] of Object.entries(values)) process.env[name] = value;
		await fn();
	} finally {
		for (const name of TEAM_ENV_NAMES) {
			const value = previous.get(name);
			if (value === undefined) delete process.env[name];
			else process.env[name] = value;
		}
	}
}

test("prompt runtime registers structured_output tool when structured output env is present", async () => {
	await withStructuredOutputEnv(async () => {
		const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-runtime-"));
		try {
			const schemaPath = path.join(tmp, "schema.json");
			const outputPath = path.join(tmp, "output.json");
			fs.writeFileSync(schemaPath, JSON.stringify({
				type: "object",
				additionalProperties: false,
				required: ["ok"],
				properties: { ok: { type: "boolean" } },
			}));
			process.env[STRUCTURED_OUTPUT_SCHEMA_ENV] = schemaPath;
			process.env[STRUCTURED_OUTPUT_CAPTURE_ENV] = outputPath;

			let registeredTool;
			const handlers = new Map();
			const { default: registerSubagentPromptRuntime } = await loadTs("../../src/runs/shared/subagent-prompt-runtime.ts");
			registerSubagentPromptRuntime({
				registerTool(tool) {
					registeredTool = tool;
				},
				on(event, handler) {
					handlers.set(event, handler);
				},
			});

			assert.equal(registeredTool?.name, "structured_output");
			assert.deepEqual(registeredTool?.parameters?.required, ["value"]);
			await assert.rejects(
				() => registeredTool.execute("call-1", { value: { ok: "yes" } }),
				/Structured output validation failed/,
			);
			const result = await registeredTool.execute("call-2", { value: { ok: true } });
			assert.equal(result.terminate, true);
			assert.deepEqual(JSON.parse(fs.readFileSync(outputPath, "utf-8")), { ok: true });
			assert.equal(typeof handlers.get("context"), "function");
			assert.equal(typeof handlers.get("before_agent_start"), "function");
		} finally {
			fs.rmSync(tmp, { recursive: true, force: true });
		}
	});
});

test("prompt runtime registers live steering team tools only when team env is present", async () => {
	const { default: registerSubagentPromptRuntime } = await loadTs("../../src/runs/shared/subagent-prompt-runtime.ts");

	await withTeamEnv({}, async () => {
		const tools = [];
		registerSubagentPromptRuntime({
			registerTool(tool) {
				tools.push(tool.name);
			},
			on() {},
		});
		assert.equal(tools.includes("team_send_message"), false);
		assert.equal(tools.includes("team_read_messages"), false);
		assert.equal(tools.includes("team_ack_message"), false);
		assert.equal(tools.includes("team_decide"), false);
	});

	await withTeamEnv({
		PI_SUBAGENT_TEAM_RUN_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-runtime-")),
		PI_SUBAGENT_TEAM_AGENT_NAME: "worker-0",
		PI_SUBAGENT_TEAM_ROLE: "worker",
	}, async () => {
		const tools = [];
		registerSubagentPromptRuntime({
			registerTool(tool) {
				tools.push(tool.name);
			},
			on() {},
		});
		assert.deepEqual(tools.filter((name) => name.startsWith("team_")), [
			"team_send_message",
			"team_read_messages",
			"team_ack_message",
		]);
	});

	await withTeamEnv({
		PI_SUBAGENT_TEAM_RUN_DIR: fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-runtime-")),
		PI_SUBAGENT_TEAM_AGENT_NAME: "reviewer-1",
		PI_SUBAGENT_TEAM_ROLE: "reviewer",
	}, async () => {
		const tools = [];
		registerSubagentPromptRuntime({
			registerTool(tool) {
				tools.push(tool.name);
			},
			on() {},
		});
		assert.deepEqual(tools.filter((name) => name.startsWith("team_")), [
			"team_send_message",
			"team_read_messages",
			"team_ack_message",
			"team_decide",
		]);
	});
});

test("team_decide records reviewer pulses and sends steering messages", async () => {
	const { default: registerSubagentPromptRuntime } = await loadTs("../../src/runs/shared/subagent-prompt-runtime.ts");
	const { listTeamDecisions } = await loadTs("../../src/shared/team-decisions.ts");
	const { listTeamMessages } = await loadTs("../../src/shared/team-mailbox.ts");
	const teamRunDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-team-runtime-"));

	await withTeamEnv({
		PI_SUBAGENT_TEAM_RUN_DIR: teamRunDir,
		PI_SUBAGENT_TEAM_AGENT_NAME: "reviewer-1",
		PI_SUBAGENT_TEAM_ROLE: "reviewer",
	}, async () => {
		const tools = new Map();
		registerSubagentPromptRuntime({
			registerTool(tool) {
				tools.set(tool.name, tool);
			},
			on() {},
		});
		const result = await tools.get("team_decide").execute("call-1", {
			action: "steer",
			reason: "Current direction is unsafe",
			to: "worker-0",
			message: "Switch to a safe scratch-only implementation now",
			urgent: true,
		});

		assert.match(result.content[0].text, /Team decision recorded: steer/);
		const decisions = await listTeamDecisions(teamRunDir);
		assert.equal(decisions.length, 1);
		assert.equal(decisions[0].action, "steer");
		assert.equal(decisions[0].messageId, (await listTeamMessages(teamRunDir, "worker-0"))[0].id);
	});
});
