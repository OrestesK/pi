import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import memoryMdExtension from "../index.js";
import {
	listMemoryFilesAsync,
	MEMORY_CONTEXT_FILE_LIMIT_PER_SCOPE,
	type MemoryFrontmatter,
	readMemoryFileAsync,
	writeMemoryFile,
} from "../memory-core.js";

type MockContext = {
	cwd: string;
	ui: {
		notify(message: string, level?: string): void;
	};
};

type Handler = (event: Record<string, unknown>, ctx: MockContext) => unknown;

type ToolResult = {
	content?: Array<{ type: string; text: string }>;
	details?: Record<string, unknown>;
};

type Tool = {
	name: string;
	execute(
		toolCallId: string,
		params: Record<string, unknown>,
		signal: AbortSignal | undefined,
		onUpdate: unknown,
		ctx: MockContext,
	): Promise<ToolResult>;
};

type Command = {
	handler(args: string[], ctx: MockContext): unknown;
};

type Harness = {
	handlers: Map<string, Handler>;
	tools: Map<string, Tool>;
	commands: Map<string, Command>;
	notifications: string[];
};

async function withGlobalOnlyMemory(
	fn: (paths: { root: string; agentDir: string; cwd: string }) => Promise<void>,
	options: {
		delivery?: "message-append" | "system-prompt";
		projectFiles?: Array<{ relativePath: string; tag: string }>;
	} = {},
): Promise<void> {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-md-test-"));
	const previousAgentDir = process.env.PI_CODING_AGENT_DIR;

	try {
		const agentDir = path.join(root, "agent");
		const memoryRoot = path.join(root, "memory");
		const globalCore = path.join(memoryRoot, "common", "core");
		const cwd = path.join(root, "project-without-memory");
		const projectMemoryDir = path.join(memoryRoot, path.basename(cwd));

		await mkdir(agentDir, { recursive: true });
		await mkdir(globalCore, { recursive: true });
		await mkdir(cwd, { recursive: true });
		await writeFile(
			path.join(agentDir, "settings.json"),
			JSON.stringify({
				"pi-memory-md": {
					enabled: true,
					memoryDir: {
						localPath: memoryRoot,
						globalMemory: "common",
					},
					delivery: options.delivery ?? "system-prompt",
					tape: { enabled: false },
				},
			}),
		);
		await writeFile(
			path.join(globalCore, "USER.md"),
			[
				"---",
				"description: Shared test memory",
				"tags:",
				"  - test-global-memory",
				"---",
				"",
				"# Shared Test Memory",
				"",
				"Global-only memory content.",
			].join("\n"),
		);
		for (const projectFile of options.projectFiles ?? []) {
			const fullPath = path.join(projectMemoryDir, projectFile.relativePath);
			await mkdir(path.dirname(fullPath), { recursive: true });
			await writeFile(
				fullPath,
				[
					"---",
					"description: Project test memory",
					"tags:",
					`  - ${projectFile.tag}`,
					"---",
					"",
					"# Project Test Memory",
					"",
					"Project memory content outside core.",
				].join("\n"),
			);
		}

		process.env.PI_CODING_AGENT_DIR = agentDir;
		await fn({ root, agentDir, cwd });
	} finally {
		if (previousAgentDir === undefined) {
			delete process.env.PI_CODING_AGENT_DIR;
		} else {
			process.env.PI_CODING_AGENT_DIR = previousAgentDir;
		}
		await rm(root, { recursive: true, force: true });
	}
}

function createHarness(): Harness {
	const handlers = new Map<string, Handler>();
	const tools = new Map<string, Tool>();
	const commands = new Map<string, Command>();
	const notifications: string[] = [];
	const pi = {
		on(name: string, handler: Handler) {
			handlers.set(name, handler);
		},
		registerTool(tool: Tool) {
			tools.set(tool.name, tool);
		},
		registerCommand(name: string, command: Command) {
			commands.set(name, command);
		},
		addMessage() {},
		exec: async (command: string, args: string[]) => {
			const result = spawnSync(command, args, { encoding: "utf-8" });
			if (result.status !== 0) {
				throw new Error(result.stderr || result.stdout || `${command} failed`);
			}

			return {
				stdout: result.stdout ?? "",
				stderr: result.stderr ?? "",
				exitCode: result.status ?? 0,
			};
		},
	} as unknown as ExtensionAPI;

	memoryMdExtension(pi);
	return { handlers, tools, commands, notifications };
}

