import { capBytesWithMarker } from "./truncate.js";

export const PI_CONTEXT_SEARCH_TOOL = "context_mode_ctx_search";
export const PI_CONTEXT_BATCH_TOOL = "context_mode_ctx_batch_execute";
export const PI_SEARCH_OUTPUT_BUDGET_BYTES = 40 * 1024;
export const PI_BATCH_OUTPUT_BUDGET_BYTES = 80 * 1024;
export const PI_OUTPUT_BUDGET_NOTICE = "\n\n[context-mode output capped; full result remains indexed and searchable with ctx_search]";

function getBudgetForEvent(event) {
    if (event?.toolName !== "mcp")
        return undefined;
    switch (event?.input?.tool) {
        case PI_CONTEXT_SEARCH_TOOL:
            return PI_SEARCH_OUTPUT_BUDGET_BYTES;
        case PI_CONTEXT_BATCH_TOOL:
            return PI_BATCH_OUTPUT_BUDGET_BYTES;
        default:
            return undefined;
    }
}

function getSingleTextBlock(event) {
    if (!Array.isArray(event?.content) || event.content.length !== 1)
        return undefined;
    const block = event.content[0];
    if (block?.type !== "text" || typeof block.text !== "string")
        return undefined;
    return block;
}

export function buildPiOutputBudgetPatch(event) {
    const budget = getBudgetForEvent(event);
    if (budget === undefined)
        return undefined;
    const block = getSingleTextBlock(event);
    if (!block)
        return undefined;
    if (Buffer.byteLength(block.text, "utf8") <= budget)
        return undefined;
    return {
        content: [
            {
                ...block,
                text: capBytesWithMarker(block.text, budget, PI_OUTPUT_BUDGET_NOTICE),
            },
        ],
    };
}
