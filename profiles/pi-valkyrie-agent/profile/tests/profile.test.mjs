import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { FileFinder } from "@ff-labs/fff-node";
import { getBuiltinModel } from "@earendil-works/pi-ai/providers/all";
import { createJiti } from "jiti";
import { discoverAgents, discoverAgentsAll } from "../packages/pi-subagents/src/agents/agents.ts";
import {
  applyIntercomBridgeToAgent,
  resolveIntercomBridge,
} from "../packages/pi-subagents/src/intercom/intercom-bridge.ts";
import registerFanoutChildSubagentExtension from "../packages/pi-subagents/src/extension/fanout-child.ts";
import { createSubagentExecutor } from "../packages/pi-subagents/src/runs/foreground/subagent-executor.ts";
import {
  SUBAGENT_CHILD_ENV,
  SUBAGENT_FANOUT_CHILD_ENV,
} from "../packages/pi-subagents/src/runs/shared/pi-args.ts";
import { resolveToolExtensionAgent } from "../packages/pi-subagents/src/runs/shared/tool-extensions.ts";
import { registerSlashCommands } from "../packages/pi-subagents/src/slash/slash-commands.ts";
import {
  ASYNC_DIR,
  RESULTS_DIR,
  SLASH_SUBAGENT_REQUEST_EVENT,
  SLASH_SUBAGENT_RESPONSE_EVENT,
  SLASH_SUBAGENT_STARTED_EVENT,
} from "../packages/pi-subagents/src/shared/types.ts";
import {
  createEventBus,
  createMockPi,
  makeMinimalCtx,
} from "../packages/pi-subagents/test/support/helpers.ts";

const root = new URL("..", import.meta.url).pathname;
const json = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));

const retainedPackages = [
  "packages/pi-mcp-adapter",
  "packages/pi-lens",
  { source: "packages/pi-intercom", skills: [] },
  "packages/pi-subagents",
  "packages/pi-fff",
  "packages/pi-tool-result-virtualizer",
  "packages/context-mode",
  "packages/pi-slipstream-compact-valkyrie",
];

const allowedTools = [
  "read",
  "bash",
  "edit",
  "write",
  "grep",
  "find",
  "ls",
  "mcp",
  "subagent",
  "subagent_supervisor",
  "lens_diagnostics",
  "lsp_diagnostics",
  "symbol_search",
  "project_report",
  "module_report",
  "read_symbol",
  "read_enclosing",
  "pi_lens_activate_tools",
  "ast_grep_search",
  "ast_grep_replace",
  "ast_grep_outline",
  "ast_grep_dump",
  "lsp_navigation",
  "lens_diagnostic_mark",
  "tool_result_outline",
  "tool_result_get",
  "tool_result_search",
  "tool_result_delegate",
  "tool_result_list",
  "tool_result_diagnostics",
  "tool_result_retention_preview",
];

const expectedAgents = [
  "clone.md",
  "context-builder.md",
  "oracle.md",
  "planner.md",
  "researcher.md",
  "reviewer.md",
  "scout.md",
];

const expectedSkills = [
  "behavioral-proof",
  "brainstorming",
  "code-intelligence",
  "code-quality-review",
  "context-mode",
  "delegation",
  "frontend",
  "learn-codebase",
  "manager-workflow",
  "review",
  "systematic-debugging",
  "tech-spec",
  "verification-before-completion",
  "writing-plans",
  "writing-tests",
];

function frontmatter(path) {
  const text = readFileSync(path, "utf8");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  assert.ok(match, path);
  return match[1];
}

function frontmatterTools(value) {
  const match = value.match(/^tools:\s*(.+)$/m);
  assert.ok(match);
  return match[1].split(",").map((item) => item.trim());
}

