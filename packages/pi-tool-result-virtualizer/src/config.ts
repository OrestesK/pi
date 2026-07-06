import { homedir } from "node:os";
import { join } from "node:path";

function envPath(env: NodeJS.ProcessEnv, name: string): string | undefined {
	const value = env[name];
	return value && value.trim().length > 0 ? value : undefined;
}

export function resolveStoreRoot(env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
	const explicitRoot = envPath(env, "PI_TOOL_RESULT_VIRTUALIZER_DIR");
	return explicitRoot ?? join(home, ".pi", "tool-result-virtualizer");
}

export function defaultStoreRoot(): string {
	return resolveStoreRoot();
}
