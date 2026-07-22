import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { discoverPromptWorkflows, registerPromptWorkflowCommands } from "../../src/slash/prompt-workflows.ts";
import type { SubagentParamsLike } from "../../src/runs/foreground/subagent-executor.ts";

const originalAgentDir = process.env.PI_CODING_AGENT_DIR;

function writePrompt(dir: string, name: string, content: string): void {
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(path.join(dir, `${name}.md`), content, "utf-8");
}

function sequentialStep(step: unknown): { agent: string; task?: string } {
	assert.ok(step && typeof step === "object" && "agent" in step && !("parallel" in step));
	return step as { agent: string; task?: string };
}

function makeCtx(cwd: string) {
	return {
		cwd,
		hasUI: true,
		ui: {
			notifications: [] as Array<{ message: string; level: string }>,
			notify(message: string, level: string) {
				this.notifications.push({ message, level });
			},
		},
	} as never;
}

describe("prompt workflows", () => {
	let tempDir = "";
	let agentDir = "";
	let cwd = "";

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-prompt-workflows-"));
		agentDir = path.join(tempDir, "agent");
		cwd = path.join(tempDir, "repo");
		fs.mkdirSync(cwd, { recursive: true });
		process.env.PI_CODING_AGENT_DIR = agentDir;
	});

	afterEach(() => {
		if (originalAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
		else process.env.PI_CODING_AGENT_DIR = originalAgentDir;
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("discovers project workflows over user workflows", () => {
		writePrompt(path.join(agentDir, "prompts"), "native-test", `---
description: User version
subagent: reviewer
---
User body
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-test", `---
description: Project version
subagent: worker
model: openai/gpt-5-mini
---
Project body $1
`);

		const workflow = discoverPromptWorkflows(cwd).find((entry) => entry.name === "native-test");

		assert.equal(workflow?.description, "Project version");
		assert.equal(workflow?.agent, "worker");
		assert.equal(workflow?.model, "openai/gpt-5-mini");
	});

	it("runs a named workflow through native subagent execution", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-run", `---
description: Run native prompt
subagent: reviewer
model: anthropic/claude-sonnet-4
skill: deslop,typescript-code
---
Review $1 with $ARGUMENTS
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const sent: unknown[] = [];
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: (message: unknown) => sent.push(message),
			} as never,
			run: async (params) => { runs.push(params); },
		});

		await commands.get("prompt-workflow")!.handler('native-run target --fork --worktree', makeCtx(cwd));

		assert.equal(sent.length, 0);
		assert.equal(runs.length, 1);
		assert.equal(runs[0]?.agent, "reviewer");
		assert.equal(runs[0]?.model, "anthropic/claude-sonnet-4");
		assert.deepEqual(runs[0]?.skill, ["deslop", "typescript-code"]);
		assert.equal(runs[0]?.context, "fork");
		assert.equal(runs[0]?.worktree, true);
		assert.equal(runs[0]?.task, "Review target with target");
	});

	it("runs prompt templates as a native chain", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
---
Fix from {previous}: $@
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: () => {},
			} as never,
			run: async (params) => { runs.push(params); },
		});

		await commands.get("chain-prompts")!.handler("native-analyze -> native-fix -- bug report --fork", makeCtx(cwd));

		assert.equal(runs.length, 1);
		assert.equal(runs[0]?.context, "fork");
		assert.equal(runs[0]?.chain?.length, 2);
		const firstStep = sequentialStep(runs[0]?.chain?.[0]);
		const secondStep = sequentialStep(runs[0]?.chain?.[1]);
		assert.equal(firstStep.agent, "scout");
		assert.equal(firstStep.task, "Analyze bug report");
		assert.equal(secondStep.agent, "worker");
		assert.equal(secondStep.task, "Fix from {previous}: bug report");

		await commands.get("chain-prompts")!.handler("native-analyze -> native-fix -- bug report --fresh", makeCtx(cwd));

		assert.equal(runs.length, 2);
		assert.equal(runs[1]?.context, "fresh");
		assert.equal(runs[1]?.chain?.length, 2);
		assert.equal(sequentialStep(runs[1]?.chain?.[0]).agent, "scout");
		assert.equal(sequentialStep(runs[1]?.chain?.[1]).agent, "worker");
	});

	it("allows literal option-like arguments after an end-of-options sentinel", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-echo", `---
description: Echo
subagent: reviewer
---
Args $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
---
Fix $@
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: () => {},
			} as never,
			run: async (params) => { runs.push(params); },
		});

		await commands.get("prompt-workflow")!.handler("native-echo --fork -- --worktree --subagent worker", makeCtx(cwd));
		await commands.get("chain-prompts")!.handler("native-analyze -> native-fix -- --fork -- --worktree --bg", makeCtx(cwd));

		assert.equal(runs.length, 2);
		assert.equal(runs[0]?.context, "fork");
		assert.equal(runs[0]?.worktree, undefined);
		assert.equal(runs[0]?.agent, "reviewer");
		assert.equal(runs[0]?.task, "Args --worktree --subagent worker");
		assert.equal(runs[1]?.context, "fork");
		assert.equal(runs[1]?.async, undefined);
		assert.equal(runs[1]?.chain?.length, 2);
		assert.equal(sequentialStep(runs[1]?.chain?.[0]).task, "Analyze --worktree --bg");
		assert.equal(sequentialStep(runs[1]?.chain?.[1]).task, "Fix --worktree --bg");
	});

	it("forwards chain-level worktree requests", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-flow", `---
description: Flow
chain: native-analyze -> native-fix
worktree: true
---
Ignored chain body
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
---
Fix from {previous}: $@
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: () => {},
			} as never,
			run: async (params) => { runs.push(params); },
		});

		await commands.get("prompt-workflow")!.handler("native-flow bug report", makeCtx(cwd));
		await commands.get("chain-prompts")!.handler("native-analyze -> native-fix -- bug report --worktree", makeCtx(cwd));

		assert.equal(runs.length, 2);
		assert.equal(runs[0]?.worktree, true);
		assert.equal(runs[1]?.worktree, true);
	});

	it("rejects chain step context and worktree frontmatter", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-flow", `---
description: Flow
chain: native-analyze -> native-fix
---
Ignored chain body
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
fresh: true
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
---
Fix $@
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: () => {},
			} as never,
			run: async (params) => { runs.push(params); },
		});
		const contextCtx = makeCtx(cwd) as unknown as { ui: { notifications: Array<{ message: string; level: string }> } };

		await commands.get("prompt-workflow")!.handler("native-flow bug report", contextCtx as never);

		assert.equal(runs.length, 0);
		assert.equal(contextCtx.ui.notifications[0]?.level, "error");
		assert.match(contextCtx.ui.notifications[0]?.message, /native-analyze.*chain step/);

		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
