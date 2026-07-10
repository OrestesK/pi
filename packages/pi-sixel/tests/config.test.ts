import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DEFAULT_CONFIG,
  loadSettings,
  normalizeConfig,
} from "../src/config.ts";

test("defaults to four large high-quality previews", () => {
  assert.deepEqual(DEFAULT_CONFIG, {
    maxColumns: 120,
    maxRows: 36,
    maxImages: 4,
    quality: "high",
  });
});

test("normalizes valid preview overrides without mutating defaults", () => {
  assert.deepEqual(
    normalizeConfig({
      maxColumns: 80,
      maxRows: 24,
      maxImages: 8,
      quality: "balanced",
    }),
    {
      maxColumns: 80,
      maxRows: 24,
      maxImages: 8,
      quality: "balanced",
    },
  );
  assert.deepEqual(DEFAULT_CONFIG, {
    maxColumns: 120,
    maxRows: 36,
    maxImages: 4,
    quality: "high",
  });
});

test("rejects invalid dimensions, image limits, and quality values", () => {
  for (const config of [
    { maxColumns: 7 },
    { maxColumns: 121 },
    { maxColumns: 80.5 },
    { maxRows: 0 },
    { maxRows: 41 },
    { maxRows: Number.NaN },
    { maxImages: 0 },
    { maxImages: 33 },
    { maxImages: 2.5 },
    { quality: "ultra" },
  ]) {
    assert.throws(
      () => normalizeConfig(config),
      /maxColumns|maxRows|maxImages|quality/,
    );
  }
});

test("reports malformed global and project settings JSON", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-sixel-config-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    const agentDir = join(root, "agent");
    const projectDir = join(root, "project");
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(projectDir, ".pi"), { recursive: true });
    process.env.PI_CODING_AGENT_DIR = agentDir;

    await writeFile(join(agentDir, "settings.json"), "{");
    assert.throws(
      () => loadSettings(projectDir),
      /Invalid JSON in pi-sixel settings .*settings\.json/,
    );

    await writeFile(join(agentDir, "settings.json"), "{}");
    await writeFile(join(projectDir, ".pi", "settings.json"), "[");
    assert.throws(
      () => loadSettings(projectDir),
      /Invalid JSON in pi-sixel settings .*settings\.json/,
    );
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("loads global and project settings with project precedence", async () => {
  const root = await mkdtemp(join(tmpdir(), "pi-sixel-config-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  try {
    const agentDir = join(root, "agent");
    const projectDir = join(root, "project");
    await mkdir(agentDir, { recursive: true });
    await mkdir(join(projectDir, ".pi"), { recursive: true });
    await writeFile(
      join(agentDir, "settings.json"),
      JSON.stringify({
        "pi-sixel": {
          maxColumns: 100,
          maxRows: 30,
          maxImages: 12,
          quality: "balanced",
        },
      }),
    );
    await writeFile(
      join(projectDir, ".pi", "settings.json"),
      JSON.stringify({
        "pi-sixel": {
          maxRows: 34,
          maxImages: 6,
          quality: "high",
        },
      }),
    );
    process.env.PI_CODING_AGENT_DIR = agentDir;

    assert.deepEqual(loadSettings(projectDir), {
      maxColumns: 100,
      maxRows: 34,
      maxImages: 6,
      quality: "high",
    });
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    await rm(root, { recursive: true, force: true });
  }
});
