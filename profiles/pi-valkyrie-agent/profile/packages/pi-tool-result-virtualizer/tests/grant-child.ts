import { setTimeout as sleepFor } from "node:timers/promises";

import { resolveStoreAccess } from "../src/access.ts";
import {
	type GrantReservationRequest,
	RunBoundGrantRegistry,
} from "../src/grants.ts";
import { ProvenanceResolver } from "../src/provenance.ts";
import { ToolResultStore } from "../src/store.ts";
import { buildToolResultTools } from "../src/tools.ts";

function requiredEnv(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`Missing fixture environment: ${name}`);
	return value;
}

function jsonEnv(name: string): unknown {
	return JSON.parse(requiredEnv(name));
}

async function main(): Promise<void> {
	const root = requiredEnv("GRANT_ROOT");
	let signaledWait = false;
	const grants = new RunBoundGrantRegistry(root, {
		commitWaitMs: Number(process.env.GRANT_COMMIT_WAIT_MS ?? "0"),
		pollIntervalMs: 5,
		...(process.env.GRANT_SIGNAL_WAIT === "1"
			? {
					sleep: async (milliseconds: number) => {
						if (!signaledWait) {
							signaledWait = true;
							process.stdout.write("WAITING\n");
						}
						await sleepFor(milliseconds);
					},
				}
			: {}),
	});
	const mode = requiredEnv("GRANT_MODE");
	if (mode === "crash-before") process.exit(85);
	if (mode === "reserve-crash") {
		await grants.reserve(
			jsonEnv("GRANT_RESERVATION") as GrantReservationRequest,
		);
		process.exit(86);
	}
	if (mode !== "tool") throw new Error(`Unknown fixture mode: ${mode}`);

	const store = new ToolResultStore(root);
	const provenance = new ProvenanceResolver(root);
	const tools = buildToolResultTools(
		store,
		(context) => resolveStoreAccess(provenance, context, process.env),
		grants,
	);
	const toolName = requiredEnv("GRANT_TOOL");
	const tool = tools.find((candidate) => candidate.name === toolName);
	if (!tool) throw new Error(`Unknown fixture tool: ${toolName}`);
	const result = await tool.execute(
		"grant-process-fixture",
		jsonEnv("GRANT_PARAMS"),
		undefined,
		undefined,
		{ cwd: root },
	);
	process.stdout.write(`${JSON.stringify(result)}\n`);
}

main().catch((error: unknown) => {
	process.stderr.write(
		`${error instanceof Error ? error.message : String(error)}\n`,
	);
	process.exitCode = 1;
});