worktree: true
---
Fix $@
`);
		const worktreeCtx = makeCtx(cwd) as unknown as { ui: { notifications: Array<{ message: string; level: string }> } };

		await commands.get("chain-prompts")!.handler("native-analyze -> native-fix -- bug report", worktreeCtx as never);

		assert.equal(runs.length, 0);
		assert.equal(worktreeCtx.ui.notifications[0]?.level, "error");
		assert.match(worktreeCtx.ui.notifications[0]?.message, /native-fix.*chain step/);
	});

	it("propagates chain workflow frontmatter context", async () => {
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-flow", `---
description: Flow
chain: native-analyze -> native-fix
inheritContext: true
---
Ignored chain body
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-analyze", `---
description: Analyze
subagent: scout
---
Analyze $@
`);
		writePrompt(path.join(cwd, ".pi", "prompts"), "native-fix", `---
description: Fix
subagent: worker
---
Fix from {previous}: $@
`);
		const commands = new Map<string, { handler: (args: string, ctx: never) => Promise<void> }>();
		const runs: SubagentParamsLike[] = [];
		registerPromptWorkflowCommands({
			pi: {
				registerCommand: (name: string, command: { handler: (args: string, ctx: never) => Promise<void> }) => commands.set(name, command),
				sendMessage: () => {},
			} as never,
			run: async (params) => { runs.push(params); },
		});

		await commands.get("prompt-workflow")!.handler("native-flow bug report", makeCtx(cwd));

		assert.equal(runs.length, 1);
		assert.equal(runs[0]?.context, "fork");
		assert.equal(runs[0]?.chain?.length, 2);
		assert.equal(sequentialStep(runs[0]?.chain?.[0]).agent, "scout");
		assert.equal(sequentialStep(runs[0]?.chain?.[1]).agent, "worker");

		await commands.get("prompt-workflow")!.handler("native-flow bug report --fresh", makeCtx(cwd));

		assert.equal(runs.length, 2);
		assert.equal(runs[1]?.context, "fresh");
		assert.equal(runs[1]?.chain?.length, 2);
		assert.equal(sequentialStep(runs[1]?.chain?.[0]).agent, "scout");
		assert.equal(sequentialStep(runs[1]?.chain?.[1]).agent, "worker");
	});
});
