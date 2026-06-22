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
	const approvalGate =
		/\b(unapproved|approval|approve|approved|permission|confirm|confirmation|required|need|needs)\b/.test(
			normalized,
		);
	const externalResource =
		/\b(production|remote|external-account|cloud|database|aws|gcp|azure|s3|slack|notion|google docs|google drive|gmail|calendar)\b/.test(
			normalized,
		);
	const mutation =
		/\b(mutation|mutate|write|update|delete|change|changes|modify|modification|trash|replace)\b/.test(
			normalized,
		);
	const privateRead =
		/\b(private|external-account|slack|notion|google docs|google drive|gmail|calendar)\b.*\b(read|content|discovery|search|source|access|inspect)\b/.test(
			normalized,
		) ||
		/\b(read|content|discovery|search|source|access|inspect)\b.*\b(private|external-account|slack|notion|google docs|google drive|gmail|calendar)\b/.test(
			normalized,
		);
	const crossSourceDiscovery =
		/\bcross-source\b.*\b(discovery|search|read|inspect)\b/.test(
			normalized,
		) ||
		/\b(discovery|search|read|inspect)\b.*\bcross-source\b/.test(
			normalized,
		);
	return (
		(approvalGate && externalResource && mutation) ||
		/\b(sudo|privileged|destructive|rm -rf|mutating git|git add|git checkout|git push|git commit|git merge|git rebase|git reset|git stash|git clean)\b/.test(
			normalized,
		) ||
		/\b(destructive|delete|deletion)\b.*\b(filesystem|file system|data)\b/.test(
			normalized,
		) ||
		(approvalGate && (privateRead || crossSourceDiscovery)) ||
		/\b(material|significant|not implied)\b.*\b(product|api|scope)\b.*\bdecision\b/.test(
			normalized,
		) ||
		/\b(product|api|scope)\b.*\bdecision\b.*\b(not implied|material|significant)\b/.test(
			normalized,
		) ||
		/\b(missing|unavailable|lacking|lack|no)\b.*\b(permission|tool|credential|credentials|auth|access|service)\b/.test(
			normalized,
		) ||
		/\b(permission|tool|credential|credentials|auth|access|service)\b.*\b(missing|unavailable|required|needed)\b/.test(
			normalized,
		)
	);
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
