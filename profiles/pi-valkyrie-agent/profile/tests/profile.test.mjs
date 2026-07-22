import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = new URL("..", import.meta.url).pathname;
const json = (name) => JSON.parse(readFileSync(join(root, name), "utf8"));

const retainedPackages = [
  "node_modules/pi-mcp-adapter",
  "packages/pi-lens",
  { source: "packages/pi-intercom", skills: [] },
  "packages/pi-subagents",
  "packages/pi-tool-result-virtualizer",
  "packages/context-mode",
  "packages/pi-slipstream-compact-valkyrie",
  "packages/pi-openai-service-tier",
];

const bannedFragments = [
  "claude-ui",
  "guardrails",
  "pi-memory-md",
  "pi-ask-user",
  "pisesh",
  "pi-btw",
  "pi-sixel",
  "image-gen",
];

test("profile is subtractive and unattended", () => {
  const settings = json("settings.json");
  assert.equal(settings.defaultProvider, "openai-codex");
  assert.equal(settings.defaultModel, "gpt-5.6-sol");
  assert.equal(settings.defaultThinkingLevel, "max");
  assert.equal(settings.defaultProjectTrust, "never");
  assert.deepEqual(settings.retry, { maxRetries: 3, baseDelayMs: 2000 });
  assert.equal(settings.slipstreamCompact.autoTrigger, true);
  assert.equal(settings.slipstreamCompact.rejectedSummaryMode, "accept");
  assert.equal(settings.slipstreamCompact.artifactRoot, "/logs/ok-pi-agent/compactions");
  assert.deepEqual(settings.subagents, {
    defaultModel: "openai-codex/gpt-5.6-terra",
    disableBuiltins: false,
  });
  assert.deepEqual(settings.packages, retainedPackages);
  for (const fragment of bannedFragments) {
    assert.equal(JSON.stringify(settings).includes(fragment), false, fragment);
  }
});

test("MCP inventory is exactly the approved local/docs set", () => {
  const mcp = json("mcp.json");
  assert.deepEqual(Object.keys(mcp.mcpServers).sort(), [
    "context-mode",
    "context7",
  ]);
  assert.deepEqual(mcp.mcpServers.context7, {
    url: "https://mcp.context7.com/mcp",
    auth: false,
    oauth: false,
    lifecycle: "lazy",
  });
  const nodeRuntime =
    '${PI_CODING_AGENT_DIR}/runtime/node-v26.4.0-linux-x64/bin/node';
  assert.equal(mcp.mcpServers["context-mode"].command, "/bin/bash");
  assert.ok(mcp.mcpServers["context-mode"].args[1].includes(nodeRuntime));
  assert.deepEqual(mcp.mcpServers["context-mode"].excludeTools, [
    "ctx_fetch_and_index",
  ]);
  assert.equal(JSON.stringify(mcp).includes("tree-sitter"), false);
  assert.equal(JSON.stringify(mcp).includes("docent"), false);
  assert.equal(JSON.stringify(mcp).includes("python-tools"), false);
});

test("allowed tools are closed and exclude human/private surfaces", () => {
  const allowed = json("allowed-tools.json");
  assert.ok(Array.isArray(allowed.tools));
  for (const required of [
    "read",
    "bash",
    "edit",
    "write",
    "mcp",
    "subagent",
    "subagent_supervisor",
    "lens_diagnostics",
    "ast_grep_search",
  ]) {
    assert.ok(allowed.tools.includes(required), required);
  }
  for (const denied of [
    "ask_user",
    "intercom",
    "contact_supervisor",
    "image_generation",
    "todo",
    "tree_sitter_search_symbols",
    "web_search",
    "fetch_content",
    "get_search_content",
    "tool_result_delegate",
  ]) {
    assert.equal(allowed.tools.includes(denied), false, denied);
  }
  assert.equal(new Set(allowed.tools).size, allowed.tools.length);
});

test("global extension inventory is exact and no root skills are shipped", () => {
  assert.deepEqual(readdirSync(join(root, "extensions")).sort(), [
    "compact-advisor.ts",
    "pi-openai-service-tier.json",
    "stop.ts",
    "subagent",
    "tool-attestation.ts",
  ]);
  assert.equal(existsSync(join(root, "skills")), false);
});

