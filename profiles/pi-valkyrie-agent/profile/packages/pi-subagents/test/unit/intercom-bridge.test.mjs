import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { loadTs } from "../support/load-ts.mjs";

const { applyIntercomBridgeToAgent, diagnoseIntercomBridge } = await loadTs("../../src/intercom/intercom-bridge.ts");

function makePiPackage(root, name) {
	const packageRoot = path.join(root, name);
	fs.mkdirSync(packageRoot, { recursive: true });
	fs.writeFileSync(
		path.join(packageRoot, "package.json"),
		JSON.stringify({ name, pi: { extensions: ["./index.ts"] } }),
	);
	fs.writeFileSync(path.join(packageRoot, "index.ts"), "export default function () {}\n");
	return packageRoot;
}

test("discovers npm pi-intercom from the running pi binary prefix when npm root -g points elsewhere", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-intercom-"));
	const agentDir = path.join(tmp, "agent");
	const wrongGlobalRoot = path.join(tmp, "usr", "lib", "node_modules");
	const piPrefix = path.join(tmp, "npm-global");
	const piBin = path.join(piPrefix, "bin", "pi");
	const expectedPackageRoot = makePiPackage(path.join(piPrefix, "lib", "node_modules"), "pi-intercom");

	fs.mkdirSync(path.dirname(piBin), { recursive: true });
	fs.writeFileSync(piBin, "#!/usr/bin/env node\n");
	fs.mkdirSync(agentDir, { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "settings.json"),
		JSON.stringify({ packages: ["npm:pi-intercom"] }),
	);

	const diagnostic = diagnoseIntercomBridge({
		config: { mode: "always" },
		context: "fresh",
		orchestratorTarget: "parent",
		agentDir,
		cwd: tmp,
		globalNpmRoot: wrongGlobalRoot,
		piBinPath: piBin,
	});

	assert.equal(diagnostic.active, true);
	assert.equal(diagnostic.piIntercomAvailable, true);
	assert.equal(diagnostic.extensionDir, expectedPackageRoot);
});

test("prefers npm pi-intercom from the running pi binary prefix over a different global root", () => {
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pi-subagents-intercom-precedence-"));
	const agentDir = path.join(tmp, "agent");
	const wrongGlobalRoot = path.join(tmp, "usr", "lib", "node_modules");
	const piPrefix = path.join(tmp, "npm-global");
	const piBin = path.join(piPrefix, "bin", "pi");
	makePiPackage(wrongGlobalRoot, "pi-intercom");
	const expectedPackageRoot = makePiPackage(path.join(piPrefix, "lib", "node_modules"), "pi-intercom");

	fs.mkdirSync(path.dirname(piBin), { recursive: true });
	fs.writeFileSync(piBin, "#!/usr/bin/env node\n");
	fs.mkdirSync(agentDir, { recursive: true });
	fs.writeFileSync(
		path.join(agentDir, "settings.json"),
		JSON.stringify({ packages: ["npm:pi-intercom"] }),
	);

	const diagnostic = diagnoseIntercomBridge({
		config: { mode: "always" },
		context: "fresh",
		orchestratorTarget: "parent",
		agentDir,
		cwd: tmp,
		globalNpmRoot: wrongGlobalRoot,
		piBinPath: piBin,
	});

	assert.equal(diagnostic.active, true);
	assert.equal(diagnostic.extensionDir, expectedPackageRoot);
});

test("adds the resolved intercom extension path to bridged agent tool paths", () => {
	const extensionDir = "/opt/pi-intercom";
	const bridged = applyIntercomBridgeToAgent(
		{
			name: "scout",
			tools: ["read", "contact_supervisor"],
			extensions: [],
			systemPrompt: "Scout prompt",
		},
		{
			active: true,
			mode: "always",
			orchestratorTarget: "parent",
			extensionDir,
			instruction: "Intercom orchestration channel:\nUse contact_supervisor.",
		},
	);

	assert.deepEqual(bridged.tools, ["read", "contact_supervisor", "intercom", extensionDir]);
	assert.deepEqual(bridged.extensions, []);
});
