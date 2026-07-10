import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SixelQuality = "balanced" | "high";

export interface SixelConfig {
  maxColumns: number;
  maxRows: number;
  maxImages: number;
  quality: SixelQuality;
}

export const DEFAULT_CONFIG: Readonly<SixelConfig> = Object.freeze({
  maxColumns: 120,
  maxRows: 36,
  maxImages: 4,
  quality: "high",
});

const CONFIG_KEY = "pi-sixel";
const MIN_COLUMNS = 8;
export const MAX_COLUMNS = 120;
const MIN_ROWS = 1;
export const MAX_ROWS = 40;
const MIN_IMAGES = 1;
export const MAX_IMAGES = 32;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): UnknownRecord {
  let source: string;
  try {
    source = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw new Error(`Unable to read pi-sixel settings ${path}`, {
      cause: error,
    });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch (error) {
    throw new Error(`Invalid JSON in pi-sixel settings ${path}`, {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new Error(`pi-sixel settings ${path} must contain a JSON object`);
  }
  return parsed;
}

function nestedConfig(settings: UnknownRecord): UnknownRecord {
  const value = settings[CONFIG_KEY];
  return isRecord(value) ? value : {};
}

function integerSetting(
  config: UnknownRecord,
  key: "maxColumns" | "maxRows" | "maxImages",
  fallback: number,
): number {
  const value = config[key];
  if (value === undefined) {
    return fallback;
  }
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    !Number.isInteger(value)
  ) {
    throw new Error(`${key} must be a finite integer`);
  }
  return value;
}

function qualitySetting(config: UnknownRecord): SixelQuality {
  const value = config.quality;
  if (value === undefined) {
    return DEFAULT_CONFIG.quality;
  }
  if (value !== "balanced" && value !== "high") {
    throw new Error('quality must be "balanced" or "high"');
  }
  return value;
}

export function normalizeConfig(value: unknown = {}): SixelConfig {
  const config = isRecord(value) ? value : {};
  const maxColumns = integerSetting(
    config,
    "maxColumns",
    DEFAULT_CONFIG.maxColumns,
  );
  const maxRows = integerSetting(config, "maxRows", DEFAULT_CONFIG.maxRows);
  const maxImages = integerSetting(
    config,
    "maxImages",
    DEFAULT_CONFIG.maxImages,
  );
  if (maxColumns < MIN_COLUMNS || maxColumns > MAX_COLUMNS) {
    throw new Error(
      `maxColumns must be between ${MIN_COLUMNS} and ${MAX_COLUMNS}`,
    );
  }
  if (maxRows < MIN_ROWS || maxRows > MAX_ROWS) {
    throw new Error(`maxRows must be between ${MIN_ROWS} and ${MAX_ROWS}`);
  }
  if (maxImages < MIN_IMAGES || maxImages > MAX_IMAGES) {
    throw new Error(
      `maxImages must be between ${MIN_IMAGES} and ${MAX_IMAGES}`,
    );
  }
  return {
    maxColumns,
    maxRows,
    maxImages,
    quality: qualitySetting(config),
  };
}

export function loadSettings(cwd = process.cwd()): SixelConfig {
  const agentDir =
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
  const globalSettings = readJsonObject(join(agentDir, "settings.json"));
  const projectSettings = readJsonObject(join(cwd, ".pi", "settings.json"));
  return normalizeConfig({
    ...nestedConfig(globalSettings),
    ...nestedConfig(projectSettings),
  });
}
