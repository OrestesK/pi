export type AssistantLike = {
	role?: string;
	content?: unknown;
};

type TextBlock = { type: "text"; text: string };

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isTextBlock(value: unknown): value is TextBlock {
	return (
		isRecord(value) && value.type === "text" && typeof value.text === "string"
	);
}

export function extractAssistantText(message: AssistantLike): string {
	const content = message.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(isTextBlock)
		.map((block) => block.text)
		.join("\n")
		.trim();
}

export type GoalMarkers = {
	done?: string;
	blocked?: string;
};

export function parseGoalMarkers(text: string): GoalMarkers {
	const markers: GoalMarkers = { done: undefined, blocked: undefined };
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		const done = /^GOAL_DONE:\s*(.+)$/i.exec(line);
		if (done?.[1]) markers.done = done[1].trim();
		const blocked = /^GOAL_BLOCKED:\s*(.+)$/i.exec(line);
		if (blocked?.[1]) markers.blocked = blocked[1].trim();
	}
	return markers;
}

export function isAllowedGoalBlocker(reason: string): boolean {
	const normalized = reason.toLowerCase();
	if (
		/\b(internal plan approval|plan approval|routine local work|minor\/reversible local edits|tests?|formatting|routine implementation choices|safe local|reversible next step)\b/.test(
			normalized,
		)
	) {
		return false;
	}
	const automaticBlocker =
		/\b(automatic|runtime|tool|command|guardrail)\b.*\b(blocked|blocker|denied|rejected)\b/.test(
			normalized,
		) ||
		/\b(blocked|blocker|denied|rejected)\b.*\b(automatic|runtime|tool|command|guardrail)\b/.test(
			normalized,
		);
	if (automaticBlocker) return true;
	if (
		/\b(unapproved|approval|approve|approved|permission|confirm|confirmation)\b/.test(
			normalized,
		)
	)
		return false;
	const missingCapability =
		/\b(missing|unavailable|lacking|lack|no)\b.*\b(tool|credential|credentials|auth|access|service)\b/.test(
			normalized,
		) ||
		/\b(tool|credential|credentials|auth|access|service)\b.*\b(missing|unavailable|required|needed)\b/.test(
			normalized,
		);
	return missingCapability;
}

export function detectDirectHumanQuestion(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed.endsWith("?")) return false;
	return /\b(should i|do you want|would you like|can i|may i|which|what should|please confirm|approve)\b/i.test(
		trimmed,
	);
}

export function assistantFingerprint(text: string): string {
	const normalized = text.trim().toLowerCase().replace(/\s+/g, " ");
	let hash = 2166136261;
	for (let index = 0; index < normalized.length; index += 1) {
		hash ^= normalized.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
}