function createContext(cwd: string, notifications: string[]): MockContext {
	return {
		cwd,
		ui: {
			notify(message: string, level = "info") {
				notifications.push(`${level}: ${message}`);
			},
		},
	};
}

test("global memory is delivered without a project memory directory", async () => {
	await withGlobalOnlyMemory(async ({ cwd }) => {
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
		const result = (await harness.handlers.get("before_agent_start")?.(
			{ prompt: "hello", systemPrompt: "BASE" },
			ctx,
		)) as { systemPrompt?: string } | undefined;

		assert.match(result?.systemPrompt ?? "", /Shared Global Memory/);
		assert.match(result?.systemPrompt ?? "", /test-global-memory/);
		assert.ok(
			harness.notifications.some((message) =>
				message.includes("Memory delivered: 1 files"),
			),
		);
	});
});

test("global memory delivery supports message append mode", async () => {
	await withGlobalOnlyMemory(
		async ({ cwd }) => {
			const harness = createHarness();
			const ctx = createContext(cwd, harness.notifications);

			await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
			const result = (await harness.handlers.get("before_agent_start")?.(
				{ prompt: "hello", systemPrompt: "BASE" },
				ctx,
			)) as { message?: { customType?: string; content?: string } } | undefined;

			assert.equal(result?.message?.customType, "pi-memory-md");
			assert.match(result?.message?.content ?? "", /Shared Global Memory/);
			assert.match(result?.message?.content ?? "", /test-global-memory/);
		},
		{ delivery: "message-append" },
	);
});

test("message append memory is delivered again after compaction", async () => {
	await withGlobalOnlyMemory(
		async ({ root, cwd }) => {
			const harness = createHarness();
			const ctx = createContext(cwd, harness.notifications);

			await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
			const initialResult = (await harness.handlers.get("before_agent_start")?.(
				{ prompt: "hello", systemPrompt: "BASE" },
				ctx,
			)) as { message?: { customType?: string; content?: string } } | undefined;
			assert.match(initialResult?.message?.content ?? "", /test-global-memory/);

			const secondResult = await harness.handlers.get("before_agent_start")?.(
				{ prompt: "again", systemPrompt: "BASE" },
				ctx,
			);
			assert.equal(secondResult, undefined);

			await writeFile(
				path.join(root, "memory", "common", "core", "AFTER_COMPACT.md"),
				[
					"---",
					"description: Memory added after initial delivery",
					"tags:",
					"  - after-compaction-memory",
					"---",
					"",
					"# After Compaction Memory",
				].join("\n"),
			);

			await harness.handlers.get("session_compact")?.(
				{
					compactionEntry: {
						summary: "compacted",
						firstKeptEntryId: "entry-1",
						tokensBefore: 1000,
					},
					fromExtension: false,
				},
				ctx,
			);

			const afterCompactResult = (await harness.handlers.get(
				"before_agent_start",
			)?.({ prompt: "after compact", systemPrompt: "BASE" }, ctx)) as
				| { message?: { customType?: string; content?: string } }
				| undefined;

			assert.equal(afterCompactResult?.message?.customType, "pi-memory-md");
			assert.match(
				afterCompactResult?.message?.content ?? "",
				/after-compaction-memory/,
			);
		},
		{ delivery: "message-append" },
	);
});

test("startup delivery hides superseded memories", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		await writeFile(
			path.join(root, "memory", "common", "core", "OLD.md"),
			[
				"---",
				"description: Old superseded memory",
				"status: superseded",
				"tags:",
				"  - old-superseded-memory",
				"---",
				"",
				"# Old Memory",
			].join("\n"),
		);
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
		const result = (await harness.handlers.get("before_agent_start")?.(
			{ prompt: "hello", systemPrompt: "BASE" },
			ctx,
		)) as { systemPrompt?: string } | undefined;

		assert.match(result?.systemPrompt ?? "", /test-global-memory/);
		assert.doesNotMatch(result?.systemPrompt ?? "", /old-superseded-memory/);
		assert.ok(
			harness.notifications.some((message) =>
				message.includes("Memory delivered: 1 files"),
			),
		);
	});
});