test("source manifest pins approved immutable baseline", () => {
  const sources = json("sources.lock.json");
  assert.equal(sources.version, 1);
  assert.equal(sources.piConfig.commit, "ef04d8cde5e75923b47fcbecc80b312049dcb95d");
  assert.equal(sources.node.version, "26.4.0");
  assert.equal(
    sources.node.sha256,
    "5c4286dcd5bbd5acb1ccc7eb0e088bd5eb1e3affad671ee9364004f8f6a4a431",
  );
  assert.equal(sources.registry["@earendil-works/pi-coding-agent"].version, "0.80.6");
  assert.equal(sources.registry["pi-mcp-adapter"].version, "2.11.0");
  assert.equal("@aliou/pi-guardrails" in sources.registry, false);
  assert.equal("pi-web-access" in sources.registry, false);
  assert.equal("docent-python" in sources.registry, false);
  assert.deepEqual(sources.vendored["pi-lens"], {
    commit: "5760263730462227773a319b6102b056def70bda",
    patch: "include dist built from the pinned source with TypeScript 6.0.3; bundle the 12 core grammar WASMs from tree-sitter-wasms 0.1.13",
    version: "3.8.70",
  });
  assert.deepEqual(sources.vendored["pi-intercom"], {
    commit: "e234a4446e2b3f9c13a1ec3151ae2169315c810f",
    version: "0.6.0-unreleased",
  });
  assert.deepEqual(sources.vendored["pi-subagents"], {
    commit: "7296ddedfa01a2de567b3d11c2bb838b41d0508f",
    patch: "use the profile Pi 0.80.6 runtime; omit upstream Pi 0.74 development dependencies; register the supervisor channel during extension startup; reserve the intercom tool name for the pinned Pi Intercom relay",
    version: "0.34.0",
  });
  assert.equal(existsSync(join(root, "python-requirements.in")), false);
  assert.equal(existsSync(join(root, "python-requirements.lock")), false);
  assert.deepEqual(sources.tools.ripgrep, {
    version: "15.2.0",
    sha256: "33e15bcf1624b25cdd2a55813a47a2f95dbe126268203e76aa6a585d1e7b149c",
    url: "https://github.com/BurntSushi/ripgrep/releases/download/15.2.0/ripgrep-15.2.0-x86_64-unknown-linux-musl.tar.gz",
  });
  assert.deepEqual(sources.tools.fd, {
    version: "10.4.2",
    sha256: "e3257d48e29a6be965187dbd24ce9af564e0fe67b3e73c9bdcd180f4ec11bdde",
    url: "https://github.com/sharkdp/fd/releases/download/v10.4.2/fd-v10.4.2-x86_64-unknown-linux-musl.tar.gz",
  });
});

test("Pi Lens core grammars are bundled for offline structural tools", () => {
  const grammarRoot = join(root, "packages", "pi-lens", "grammars");
  const expected = [
    "bash",
    "css",
    "go",
    "html",
    "java",
    "javascript",
    "json",
    "python",
    "rust",
    "tsx",
    "typescript",
    "yaml",
  ];
  assert.deepEqual(
    readdirSync(grammarRoot)
      .filter((name) => name.endsWith(".wasm"))
      .sort(),
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
  assert.deepEqual(packageJson.allowScripts, {
    "better-sqlite3@12.11.1": true,
    "esbuild@0.27.7": true,
    "esbuild@0.28.1": true,
    "protobufjs@7.6.5": true,
    "@ast-grep/cli@0.44.1": true,
    "@google/genai@1.52.0": true,
    "file:../packages/pi-lens": false,
  });
  for (const name of [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
    "pi-mcp-adapter",
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
  assert.equal(lock.packages["node_modules/pi-intercom"].resolved, "packages/pi-intercom");
  assert.equal(lock.packages["node_modules/pi-subagents"].resolved, "packages/pi-subagents");
  assert.equal("node_modules/@aliou/pi-guardrails" in lock.packages, false);
  assert.ok(existsSync(join(root, "models.json")));
  assert.ok(existsSync(join(root, "themes", "gruvbox-custom.json")));
});
