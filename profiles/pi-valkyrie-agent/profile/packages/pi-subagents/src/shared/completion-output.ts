export interface CompletionOutputBudget {
	bytes: number;
	lines: number;
}

export interface BoundedCompletionOutput {
	text: string;
	truncated: boolean;
}

export const MODEL_VISIBLE_COMPLETION_BUDGET: Readonly<CompletionOutputBudget> = {
	bytes: 50_000,
	lines: 200,
};

const COMPLETION_SUMMARY_BYTES = 40_000;
const COMPLETION_SUMMARY_LINES = 160;

export function completionItemBudget(itemCount: number): CompletionOutputBudget {
	const count = Math.max(1, itemCount);
	return {
		bytes: Math.max(1, Math.floor(COMPLETION_SUMMARY_BYTES / count)),
		lines: Math.max(1, Math.floor(COMPLETION_SUMMARY_LINES / count)),
	};
}

export function utf8Prefix(text: string, maxBytes: number): string {
	let bytes = 0;
	let result = "";
	for (const character of text) {
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes) break;
		result += character;
		bytes += characterBytes;
	}
	return result;
}

function utf8Suffix(text: string, maxBytes: number): string {
	let bytes = 0;
	const result: string[] = [];
	const characters = Array.from(text);
	for (let index = characters.length - 1; index >= 0; index--) {
		const character = characters[index]!;
		const characterBytes = Buffer.byteLength(character, "utf8");
		if (bytes + characterBytes > maxBytes) break;
		result.push(character);
		bytes += characterBytes;
	}
	return result.reverse().join("");
}

export function normalizeCompletionHint(hint: string | undefined, maxBytes = 512): string | undefined {
	const normalized = hint?.replace(/\s+/g, " ").trim();
	return normalized ? utf8Prefix(normalized, maxBytes) : undefined;
}

export function boundCompletionOutput(
	text: string,
	budget: CompletionOutputBudget = MODEL_VISIBLE_COMPLETION_BUDGET,
	recoveryHint?: string,
): BoundedCompletionOutput {
	const lines = text.split("\n");
	const bytes = Buffer.byteLength(text, "utf8");
	if (bytes <= budget.bytes && lines.length <= budget.lines) {
		return { text, truncated: false };
	}

	const safeRecoveryHint = normalizeCompletionHint(recoveryHint);
	let marker = `[TRUNCATED: ${lines.length} lines, ${bytes} bytes${safeRecoveryHint ? `; ${safeRecoveryHint}` : ""}]`;
	if (Buffer.byteLength(marker, "utf8") > budget.bytes) {
		marker = `[TRUNCATED: ${lines.length} lines, ${bytes} bytes]`;
	}
	if (Buffer.byteLength(marker, "utf8") > budget.bytes || budget.lines <= 1) {
		return {
			text: utf8Prefix("[TRUNCATED]", budget.bytes),
			truncated: true,
		};
	}

	const contentLineBudget = budget.lines - 1;
	const headLineCount = Math.ceil(contentLineBudget / 2);
	const tailLineCount = Math.floor(contentLineBudget / 2);
	const head = lines.slice(0, headLineCount).join("\n");
	const tail = tailLineCount > 0 ? lines.slice(-tailLineCount).join("\n") : "";
	const separatorBytes = (head ? 1 : 0) + (tail ? 1 : 0);
	const contentByteBudget = Math.max(0, budget.bytes - Buffer.byteLength(marker, "utf8") - separatorBytes);
	const headByteBudget = Math.ceil(contentByteBudget / 2);
	const tailByteBudget = Math.floor(contentByteBudget / 2);
	const boundedHead = utf8Prefix(head, headByteBudget);
	const boundedTail = utf8Suffix(tail, tailByteBudget);
	const parts = [boundedHead, marker, boundedTail].filter((part) => part.length > 0);
	const boundedText = parts.join("\n");

	if (Buffer.byteLength(boundedText, "utf8") > budget.bytes) {
		return {
			text: utf8Prefix("[TRUNCATED]", budget.bytes),
			truncated: true,
		};
	}
	return { text: boundedText, truncated: true };
}