test("startup delivery ranks high-priority and project-relevant memory first", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		const relevantDir = path.join(
			root,
			"memory",
			"common",
			"core",
			"project",
			path.basename(cwd),
		);
		const otherDir = path.join(
			root,
			"memory",
			"common",
			"core",
			"project",
			"unrelated",
		);
		writeMemoryFile(path.join(otherDir, "old-low.md"), "# Old Low\n", {
			description: "old low priority unrelated memory",
			tags: ["old-low"],
			load_priority: "low",
			updated: "2026-01-01",
		});
		writeMemoryFile(
			path.join(relevantDir, "current-high.md"),
			"# Current High\n",
			{
				description: "current high priority project relevant memory",
				tags: ["current-high"],
				status: "current",
				load_priority: "high",
				updated: "2026-07-01",
			},
		);
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
		const result = (await harness.handlers.get("before_agent_start")?.(
			{ prompt: "hello", systemPrompt: "BASE" },
			ctx,
		)) as { systemPrompt?: string } | undefined;
		const text = result?.systemPrompt ?? "";

		assert.ok(text.indexOf("current-high") < text.indexOf("old-low"));
	});
});

test("startup delivery treats non-string ranking metadata as absent", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		const memoryDir = path.join(root, "memory", "common", "core");
		await writeFile(
			path.join(memoryDir, "bad-priority.md"),
			[
				"---",
				"description: Bad priority memory",
				"load_priority:",
				"  bad: true",
				"tags:",
				"  - bad-priority",
				"---",
				"",
				"# Bad Priority",
			].join("\n"),
		);
		writeMemoryFile(path.join(memoryDir, "good.md"), "# Good\n", {
			description: "Good memory",
			tags: ["good"],
			load_priority: "high",
		});
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
		const result = (await harness.handlers.get("before_agent_start")?.(
			{ prompt: "hello", systemPrompt: "BASE" },
			ctx,
		)) as { systemPrompt?: string } | undefined;
		const text = result?.systemPrompt ?? "";

		assert.match(text, /Good memory/);
		assert.match(text, /Bad priority memory/);
	});
});

test("startup delivery trims per scope while memory_search still finds omitted files", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		const bulkDir = path.join(
			root,
			"memory",
			"common",
			"core",
			"project",
			"bulk",
		);
		for (
			let index = 0;
			index < MEMORY_CONTEXT_FILE_LIMIT_PER_SCOPE + 1;
			index++
		) {
			const suffix = String(index).padStart(2, "0");
			writeMemoryFile(
				path.join(bulkDir, `${suffix}-bulk.md`),
				`# Bulk ${suffix}\n\n${suffix === String(MEMORY_CONTEXT_FILE_LIMIT_PER_SCOPE).padStart(2, "0") ? "trimmed unique needle" : "ordinary memory"}`,
				{
					description: `bulk memory ${suffix}`,
					tags: [
						suffix ===
						String(MEMORY_CONTEXT_FILE_LIMIT_PER_SCOPE).padStart(2, "0")
							? "trimmed-unique-needle"
							: `bulk-${suffix}`,
					],
					updated: "2026-01-01",
				},
			);
		}
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
		const result = (await harness.handlers.get("before_agent_start")?.(
			{ prompt: "hello", systemPrompt: "BASE" },
			ctx,
		)) as { systemPrompt?: string } | undefined;
		const text = result?.systemPrompt ?? "";

		assert.doesNotMatch(text, /trimmed-unique-needle/);
		assert.match(
			text,
			/more Shared Global Memory files available via memory_search or memory_list/,
		);

		const searchResult = await harness.tools
			.get("memory_search")
			?.execute(
				"test-call",
				{ query: "trimmed-unique-needle" },
				undefined,
				undefined,
				ctx,
			);
		assert.equal(searchResult?.details?.count, 1);
		assert.match(
			searchResult?.content?.[0]?.text ?? "",
			/trimmed-unique-needle/,
		);
	});
});

