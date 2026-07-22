import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionConfig } from "../shared/types.ts";
import { getAgentDir } from "../shared/utils.ts";
import { validateToolExtensionRegistry } from "../runs/shared/tool-extensions.ts";

export function getConfigPath(): string {
	return path.join(getAgentDir(), "extensions", "subagent", "config.json");
}

function readConfigForUpdate(configPath = getConfigPath()): ExtensionConfig {
	if (!fs.existsSync(configPath)) return {};
	let parsed: unknown;
	try {
		parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(
			`Subagent config at '${configPath}' is not valid JSON: ${message}`,
		);
	}
	if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
		throw new Error(`Subagent config at '${configPath}' must be a JSON object`);
	}
	return parsed as ExtensionConfig;
}

export function saveConfig(config: ExtensionConfig, configPath = getConfigPath()): void {
	fs.mkdirSync(path.dirname(configPath), { recursive: true });
	fs.writeFileSync(configPath, `${JSON.stringify(config, null, "\t")}\n`, "utf-8");
}

export function updateConfig(updater: (config: ExtensionConfig) => ExtensionConfig): ExtensionConfig {
	const configPath = getConfigPath();
	const next = updater(readConfigForUpdate(configPath));
	saveConfig(next, configPath);
	return next;
}

export function loadConfig(): ExtensionConfig {
	const configPath = getConfigPath();
	try {
		const config = readConfigForUpdate(configPath);
		if (config.toolExtensions !== undefined)
			validateToolExtensionRegistry(config.toolExtensions);
		return config;
	} catch (error) {
		console.error(`Failed to load subagent config from '${configPath}':`, error);
		throw error;
	};
}
