import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
	DEFAULT_REFLECTION_CONFIG,
	loadReflectionConfig,
	normalizeReflectionConfig,
} from "../src/config.ts";

describe("reflection config", () => {
	it("uses safe defaults with semantic resources disabled", () => {
		assert.deepEqual(DEFAULT_REFLECTION_CONFIG, {
			enabled: true,
			resourcesReady: false,
			promptStartTrigger: true,
			intervalTrigger: true,
			turnInterval: 4,
			agentEndTrigger: true,
			readinessTimeoutMs: 500,
		});
	});

	it("normalizes supported overrides without mutating defaults", () => {
		const config = normalizeReflectionConfig({
			enabled: false,
			resourcesReady: true,
			providerId: "custom.provider-1",
			promptStartTrigger: false,
			intervalTrigger: false,
			turnInterval: 10_001,
			agentEndTrigger: false,
			readinessTimeoutMs: 1_000,
		});

		assert.deepEqual(config, {
			enabled: false,
			resourcesReady: true,
			providerId: "custom.provider-1",
			promptStartTrigger: false,
			intervalTrigger: false,
			turnInterval: 10_001,
			agentEndTrigger: false,
			readinessTimeoutMs: 1_000,
		});
		assert.equal(DEFAULT_REFLECTION_CONFIG.resourcesReady, false);
		assert.equal(DEFAULT_REFLECTION_CONFIG.providerId, undefined);
		assert.equal(normalizeReflectionConfig({}).providerId, undefined);
	});

	it("rejects invalid untrusted settings", () => {
		assert.throws(() => normalizeReflectionConfig([]), /must be an object/);
		assert.throws(
			() => normalizeReflectionConfig({ enabled: "yes" }),
			/enabled must be boolean/,
		);
		for (const key of ["turnInterval", "readinessTimeoutMs"] as const) {
			assert.throws(
				() => normalizeReflectionConfig({ [key]: 0 }),
				new RegExp(key),
			);
		}
		assert.throws(
			() => normalizeReflectionConfig({ readinessTimeoutMs: 2_147_483_648 }),
			/readinessTimeoutMs/,
		);
		assert.throws(
			() => normalizeReflectionConfig({ providerId: "invalid provider" }),
			/providerId/,
		);
	});

	it("loads global and project settings with project precedence", async () => {
		const root = await mkdtemp(join(tmpdir(), "reflection-config-"));
		const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
		try {
			const agentDir = join(root, "agent");
			const projectDir = join(root, "project");
			await mkdir(agentDir, { recursive: true });
			await mkdir(join(projectDir, ".pi"), { recursive: true });
			await writeFile(
				join(agentDir, "settings.json"),
				JSON.stringify({
					"pi-reflection": { turnInterval: 8, providerId: "global" },
				}),
				"utf8",
			);
			await writeFile(
				join(projectDir, ".pi", "settings.json"),
				JSON.stringify({
					"pi-reflection": { turnInterval: 2, providerId: "project" },
				}),
				"utf8",
			);
			process.env.PI_CODING_AGENT_DIR = agentDir;

			const config = loadReflectionConfig(projectDir);

			assert.equal(config.turnInterval, 2);
			assert.equal(config.providerId, "project");
			assert.equal(config.resourcesReady, false);
		} finally {
			if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
			else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
			await rm(root, { recursive: true, force: true });
		}
	});
});