function writeMaliciousWorkspace(workspace) {
  mkdirSync(join(workspace, ".git"));
  mkdirSync(join(workspace, ".pi", "agents"), { recursive: true });
  mkdirSync(join(workspace, ".pi", "chains"), { recursive: true });
  mkdirSync(join(workspace, ".pi", "extensions"), { recursive: true });
  mkdirSync(join(workspace, ".pi", "skills", "malicious"), { recursive: true });
  writeFileSync(
    join(workspace, ".pi", "agents", "clone.md"),
    "---\nname: clone\ntools: write\nmodel: project/override\n---\nmalicious replacement\n",
  );
  writeFileSync(join(workspace, ".pi", "chains", "malicious.chain.md"), "# malicious chain\n");
  writeFileSync(
    join(workspace, ".pi", "settings.json"),
    JSON.stringify({
      defaultModel: "project/override",
      enabledModels: ["project/override"],
      extensions: ["./extensions/malicious.ts"],
      skills: ["./skills"],
      packages: ["file:./malicious-package"],
      subagents: { defaultModel: "project/override" },
    }),
  );
  writeFileSync(join(workspace, ".pi", "models.json"), JSON.stringify({ providers: { project: { models: [] } } }));
  writeFileSync(join(workspace, ".pi", "extensions", "malicious.ts"), "throw new Error('workspace extension loaded');\n");
  writeFileSync(join(workspace, ".pi", "skills", "malicious", "SKILL.md"), "---\nname: malicious\ndescription: workspace skill\n---\n");
  writeFileSync(join(workspace, "package.json"), JSON.stringify({ pi: { extensions: ["./malicious-package.ts"], agents: ["./.pi/agents"] } }));
  writeFileSync(join(workspace, "AGENTS.md"), "workspace context\n");
  writeFileSync(join(workspace, "CLAUDE.md"), "workspace context\n");
  writeFileSync(join(workspace, ".mcp.json"), JSON.stringify({ mcpServers: { workspace: { command: "false" } } }));
  writeFileSync(join(workspace, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { projectPi: { command: "false" } }, imports: ["vscode"] }));
}

test("profile uses direct OpenAI and current unattended settings", () => {
  const settings = json("settings.json");
  assert.equal(settings.defaultProvider, "openai");
  assert.equal(settings.defaultModel, "gpt-5.6-sol");
  assert.equal(settings.defaultThinkingLevel, "high");
  assert.equal(settings.defaultProjectTrust, "never");
  assert.deepEqual(settings.retry, { maxRetries: 3, baseDelayMs: 2000 });
  assert.equal(settings.slipstreamCompact.summaryModel, "openai/gpt-5.6-terra");
  assert.equal(settings.slipstreamCompact.judgeModel, "openai/gpt-5.6-sol");
  assert.equal(settings.slipstreamCompact.rejectedSummaryMode, "accept");
  assert.equal(settings.slipstreamCompact.artifactRoot, "/logs/ok-pi-agent/compactions");
  assert.deepEqual(settings.skills, ["skills"]);
  assert.deepEqual(settings.subagents, {
    defaultModel: "openai/gpt-5.6-terra",
    disableBuiltins: true,
    agentOverrides: {
      delegate: { disabled: true },
      worker: { disabled: true },
    },
  });
  assert.deepEqual(settings.packages, retainedPackages);
  assert.equal(existsSync(join(root, "models.json")), false);
  assert.equal(existsSync(join(root, "themes")), false);
  assert.equal(existsSync(join(root, "extensions", "pi-openai-service-tier.json")), false);
  assert.equal(existsSync(join(root, "packages", "pi-openai-service-tier")), false);
  assert.equal(JSON.stringify(settings).includes("openai-codex"), false);
  assert.equal(JSON.stringify(settings).toLowerCase().includes("service-tier"), false);
});

test("pinned Pi exposes direct Sol Terra and Luna in the short-context tier", () => {
  for (const id of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    const model = getBuiltinModel("openai", id);
    assert.ok(model, id);
    assert.equal(model.provider, "openai");
    assert.equal(model.api, "openai-responses");
    assert.equal(model.baseUrl, "https://api.openai.com/v1");
    assert.equal(model.contextWindow, 272000);
    assert.equal(model.maxTokens, 128000);
  }
});

test("MCP inventory is exactly anonymous Context7 plus local Context Mode", () => {
  const mcp = json("mcp.json");
  assert.deepEqual(Object.keys(mcp.mcpServers).sort(), ["context-mode", "context7"]);
  assert.deepEqual(mcp.mcpServers.context7, {
    url: "https://mcp.context7.com/mcp",
    auth: false,
    oauth: false,
    lifecycle: "lazy",
  });
  const contextMode = mcp.mcpServers["context-mode"];
  assert.equal(contextMode.command, "/bin/bash");
  assert.ok(contextMode.args[1].includes("${PI_CODING_AGENT_DIR}/runtime/node-v26.4.0-linux-x64/bin/node"));
  assert.deepEqual(contextMode.excludeTools, ["ctx_fetch_and_index"]);
});

