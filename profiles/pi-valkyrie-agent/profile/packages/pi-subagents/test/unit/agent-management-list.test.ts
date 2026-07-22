import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { handleList } from "../../src/agents/agent-management.ts";

let tempHome = "";
let tempProject = "";
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const originalPiCodingAgentDir = process.env.PI_CODING_AGENT_DIR;

function writeJson(filePath: string, value: unknown): void {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
	fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function writeAgent(dir: string, name: string, description: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, `${name}.md`),
		`---\nname: ${name}\ndescription: ${description}\n---\nAgent prompt.\n`,
		"utf-8",
	);
}

function readText(result: ReturnType<typeof handleList>): string {
	const first = result.content[0];
	assert.ok(first);
	assert.equal(first.type, "text");
	assert.equal(typeof first.text, "string");
	return first.text;
}

function listText(agentScope: "both" | "user" | "project" = "both"): string {
	return readText(handleList({ action: "list", agentScope }, { cwd: tempProject, modelRegistry: { getAvailable: () => [] } } as never));
}

function countLines(text: string, pattern: RegExp): number {
	return text.split("\n").filter((line) => pattern.test(line)).length;
}

describe("agent management list", () => {
	beforeEach(() => {
		tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-list-home-"));
		tempProject = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-list-project-"));
		fs.mkdirSync(path.join(tempProject, ".pi"), { recursive: true });
		process.env.HOME = tempHome;
		process.env.USERPROFILE = tempHome;
		process.env.PI_CODING_AGENT_DIR = path.join(tempHome, ".pi", "agent");
	});

	afterEach(() => {
		if (originalHome === undefined) delete process.env.HOME;
		else process.env.HOME = originalHome;
		if (originalUserProfile === undefined) delete process.env.USERPROFILE;
		else process.env.USERPROFILE = originalUserProfile;
		if (originalPiCodingAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalPiCodingAgentDir;
		fs.rmSync(tempHome, { recursive: true, force: true });
		fs.rmSync(tempProject, { recursive: true, force: true });
	});

	it("prints concise effective routing guidance", () => {
		writeAgent(path.join(tempHome, ".agents"), "general-purpose", "Flexible custom tasks");

		const text = listText();

		assert.match(text, /Agents \(effective; default context: fresh\):/);
		assert.match(text, /- scout — Use for fast read-only codebase recon/);
		assert.match(text, /- reviewer — Use for read-only review/);
		assert.match(text, /- worker \(fork\) — Use for straightforward, bounded, approved implementation/);
		assert.match(text, /- general-purpose — Use when this custom agent fits: Flexible custom tasks/);
		assert.doesNotMatch(text, /^- .*\((?:builtin|user|project)(?:, context: [^)]+)?\):/m);
		assert.equal(countLines(text, /^- reviewer\b/), 1);
		assert.equal(countLines(text, /^- scout\b/), 1);
		assert.equal(countLines(text, /^- worker\b/), 1);

		assert.match(text, /Context:/);
		assert.match(text, /fresh = independent child session, not the parent conversation history/);
		assert.match(text, /fork = inherits the parent conversation context/);

		assert.match(text, /Tool access:/);
		assert.match(text, /Tools are agent-specific, not inherited from the parent/);
		assert.match(text, /use worker for writes/);
		assert.match(text, /configured non-advisory agent when MCP, direct MCP, or custom-extension tools are explicitly required/);

		assert.match(text, /Builtin workflows \(deprecated compatibility; prefer prompt shortcuts or explicit tasks\/chain\):/);
		assert.match(text, /builtin\.quality-gate/);
		assert.match(text, /builtin\.research-decision/);
		assert.match(text, /builtin\.generate-filter/);
		assert.doesNotMatch(text, /live-steering-team/);
		assert.equal(countLines(text, /^- builtin\./), 3);

		assert.match(text, /Route selection:/);
		assert.match(text, /Recon\/planning: scout or context-builder -> planner/);
		assert.match(text, /Straightforward approved implementation: worker, then reviewer\/quality-gate/);

		assert.match(text, /Execution:/);
		assert.match(text, /SINGLE/);
		assert.match(text, /PARALLEL/);
		assert.match(text, /CHAIN/);
		assert.match(text, /WORKFLOW: deprecated compatibility alias/);
		assert.match(text, /Details\/provenance\/tools/);
		assert.match(text, /Saved chains \(\.chain\.md\):/);
		assert.doesNotMatch(text, /Proactive skill subagent suggestions/);
	});

	it("lists configured tool-extension bundles", () => {
		const text = readText(
			handleList({ action: "list" }, {
				cwd: tempProject,
				modelRegistry: { getAvailable: () => [] },
				config: {
					toolExtensions: {
						mcp: {
							description: "Regular MCP access",
							builtinTools: ["mcp"],
							allowedAgents: ["researcher"],
						},
					},
				},
			} as never),
		);

		assert.match(text, /Tool extensions:/);
		assert.match(text, /- mcp \(researcher\): Regular MCP access/);
	});

	it("uses runtime effective discovery for scope filtering and disabled agents", () => {
		writeAgent(path.join(tempHome, ".agents"), "user-only", "User-only helper");
		writeAgent(path.join(tempProject, ".pi", "agents"), "project-only", "Project-only helper");
		writeJson(path.join(tempHome, ".pi", "agent", "settings.json"), {
			subagents: {
				agentOverrides: {
					reviewer: { disabled: true },
				},
			},
		});

		const both = listText("both");
		assert.doesNotMatch(both, /^- reviewer\b/m);
		assert.match(both, /^- user-only — Use when this custom agent fits: User-only helper$/m);
		assert.match(both, /^- project-only — Use when this custom agent fits: Project-only helper$/m);

		const user = listText("user");
		assert.match(user, /^- user-only — Use when this custom agent fits: User-only helper$/m);
		assert.doesNotMatch(user, /^- project-only\b/m);

		const project = listText("project");
		assert.doesNotMatch(project, /^- user-only\b/m);
		assert.match(project, /^- project-only — Use when this custom agent fits: Project-only helper$/m);
	});
});
