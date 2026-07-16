import { homedir } from "node:os";
import { join } from "node:path";

export type StoreLimits = {
	maxSources?: number;
	maxStoredBytes?: number;
};

function envPath(env: NodeJS.ProcessEnv, name: string): string | undefined {
	const value = env[name];
	return value && value.trim().length > 0 ? value : undefined;
}

function positiveIntegerEnv(
	env: NodeJS.ProcessEnv,
	name: string,
): number | undefined {
	const raw = envPath(env, name);
	if (raw === undefined) return undefined;
	const value = Number(raw);
	if (!Number.isSafeInteger(value) || value <= 0)
		throw new Error(`${name} must be a positive integer`);
	return value;
}

export function resolveStoreLimits(
	env: NodeJS.ProcessEnv = process.env,
): StoreLimits {
	const limits: StoreLimits = {};
	const maxSources = positiveIntegerEnv(
		env,
		"PI_TOOL_RESULT_VIRTUALIZER_MAX_SOURCES",
	);
	const maxStoredBytes = positiveIntegerEnv(
		env,
		"PI_TOOL_RESULT_VIRTUALIZER_MAX_STORED_BYTES",
	);
	if (maxSources !== undefined) limits.maxSources = maxSources;
	if (maxStoredBytes !== undefined) limits.maxStoredBytes = maxStoredBytes;
	return limits;
}

export function resolveStoreRoot(
	env: NodeJS.ProcessEnv = process.env,
	home = homedir(),
): string {
	const explicitRoot = envPath(env, "PI_TOOL_RESULT_VIRTUALIZER_DIR");
	return explicitRoot ?? join(home, ".pi", "tool-result-virtualizer");
}

export function defaultStoreRoot(): string {
	return resolveStoreRoot();
}
