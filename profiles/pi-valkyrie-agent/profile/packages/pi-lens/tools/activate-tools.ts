/**
 * pi_lens_activate_tools — compatibility catalog for pi's dynamic-tool hosts.
 *
 * This fork keeps every native tool active by default. The tool remains
 * additive and idempotent so existing prompts that call it continue to work
 * without hiding any currently active tool.
 */

import { Type } from "../clients/deps/typebox.js";

export interface ActivatableToolInfo {
	name: string;
	summary: string;
}

/** The subset of the host `pi` API this tool needs, kept minimal + optional
 * so it degrades cleanly on hosts that don't implement dynamic tooling. */
export type ActiveToolsHost = {
	getActiveTools?: () => string[];
	setActiveTools?: (names: string[]) => void;
};

export function createActivateToolsTool(
	pi: ActiveToolsHost,
	lazyTools: ActivatableToolInfo[],
) {
	const lazyNames = lazyTools.map((t) => t.name);
	const lazyNameSet = new Set(lazyNames);
	const catalog = lazyTools.map((t) => `${t.name} — ${t.summary}`).join("\n");

	return {
		name: "pi_lens_activate_tools" as const,
		label: "Activate pi-lens Tools",
		description:
			"Compatibility catalog for situational pi-lens tools. This fork keeps them active by default; calling this tool is additive and idempotent. " +
			`Available:\n${catalog}`,
		promptSnippet: "List or confirm active situational pi-lens tools",
		parameters: Type.Object({
			tools: Type.Array(Type.String({ enum: lazyNames }), {
				minItems: 1,
				description:
					"Names of situational tools to activate (see this tool's description for the catalog).",
			}),
		}),
		async execute(
			_toolCallId: string,
			params: Record<string, unknown>,
			_signal: AbortSignal | undefined,
			_onUpdate: unknown,
		) {
			const requested = Array.isArray(params.tools)
				? (params.tools as unknown[]).filter(
						(t): t is string => typeof t === "string" && lazyNameSet.has(t),
					)
				: [];

			if (requested.length === 0) {
				return {
					content: [
						{
							type: "text" as const,
							text: `No valid tool names given. Available: ${lazyNames.join(", ")}`,
						},
					],
					isError: true,
					details: { matches: [], added: [] },
				};
			}

			// Additive only, per the docs' contract: never drop currently active
			// tools in the same call.
			const active =
				typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
			const merged = [...new Set([...active, ...requested])];
			if (typeof pi.setActiveTools === "function") {
				pi.setActiveTools(merged);
			}

			return {
				content: [
					{
						type: "text" as const,
						text: `Activated: ${requested.join(", ")}. Available starting next turn.`,
					},
				],
				details: { matches: requested, added: requested },
			};
		},
	};
}