test("memory_list hides superseded memories but memory_search can find them", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		await writeFile(
			path.join(root, "memory", "common", "core", "OLD.md"),
			[
				"---",
				"description: Old superseded memory",
				"status: superseded",
				"tags:",
				"  - old-superseded-memory",
				"---",
				"",
				"# Old Memory",
			].join("\n"),
		);
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		const listResult = await harness.tools
			.get("memory_list")
			?.execute("test-call", {}, undefined, undefined, ctx);
		assert.equal(listResult?.details?.count, 1);
		assert.doesNotMatch(listResult?.content?.[0]?.text ?? "", /OLD\.md/);

		const searchResult = await harness.tools
			.get("memory_search")
			?.execute(
				"test-call",
				{ query: "old-superseded-memory" },
				undefined,
				undefined,
				ctx,
			);
		assert.equal(searchResult?.details?.count, 1);
		assert.match(searchResult?.content?.[0]?.text ?? "", /OLD\.md/);
	});
});

test("listMemoryFilesAsync returns deterministic sorted paths", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-md-test-"));

	try {
		await mkdir(path.join(root, "z"), { recursive: true });
		await mkdir(path.join(root, "a"), { recursive: true });
		await writeFile(path.join(root, "z", "b.md"), "---\ndescription: B\n---\n");
		await writeFile(path.join(root, "a", "c.md"), "---\ndescription: C\n---\n");
		await writeFile(path.join(root, "a", "a.md"), "---\ndescription: A\n---\n");

		const files = (await listMemoryFilesAsync(root)).map((filePath) =>
			path.relative(root, filePath),
		);

		assert.deepEqual(files, ["a/a.md", "a/c.md", "z/b.md"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("project memory outside core is delivered and searchable", async () => {
	await withGlobalOnlyMemory(
		async ({ cwd }) => {
			const harness = createHarness();
			const ctx = createContext(cwd, harness.notifications);

			await harness.handlers.get("session_start")?.({ reason: "new" }, ctx);
			const result = (await harness.handlers.get("before_agent_start")?.(
				{ prompt: "hello", systemPrompt: "BASE" },
				ctx,
			)) as { systemPrompt?: string } | undefined;
			assert.match(result?.systemPrompt ?? "", /Project Memory/);
			assert.match(result?.systemPrompt ?? "", /test-project-notes/);

			const searchResult = await harness.tools
				.get("memory_search")
				?.execute(
					"test-call",
					{ query: "test-project-notes" },
					undefined,
					undefined,
					ctx,
				);
			assert.equal(searchResult?.details?.count, 1);
			assert.match(searchResult?.content?.[0]?.text ?? "", /Project/);
		},
		{
			projectFiles: [
				{ relativePath: "notes/PROJECT.md", tag: "test-project-notes" },
			],
		},
	);
});

test("memory_search query finds JSON frontmatter written by memory_write", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		const projectMemoryDir = path.join(
			root,
			"memory",
			path.basename(cwd),
			"core",
			"project",
		);
		writeMemoryFile(
			path.join(projectMemoryDir, "goal-supervisor-compaction-latch.md"),
			[
				"# pi-goal-supervisor compaction pendingContinuation latch",
				"",
				"## Root cause",
				"The stale pendingContinuation latch blocked compact continuation.",
			].join("\n"),
			{
				description:
					"pi-goal-supervisor compaction stale pendingContinuation latch root cause and fix",
				tags: [
					"pi-goal-supervisor",
					"goal",
					"compaction",
					"pendingContinuation",
					"category-root-cause",
					"status-resolved",
				],
			},
		);
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		const searchResult = await harness.tools
			.get("memory_search")
			?.execute(
				"test-call",
				{ query: "status-resolved" },
				undefined,
				undefined,
				ctx,
			);

		assert.equal(searchResult?.details?.count, 1);
		assert.match(
			searchResult?.content?.[0]?.text ?? "",
			/goal-supervisor-compaction-latch\.md/,
		);
		assert.match(searchResult?.content?.[0]?.text ?? "", /tags:/);
	});
});

test("memory_search query tokenizes multi-word searches across path and headings", async () => {
	await withGlobalOnlyMemory(async ({ root, cwd }) => {
		const projectMemoryDir = path.join(
			root,
			"memory",
			path.basename(cwd),
			"core",
			"project",
		);
		writeMemoryFile(
			path.join(projectMemoryDir, "goal-crafter-user-preferences.md"),
			[
				"# Goal-crafter user preferences",
				"",
				"## Core preferences",
				"Keep stable workflow preferences searchable.",
			].join("\n"),
			{
				description:
					"Pi goal-crafter durable user workflow preferences extracted from session-history mining",
				tags: ["goal-crafter", "goals", "user-preferences"],
			},
		);
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		const searchResult = await harness.tools
			.get("memory_search")
			?.execute(
				"test-call",
				{ query: "goal-crafter user preferences" },
				undefined,
				undefined,
				ctx,
			);

		assert.equal(searchResult?.details?.count, 1);
		assert.match(
			searchResult?.content?.[0]?.text ?? "",
			/goal-crafter-user-preferences\.md/,
		);
	});
});

test("global memory tools work without a project memory directory", async () => {
	await withGlobalOnlyMemory(async ({ cwd }) => {
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		const searchResult = await harness.tools
			.get("memory_search")
			?.execute(
				"test-call",
				{ query: "test-global-memory" },
				undefined,
				undefined,
				ctx,
			);
		assert.equal(searchResult?.details?.count, 1);
		assert.match(searchResult?.content?.[0]?.text ?? "", /Shared global/);

		const checkResult = await harness.tools
			.get("memory_check")
			?.execute("test-call", {}, undefined, undefined, ctx);
		assert.equal(checkResult?.details?.fileCount, 1);
		assert.equal(checkResult?.details?.globalMemoryMissing, false);
	});
});

test("status surfaces global-only local memory instead of reporting uninitialized", async () => {
	await withGlobalOnlyMemory(async ({ cwd }) => {
		const harness = createHarness();
		const ctx = createContext(cwd, harness.notifications);

		await harness.commands.get("memory-status")?.handler([], ctx);
		assert.ok(
			harness.notifications.some((message) =>
				message.includes("Shared global initialized"),
			),
		);
		assert.ok(
			harness.notifications.every(
				(message) => !message.includes("Not initialized"),
			),
		);

		const syncStatus = await harness.tools
			.get("memory_sync")
			?.execute("test-call", { action: "status" }, undefined, undefined, ctx);
		assert.equal(syncStatus?.details?.initialized, true);
		assert.equal(syncStatus?.details?.gitBacked, false);
		assert.match(syncStatus?.content?.[0]?.text ?? "", /not git-backed/);
	});
});

test("readMemoryFileAsync tolerates malformed frontmatter", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-md-test-"));

	try {
		const filePath = path.join(root, "bad-frontmatter.md");
		await writeFile(
			filePath,
			[
				"---",
				"description: Crash runbook",
				"evidence:",
				"  - Current boot kernel reported `BERT: [Hardware Error]: Skipped 1 error records`.",
				"tags:",
				"  - boot",
				"  - bert",
				"---",
				"",
				"# Body",
				"",
				"Body survives.",
			].join("\n"),
		);

		const memory = await readMemoryFileAsync(filePath);

		assert.ok(memory);
		assert.equal(memory.frontmatter.description, "Crash runbook");
		assert.deepEqual(memory.frontmatter.tags, ["boot", "bert"]);
		assert.equal(memory.content.trim(), "# Body\n\nBody survives.");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("writeMemoryFile uses JSON frontmatter for YAML-hostile evidence", async () => {
	const root = await mkdtemp(path.join(os.tmpdir(), "pi-memory-md-test-"));
	const evidenceEntry =
		"Current boot kernel reported `BERT: [Hardware Error]: Skipped 1 error records`.";

	try {
		const filePath = path.join(root, "json-frontmatter.md");
		const frontmatter: MemoryFrontmatter & { evidence: string[] } = {
			description: "Crash runbook",
			evidence: [evidenceEntry],
			tags: ["boot", "bert"],
		};

		writeMemoryFile(filePath, "# Body\n", frontmatter);

		const raw = await readFile(filePath, "utf-8");
		assert.match(raw, /"evidence"/);
		const memory = await readMemoryFileAsync(filePath);
		const parsedEvidence = (
			memory?.frontmatter as MemoryFrontmatter & { evidence?: string[] }
		).evidence;

		assert.deepEqual(parsedEvidence, [evidenceEntry]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});
