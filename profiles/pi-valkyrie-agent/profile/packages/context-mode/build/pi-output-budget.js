import { capBytesWithMarker } from "./truncate.js";

export const PI_CONTEXT_SEARCH_TOOL = "context_mode_ctx_search";
export const PI_CONTEXT_BATCH_TOOL = "context_mode_ctx_batch_execute";
export const PI_OUTPUT_BUDGET_BYTES = 80 * 1024;
export const PI_SEARCH_OUTPUT_BUDGET_BYTES = PI_OUTPUT_BUDGET_BYTES;
export const PI_BATCH_OUTPUT_BUDGET_BYTES = PI_OUTPUT_BUDGET_BYTES;
export const PI_OUTPUT_BUDGET_NOTICE =
	"\n\n[tool output capped at 80 KiB; request a narrower result to continue]";

function getBudgetForEvent() {
	return PI_OUTPUT_BUDGET_BYTES;
}

function capTextBlocks(content, budget) {
	const textBytes = content.reduce((total, block) => {
		return block?.type === "text" && typeof block.text === "string"
			? total + Buffer.byteLength(block.text, "utf8")
			: total;
	}, 0);
	if (textBytes <= budget) return undefined;
	const noticeBytes = Buffer.byteLength(PI_OUTPUT_BUDGET_NOTICE, "utf8");
	let remaining = Math.max(0, budget - noticeBytes);
	let truncated = false;
	const patchedContent = [];
	for (const block of content) {
		if (block?.type !== "text" || typeof block.text !== "string") {
			patchedContent.push(block);
			continue;
		}
		if (truncated) continue;
		const blockBytes = Buffer.byteLength(block.text, "utf8");
		if (blockBytes <= remaining) {
			patchedContent.push(block);
			remaining -= blockBytes;
			continue;
		}
		patchedContent.push({
			...block,
			text:
				capBytesWithMarker(block.text, remaining, "") + PI_OUTPUT_BUDGET_NOTICE,
		});
		truncated = true;
	}
	return patchedContent;
}

export function buildPiOutputBudgetPatch(event) {
	const budget = getBudgetForEvent();
	if (budget === undefined || !Array.isArray(event?.content)) return undefined;
	const content = capTextBlocks(event.content, budget);
	return content ? { content } : undefined;
}