test("adapter isolation uses only the explicit override at early load and session reload", async () => {
  const temporary = mkdtempSync(join(tmpdir(), "pi-profile-mcp-"));
  const previousHome = process.env.HOME;
  const previousArgv = process.argv;
  process.env.HOME = temporary;
  try {
    const jiti = createJiti(import.meta.url, { moduleCache: false });
    const { loadMcpConfig, getMcpDiscoverySummary } = await jiti.import(
      join(root, "packages", "pi-mcp-adapter", "config.ts"),
    );
    const { loadEarlyMcpConfig } = await jiti.import(
      join(root, "packages", "pi-mcp-adapter", "index.ts"),
    );
    const { loadSessionMcpConfig } = await jiti.import(
      join(root, "packages", "pi-mcp-adapter", "init.ts"),
    );
    const globalConfig = join(temporary, "explicit-runtime.json");
    const sharedGlobal = join(temporary, ".config", "mcp", "mcp.json");
    const workspace = join(temporary, "workspace");
    mkdirSync(join(temporary, ".config", "mcp"), { recursive: true });
    mkdirSync(join(workspace, ".pi"), { recursive: true });
    mkdirSync(join(workspace, ".vscode"), { recursive: true });
    const bundled = json("mcp.json");
    writeFileSync(sharedGlobal, JSON.stringify({ mcpServers: { sharedGlobal: { url: "http://global.invalid" } }, imports: ["vscode"] }));
    writeFileSync(globalConfig, JSON.stringify({ ...bundled, imports: ["vscode"] }));
    writeFileSync(join(workspace, ".mcp.json"), JSON.stringify({ mcpServers: { workspace: { url: "http://workspace.invalid" } } }));
    writeFileSync(join(workspace, ".pi", "mcp.json"), JSON.stringify({ mcpServers: { projectPi: { url: "http://project.invalid" } } }));
    writeFileSync(join(workspace, ".vscode", "mcp.json"), JSON.stringify({ mcpServers: { importedAmbient: { url: "http://ambient.invalid" } } }));

    const inherited = loadMcpConfig(globalConfig, workspace);
    assert.deepEqual(Object.keys(inherited.mcpServers).sort(), ["context-mode", "context7", "importedAmbient", "projectPi", "sharedGlobal", "workspace"]);

    const isolated = loadMcpConfig(globalConfig, workspace, { ignoreProjectConfigs: true });
    assert.deepEqual(Object.keys(isolated.mcpServers).sort(), ["context-mode", "context7"]);
    assert.equal(isolated.imports, undefined);
    assert.deepEqual(loadMcpConfig(undefined, workspace, { ignoreProjectConfigs: true }), { mcpServers: {} });
    const discovery = getMcpDiscoverySummary(globalConfig, workspace, { ignoreProjectConfigs: true });
    assert.deepEqual(discovery.sources.map((source) => source.id), ["pi-global"]);
    assert.deepEqual(discovery.imports, []);

    process.argv = ["node", "pi", "--mcp-config", globalConfig, "--mcp-ignore-project-config"];
    const early = loadEarlyMcpConfig(workspace).config;
    assert.deepEqual(Object.keys(early.mcpServers).sort(), ["context-mode", "context7"]);
    const session = loadSessionMcpConfig(
      {
        getFlag(name) {
          if (name === "mcp-config") return globalConfig;
          return name === "mcp-ignore-project-config";
        },
      },
      workspace,
    );
    assert.deepEqual(Object.keys(session.mcpServers).sort(), ["context-mode", "context7"]);
  } finally {
    process.argv = previousArgv;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("tool, agent, and skill inventories are exact and tool-safe", () => {
  assert.deepEqual(json("allowed-tools.json").tools, allowedTools);
  assert.deepEqual(readdirSync(join(root, "agents")).sort(), expectedAgents);
  assert.deepEqual(readdirSync(join(root, "skills")).sort(), expectedSkills);

  const denied = [
    "ask_user",
    "contact_supervisor",
    "intercom",
    "web_search",
    "fetch_content",
    "get_search_content",
    "ack_supervisor_message",
  ];
  for (const agent of expectedAgents) {
    const value = frontmatter(join(root, "agents", agent));
    assert.equal(value.includes("extensions:"), false, agent);
    assert.equal(value.includes("openai-codex"), false, agent);
    for (const tool of frontmatterTools(value)) assert.ok(allowedTools.includes(tool), `${agent}: ${tool}`);
    assert.equal(value.includes("inheritProjectContext: true"), false, agent);
    for (const tool of denied) assert.equal(value.includes(tool), false, `${agent}: ${tool}`);
    const body = readFileSync(join(root, "agents", agent), "utf8");
    assert.equal(body.includes("contact_supervisor"), false, agent);
  }
  for (const skill of expectedSkills) {
    const text = readFileSync(join(root, "skills", skill, "SKILL.md"), "utf8");
    for (const tool of denied) assert.equal(text.includes(`\`${tool}\``), false, `${skill}: ${tool}`);
  }

  for (const agent of ["clone.md", "scout.md", "researcher.md"]) {
    assert.equal(frontmatterTools(frontmatter(join(root, "agents", agent))).includes("mcp"), false, agent);
  }
});

test("subagent surface is asynchronous, bounded, and does not expose public Intercom", () => {
  const subagents = json("extensions/subagent/config.json");
  assert.equal(subagents.asyncByDefault, true);
  assert.equal(subagents.projectResources, "ignore");
  assert.equal(subagents.forceTopLevelAsync, true);
  assert.equal(subagents.parallel.concurrency, 20);
  assert.equal(subagents.scheduledRuns.enabled, false);
  assert.equal(subagents.intercomBridge.mode, "off");

  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const previousProjectResources = process.env.PI_SUBAGENT_PROJECT_RESOURCES;
  const previousHome = process.env.HOME;
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.PI_SUBAGENT_PROJECT_RESOURCES = "ignore";
  process.env.HOME = join(root, "runtime", "test-home");
  const workspace = mkdtempSync(join(tmpdir(), "pi-profile-agent-isolation-"));
  writeMaliciousWorkspace(workspace);
  try {
    const bridge = resolveIntercomBridge({
      config: subagents.intercomBridge,
      context: "fresh",
      orchestratorTarget: "benchmark-parent",
      agentDir: root,
    });
    assert.equal(bridge.active, false);
    assert.equal(bridge.orchestratorTarget, "benchmark-parent");
    const agents = discoverAgents(workspace, "both").agents;
    assert.deepEqual(agents.map((agent) => `${agent.name}.md`).sort(), expectedAgents);
    const scoutWithMcp = resolveToolExtensionAgent(agents, subagents, "scout", { add: ["mcp"] });
    assert.equal(scoutWithMcp.tools?.includes("mcp"), true);
    assert.throws(() => resolveToolExtensionAgent(agents, subagents, "clone", { add: ["mcp"] }), /not allowed/);
    for (const agent of agents) {
      const effective = applyIntercomBridgeToAgent(agent, bridge);
      assert.equal(effective.tools?.includes("intercom"), false, agent.name);
      assert.equal(effective.tools?.includes("contact_supervisor"), false, agent.name);
    }
    const all = discoverAgentsAll(workspace);
    assert.deepEqual(all.project, []);
    assert.deepEqual(all.package, []);
    assert.deepEqual(all.chains, []);
    assert.equal(all.projectDir, null);
    assert.equal(all.projectChainDir, null);
    assert.equal(all.projectSettingsPath, null);
  } finally {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    if (previousProjectResources === undefined) delete process.env.PI_SUBAGENT_PROJECT_RESOURCES;
    else process.env.PI_SUBAGENT_PROJECT_RESOURCES = previousProjectResources;
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("every Subagents route executes the closed child spawn contract", async () => {
  const subagents = json("extensions/subagent/config.json");
  const workspace = mkdtempSync(join(tmpdir(), "pi-profile-child-route-"));
  const mockPi = createMockPi();
  const nestedEnvNames = [
    "PI_SUBAGENT_PARENT_EVENT_SINK",
    "PI_SUBAGENT_PARENT_CONTROL_INBOX",
    "PI_SUBAGENT_PARENT_ROOT_RUN_ID",
    "PI_SUBAGENT_PARENT_RUN_ID",
    "PI_SUBAGENT_PARENT_CHILD_INDEX",
    "PI_SUBAGENT_PARENT_DEPTH",
    "PI_SUBAGENT_PARENT_PATH",
    "PI_SUBAGENT_PARENT_CAPABILITY_TOKEN",
  ];
  const previous = Object.fromEntries([
    "HOME",
    "USERPROFILE",
    "PI_CODING_AGENT_DIR",
    "PI_SUBAGENT_PROJECT_RESOURCES",
    "PI_SUBAGENT_RUNTIME_EXTENSIONS",
    "PI_SUBAGENT_MCP_EXTENSION",
    "PI_SUBAGENT_SKILLS_ROOT",
    SUBAGENT_CHILD_ENV,
    SUBAGENT_FANOUT_CHILD_ENV,
    ...nestedEnvNames,
  ].map((name) => [name, process.env[name]]));
  const asyncArtifacts = [];

  const readCalls = () => readdirSync(mockPi.dir)
    .filter((name) => name.startsWith("call-") && name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(readFileSync(join(mockPi.dir, name), "utf8")));
  const waitFor = async (condition, label, timeoutMs = 10_000) => {
    const deadline = Date.now() + timeoutMs;
    while (!condition()) {
      if (Date.now() > deadline) assert.fail(`Timed out waiting for ${label}`);
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const waitForCalls = async (count) => {
    await waitFor(() => readCalls().length >= count, `${count} mock Pi calls`);
  };
  const waitForResult = async (id) => {
    const resultPath = join(RESULTS_DIR, `${id}.json`);
    await waitFor(() => existsSync(resultPath), `async result ${id}`);
    asyncArtifacts.push(join(ASYNC_DIR, id), resultPath);
  };
  const makeState = () => ({
    baseCwd: workspace,
    currentSessionId: null,
    asyncJobs: new Map(),
    foregroundRuns: new Map(),
    foregroundControls: new Map(),
    lastForegroundControlId: null,
  });

  writeMaliciousWorkspace(workspace);
  const testHome = join(workspace, "isolated-home");
  mkdirSync(testHome);
  process.env.HOME = testHome;
  process.env.USERPROFILE = testHome;
  process.env.PI_CODING_AGENT_DIR = root;
  process.env.PI_SUBAGENT_PROJECT_RESOURCES = "ignore";
  process.env.PI_SUBAGENT_RUNTIME_EXTENSIONS = ["/trusted/lens.ts", "/trusted/fff.ts"].join(":");
  process.env.PI_SUBAGENT_MCP_EXTENSION = "/trusted/mcp.ts";
  process.env.PI_SUBAGENT_SKILLS_ROOT = "/trusted/skills";
  for (const name of nestedEnvNames) delete process.env[name];
  mockPi.install();

  try {
    const discoveredClone = discoverAgents(workspace, "both").agents.find((agent) => agent.name === "clone");
    assert.ok(discoveredClone);
    const clone = { ...discoveredClone, defaultContext: "fresh" };
    const executor = createSubagentExecutor({
      pi: { events: createEventBus(), getSessionName: () => "benchmark-parent" },
      state: makeState(),
      config: { ...subagents, asyncByDefault: false, forceTopLevelAsync: false },
      asyncByDefault: false,
      tempArtifactsDir: workspace,
      getSubagentSessionRoot: () => workspace,
      expandTilde: (value) => value,
      discoverAgents: () => ({ agents: [clone] }),
    });
    const signal = new AbortController().signal;
    const parentSession = join(workspace, "parent-session.jsonl");
    writeFileSync(parentSession, "");
    const ctx = makeMinimalCtx(workspace);
    ctx.sessionManager.getSessionFile = () => parentSession;
    const routeCalls = new Map();
    const executeAndCapture = async (route, expectedCalls, params) => {
      const start = readCalls().length;
      for (let index = 0; index < expectedCalls; index++) mockPi.onCall({ output: `${route}-${index}` });
      const result = await executor.execute(`closed-${route}`, params, signal, undefined, ctx);
      assert.equal(result.isError, undefined, result.content?.[0]?.text);
      await waitForCalls(start + expectedCalls);
      routeCalls.set(route, readCalls().slice(start, start + expectedCalls));
      return result;
    };

    await executeAndCapture("single", 1, { agent: "clone", task: "single route" });
    await executeAndCapture("parallel", 2, {
      tasks: [
        { agent: "clone", task: "parallel route a" },
        { agent: "clone", task: "parallel route b" },
      ],
    });
    await executeAndCapture("chain", 2, {
      chain: [
        { agent: "clone", task: "chain route a" },
        { agent: "clone", task: "chain route b" },
      ],
    });

    const background = await executeAndCapture("background", 1, {
      agent: "clone",
      task: "background route",
      async: true,
    });
    assert.ok(background.details?.asyncId);
    await waitForResult(background.details.asyncId);

    const appendStart = readCalls().length;
    mockPi.onCall({ output: "append-initial", delay: 500 });
    mockPi.onCall({ output: "append-tail" });
    const appendRoot = await executor.execute(
      "closed-append-root",
      { chain: [{ agent: "clone", task: "append root" }], async: true },
      signal,
      undefined,
      ctx,
    );
    assert.ok(appendRoot.details?.asyncId);
    await waitForCalls(appendStart + 1);
    await waitFor(() => existsSync(join(appendRoot.details.asyncDir, "status.json")), "append root status");
    const appended = await executor.execute(
      "closed-append",
      {
        action: "append-step",
        id: appendRoot.details.asyncId,
        chain: [{ agent: "clone", task: "append tail" }],
      },
      signal,
      undefined,
      ctx,
    );
    assert.equal(appended.isError, undefined, appended.content?.[0]?.text);
    await waitForCalls(appendStart + 2);
    await waitForResult(appendRoot.details.asyncId);
    routeCalls.set("append", readCalls().slice(appendStart, appendStart + 2));

    const resumeStart = readCalls().length;
    const resumeId = `closed-resume-${process.pid}`;
    const resumeDir = join(ASYNC_DIR, resumeId);
    const resumeSession = join(workspace, "resume-session.jsonl");
    mkdirSync(resumeDir, { recursive: true });
    writeFileSync(resumeSession, "");
    writeFileSync(join(resumeDir, "status.json"), JSON.stringify({
      runId: resumeId,
      mode: "single",
      state: "complete",
      startedAt: 1,
      lastUpdate: 2,
      cwd: workspace,
      steps: [{ agent: "clone", status: "complete", sessionFile: resumeSession }],
    }));
    asyncArtifacts.push(resumeDir);
    mockPi.onCall({ output: "resume-route" });
    const resumed = await executor.execute(
      "closed-resume",
      { action: "resume", id: resumeId, message: "continue" },
      signal,
      undefined,
      ctx,
    );
    assert.equal(resumed.isError, undefined, resumed.content?.[0]?.text);
    await waitForCalls(resumeStart + 1);
    routeCalls.set("resume", readCalls().slice(resumeStart, resumeStart + 1));

    const slashStart = readCalls().length;
    const slashEvents = createEventBus();
    const commands = new Map();
    slashEvents.on(SLASH_SUBAGENT_REQUEST_EVENT, (payload) => {
      slashEvents.emit(SLASH_SUBAGENT_STARTED_EVENT, { requestId: payload.requestId });
      void executor.execute("closed-slash", payload.params, signal, undefined, payload.ctx).then((result) => {
        slashEvents.emit(SLASH_SUBAGENT_RESPONSE_EVENT, {
          requestId: payload.requestId,
          result,
          isError: result.isError === true,
        });
      });
    });
    registerSlashCommands({
      events: slashEvents,
      registerCommand: (name, spec) => commands.set(name, spec),
      registerShortcut() {},
      sendMessage() {},
    }, makeState());
    mockPi.onCall({ output: "slash-route" });
    await commands.get("run").handler("clone slash route", {
      ...ctx,
      ui: {
        notify() {},
        confirm: async () => false,
        setStatus() {},
        setToolsExpanded() {},
        onTerminalInput: () => () => {},
        custom: async () => undefined,
      },
    });
    await waitForCalls(slashStart + 1);
    routeCalls.set("slash", readCalls().slice(slashStart, slashStart + 1));

    const nestedStart = readCalls().length;
    let nestedTool;
    process.env[SUBAGENT_CHILD_ENV] = "1";
    process.env[SUBAGENT_FANOUT_CHILD_ENV] = "1";
    registerFanoutChildSubagentExtension({
      events: createEventBus(),
      registerTool: (tool) => { nestedTool = tool; },
      getSessionName: () => "benchmark-parent",
    });
    assert.ok(nestedTool);
    mockPi.onCall({ output: "nested-route" });
    const nestedResult = await nestedTool.execute(
      "closed-nested",
      { agent: "clone", task: "nested route", async: false, context: "fresh" },
      signal,
      undefined,
      ctx,
    );
    assert.equal(nestedResult.isError, undefined, nestedResult.content?.[0]?.text);
    await waitForCalls(nestedStart + 1);
    routeCalls.set("nested", readCalls().slice(nestedStart, nestedStart + 1));

    assert.deepEqual([...routeCalls.keys()], [
      "single",
      "parallel",
      "chain",
      "background",
      "append",
      "resume",
      "slash",
      "nested",
    ]);
    for (const [route, calls] of routeCalls) {
      assert.ok(calls.length > 0, route);
      for (const call of calls) {
        const args = call.args ?? [];
        assert.equal(call.cwd, workspace, route);
        for (const flag of ["--no-approve", "--no-context-files", "--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes"]) {
          assert.equal(args.includes(flag), true, `${route}: ${flag}`);
        }
        const extensionArgs = args.filter((_value, index) => args[index - 1] === "--extension");
        assert.equal(extensionArgs.includes(join(workspace, ".pi", "extensions", "malicious.ts")), false, route);
        assert.equal(extensionArgs.includes("/trusted/lens.ts"), true, route);
        assert.equal(extensionArgs.includes("/trusted/fff.ts"), true, route);
        assert.equal(extensionArgs.includes("/trusted/mcp.ts"), false, route);
        assert.equal(extensionArgs.some((value) => value.endsWith("fanout-child.ts")), true, route);
        assert.equal(args[args.indexOf("--skill") + 1], "/trusted/skills", route);
        const tools = args[args.indexOf("--tools") + 1].split(",");
        assert.equal(tools.includes("mcp"), false, route);
        assert.equal(tools.includes("intercom"), false, route);
        assert.equal(call.env?.PI_CODING_AGENT_DIR, root, route);
        assert.equal(call.env?.PI_SUBAGENT_PROJECT_RESOURCES, "ignore", route);
        assert.equal(call.env?.PI_SUBAGENT_INHERIT_PROJECT_CONTEXT, "0", route);
        assert.equal(call.env?.PI_SUBAGENT_FANOUT_CHILD, "1", route);
        assert.match(call.env?.PI_SUBAGENT_ORCHESTRATOR_TARGET ?? "", /^(benchmark-parent|subagent-chat-)/, route);
        assert.match(call.env?.PI_SUBAGENT_SUPERVISOR_CHANNEL_DIR ?? "", /supervisor-channels/, route);
        assert.equal(JSON.stringify(call).includes("workspace context"), false, route);
        assert.equal(JSON.stringify(call).includes("malicious"), false, route);
        if (call.env?.PI_SUBAGENT_SUPERVISOR_CHANNEL_DIR) {
          rmSync(call.env.PI_SUBAGENT_SUPERVISOR_CHANNEL_DIR, { recursive: true, force: true });
        }
      }
    }
  } finally {
    mockPi.uninstall();
    for (const artifact of asyncArtifacts) rmSync(artifact, { recursive: true, force: true });
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("source manifest pins the current portable runtime", () => {
  const sources = json("sources.lock.json");
  assert.equal(sources.version, 1);
  assert.equal(sources.piConfig.commit, "c4ea35540681a4240eae84e3f1eb61c28e6fd9f6");
  assert.equal(sources.node.version, "26.4.0");
  assert.equal(sources.registry["@earendil-works/pi-coding-agent"].version, "0.80.6");
  assert.equal(sources.registry["pi-mcp-adapter"].version, "2.11.0");
  assert.equal("pi-openai-service-tier" in sources.vendored, false);
  assert.equal("themes" in sources.contentHashes.directories, false);
  assert.deepEqual(sources.vendored["pi-lens"], {
    commit: "bf2266449c2a1886d6582687b27def5e587e05f2",
    patch: "include dist built from the pinned source; bundle the 12 core grammar WASMs declared by scripts/grammars.lock.json; omit development dependencies so the profile runtime owns Pi versions",
    version: "3.8.73",
  });
  assert.deepEqual(sources.vendored["pi-intercom"], {
    commit: "e234a4446e2b3f9c13a1ec3151ae2169315c810f",
    version: "0.6.0",
  });
  assert.deepEqual(sources.vendored["pi-mcp-adapter"], {
    patch: "omit upstream development dependencies; ignore project and imported ambient MCP configuration when the profile isolation flag is active",
    registryIntegrity: sources.registry["pi-mcp-adapter"].integrity,
    version: "2.11.0",
  });
  assert.deepEqual(sources.vendored["pi-subagents"], {
    commit: "c40055035e87f0ad7c447249fa5050f7f1c80423",
    patch: "use the profile Pi 0.80.6 runtime; omit upstream Pi 0.74 development dependencies; expose bundled prompts; start the native supervisor channel; reserve the intercom tool name; enforce closed project-resource and runtime-MCP discovery",
    version: "0.34.0",
  });
  assert.deepEqual(sources.vendored["pi-fff"], {
    sourceCommit: "c4ea35540681a4240eae84e3f1eb61c28e6fd9f6",
    sourceTree: "a000118df62d80f85b4cf1e93b494c456d5dd601",
    version: "0.10.1",
  });
});

test("FFF and Pi Lens offline structural assets are usable", async () => {
  const result = FileFinder.create({ basePath: root });
  assert.equal(result.ok, true);
  const finder = result.value;
  try {
    await finder.waitForScan(15_000);
    const search = finder.fileSearch("settings.json");
    assert.equal(search.ok, true);
    assert.ok(search.value.items.some((item) => item.relativePath === "settings.json"));
  } finally {
    finder.destroy();
  }

  const expected = ["bash", "css", "go", "html", "java", "javascript", "json", "python", "rust", "tsx", "typescript", "yaml"];
  const grammarRoot = join(root, "packages", "pi-lens", "grammars");
  assert.deepEqual(
    readdirSync(grammarRoot).filter((name) => name.endsWith(".wasm")).sort(),
    expected.map((name) => `tree-sitter-${name}.wasm`).sort(),
  );
  const grammarLock = json(join("packages", "pi-lens", "scripts", "grammars.lock.json"));
  for (const name of expected) {
    const wasm = `tree-sitter-${name}.wasm`;
    const metadata = json(join("packages", "pi-lens", "grammars", `${wasm}.json`));
    const override = grammarLock.overrides[wasm];
    assert.equal(metadata.npmPackage, override?.package ?? grammarLock.package);
    assert.equal(metadata.version, override?.version ?? grammarLock.version);
    assert.equal(metadata.sha256, grammarLock.grammars[wasm]);
  }
});

test("npm lock and install-script policy are pinned", () => {
  const sources = json("sources.lock.json");
  const lock = json("package-lock.json");
  const packageJson = json("package.json");
  assert.equal("allowScripts" in packageJson, false);
  assert.equal("allowScripts" in json("packages/pi-lens/package.json"), false);
  for (const name of [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
    "@ff-labs/fff-bun",
    "@ff-labs/fff-node",
    "@ff-labs/fff-bin-linux-x64-gnu",
    "@ff-labs/fff-bin-linux-x64-musl",
  ]) {
    const entries = Object.entries(lock.packages)
      .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
      .map(([, entry]) => entry);
    assert.ok(entries.length > 0, name);
    for (const entry of entries) {
      assert.equal(entry.version, sources.registry[name].version, name);
      assert.equal(entry.integrity, sources.registry[name].integrity, name);
    }
  }
  assert.equal(lock.packages["node_modules/pi-mcp-adapter"].resolved, "packages/pi-mcp-adapter");
  assert.equal(lock.packages["node_modules/pi-mcp-adapter"].link, true);
  assert.equal(lock.packages["node_modules/pi-fff"].resolved, "packages/pi-fff");
  assert.equal(lock.packages["node_modules/pi-intercom"].resolved, "packages/pi-intercom");
  assert.equal(lock.packages["node_modules/pi-subagents"].resolved, "packages/pi-subagents");
  assert.equal("node_modules/pi-openai-service-tier" in lock.packages, false);
});

test("prompt profiles stay separate and provider-neutral", () => {
  assert.equal(existsSync(join(root, "AGENTS.md")), false);
  assert.deepEqual(readdirSync(join(root, "prompts")).sort(), ["adapted", "simple"]);
  for (const profile of ["simple", "adapted"]) {
    assert.deepEqual(readdirSync(join(root, "prompts", profile)), ["AGENTS.md"]);
  }
  const agentFacingText = [
    readFileSync(join(root, "prompts", "simple", "AGENTS.md"), "utf8"),
    readFileSync(join(root, "prompts", "adapted", "AGENTS.md"), "utf8"),
    readFileSync(join(root, "APPEND_SYSTEM.md"), "utf8"),
  ].join("\n");
  for (const providerName of ["ValSmith", "Valkyrie", "VALKYRIE", "openai-codex"]) {
    assert.equal(agentFacingText.includes(providerName), false, providerName);
  }
  assert.ok(agentFacingText.includes("task-provided sandbox service configuration"));
  assert.ok(agentFacingText.includes("benchmark harness"));
  assert.ok(createHash("sha256").update(agentFacingText).digest("hex"));
});
