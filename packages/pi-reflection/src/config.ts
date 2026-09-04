import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type ReflectionConfig = Readonly<{
	enabled: boolean;
	resourcesReady: boolean;
	providerId?: string;
	promptStartTrigger: boolean;
	intervalTrigger: boolean;
	turnInterval: number;
	agentEndTrigger: boolean;
	readinessTimeoutMs: number;
}>;

export const REFLECTION_CONFIG_KEY = "pi-reflection";

export const DEFAULT_REFLECTION_CONFIG: ReflectionConfig = Object.freeze({
	enabled: true,
	resourcesReady: false,
	promptStartTrigger: true,
	intervalTrigger: true,
	turnInterval: 4,
	agentEndTrigger: true,
	readinessTimeoutMs: 500,
});

const MAX_TIMER_DELAY_MS = 2_147_483_647;

type UnknownRecord = Record<string, unknown>;
type BooleanConfigKey =
	| "enabled"
	| "resourcesReady"
	| "promptStartTrigger"
	| "intervalTrigger"
	| "agentEndTrigger";
type IntegerConfigKey = "turnInterval" | "readinessTimeoutMs";

function isRecord(value: unknown): value is UnknownRecord {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJsonObject(path: string): UnknownRecord {
	if (!existsSync(path)) return {};
	const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
	if (!isRecord(parsed)) throw new Error(`${path} must contain a JSON object`);
	return parsed;
}

function nestedConfig(settings: UnknownRecord): UnknownRecord {
	const value = settings[REFLECTION_CONFIG_KEY];
	if (value === undefined) return {};
	if (!isRecord(value)) {
		throw new Error(`${REFLECTION_CONFIG_KEY} config must be an object`);
	}
	return value;
}

function optionalBoolean(
	raw: UnknownRecord,
	key: BooleanConfigKey,
	fallback: boolean,
): boolean {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (typeof value !== "boolean") throw new Error(`${key} must be boolean`);
	return value;
}

function optionalPositiveInteger(
	raw: UnknownRecord,
	key: IntegerConfigKey,
	fallback: number,
	maximum = Number.MAX_SAFE_INTEGER,
): number {
	const value = raw[key];
	if (value === undefined) return fallback;
	if (
		typeof value !== "number" ||
		!Number.isSafeInteger(value) ||
		value < 1 ||
		value > maximum
	) {
		throw new Error(`${key} must be an integer between 1 and ${maximum}`);
	}
	return value;
}

function optionalProviderId(raw: UnknownRecord): string | undefined {
	const value = raw.providerId;
	if (value === undefined) return undefined;
	if (
		typeof value !== "string" ||
		!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)
	) {
		throw new Error(
			"providerId must be 1-128 characters using letters, digits, '.', '_', or '-'",
		);
	}
	return value;
}

export function normalizeReflectionConfig(raw: unknown = {}): ReflectionConfig {
	if (!isRecord(raw)) throw new Error("pi-reflection config must be an object");
	const providerId = optionalProviderId(raw);

	return Object.freeze({
		enabled: optionalBoolean(raw, "enabled", DEFAULT_REFLECTION_CONFIG.enabled),
		resourcesReady: optionalBoolean(
			raw,
			"resourcesReady",
			DEFAULT_REFLECTION_CONFIG.resourcesReady,
		),
		...(providerId === undefined ? {} : { providerId }),
		promptStartTrigger: optionalBoolean(
			raw,
			"promptStartTrigger",
			DEFAULT_REFLECTION_CONFIG.promptStartTrigger,
		),
		intervalTrigger: optionalBoolean(
			raw,
			"intervalTrigger",
			DEFAULT_REFLECTION_CONFIG.intervalTrigger,
		),
		turnInterval: optionalPositiveInteger(
			raw,
			"turnInterval",
			DEFAULT_REFLECTION_CONFIG.turnInterval,
		),
		agentEndTrigger: optionalBoolean(
			raw,
			"agentEndTrigger",
			DEFAULT_REFLECTION_CONFIG.agentEndTrigger,
		),
		readinessTimeoutMs: optionalPositiveInteger(
			raw,
			"readinessTimeoutMs",
			DEFAULT_REFLECTION_CONFIG.readinessTimeoutMs,
			MAX_TIMER_DELAY_MS,
		),
	});
}

export function loadReflectionConfig(cwd = process.cwd()): ReflectionConfig {
	const agentDir =
		process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const globalConfig = nestedConfig(
		readJsonObject(join(agentDir, "settings.json")),
	);
	const projectConfig = nestedConfig(
		readJsonObject(join(cwd, ".pi", "settings.json")),
	);
	return normalizeReflectionConfig({ ...globalConfig, ...projectConfig });
}
