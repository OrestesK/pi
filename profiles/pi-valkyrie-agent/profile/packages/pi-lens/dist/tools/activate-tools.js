/**
 * pi_lens_activate_tools — compatibility catalog for pi's dynamic-tool hosts.
 *
 * This fork keeps every native tool active by default. The tool remains
 * additive and idempotent so existing prompts that call it continue to work
 * without hiding any currently active tool.
 */
import { Type } from "../clients/deps/typebox.js";
export function createActivateToolsTool(pi, lazyTools) {
    const lazyNames = lazyTools.map((t) => t.name);
    const lazyNameSet = new Set(lazyNames);
    const catalog = lazyTools.map((t) => `${t.name} — ${t.summary}`).join("\n");
    return {
        name: "pi_lens_activate_tools",
        label: "Activate pi-lens Tools",
        description: "Compatibility catalog for situational pi-lens tools. This fork keeps them active by default; calling this tool is additive and idempotent. " +
            `Available:\n${catalog}`,
        promptSnippet: "List or confirm active situational pi-lens tools",
        parameters: Type.Object({
            tools: Type.Array(Type.String({ enum: lazyNames }), {
                minItems: 1,
                description: "Names of situational tools to activate (see this tool's description for the catalog).",
            }),
        }),
        async execute(_toolCallId, params, _signal, _onUpdate) {
            const requested = Array.isArray(params.tools)
                ? params.tools.filter((t) => typeof t === "string" && lazyNameSet.has(t))
                : [];
            if (requested.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No valid tool names given. Available: ${lazyNames.join(", ")}`,
                        },
                    ],
                    isError: true,
                    details: { matches: [], added: [] },
                };
            }
            // Additive only, per the docs' contract: never drop currently active
            // tools in the same call.
            const active = typeof pi.getActiveTools === "function" ? pi.getActiveTools() : [];
            const merged = [...new Set([...active, ...requested])];
            if (typeof pi.setActiveTools === "function") {
                pi.setActiveTools(merged);
            }
            return {
                content: [
                    {
                        type: "text",
                        text: `Activated: ${requested.join(", ")}. Available starting next turn.`,
                    },
                ],
                details: { matches: requested, added: requested },
            };
        },
    };
}
