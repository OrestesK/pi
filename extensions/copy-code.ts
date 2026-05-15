import type { AssistantMessage } from "@mariozechner/pi-ai";
import {
	copyToClipboard,
	type ExtensionAPI,
	type ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";

interface CodeBlock {
	label: string;
	language: string;
	code: string;
	isShell: boolean;
}

function isShellLanguage(language: string): boolean {
	return [
		"",
		"bash",
		"sh",
		"shell",
		"zsh",
		"fish",
		"console",
		"terminal",
	].includes(language.toLowerCase());
}

function splitShellCommands(code: string): string[] {
	const rawCommands: string[] = [];
	let current = "";

	for (const rawLine of code.split(/\r?\n/)) {
		const line = rawLine.trimEnd();
		if (!line.trim() || line.trimStart().startsWith("#")) continue;

		if (current) current += " ";
		const continued = /(^|[^\\])\\$/.test(line);
		current += continued ? line.replace(/\\\s*$/, "").trim() : line.trim();

		if (!continued && current.trim()) {
			rawCommands.push(current.trim());
			current = "";
		}
	}

	if (current.trim()) rawCommands.push(current.trim());

	const commands: string[] = [];
	let cdCommand: string | undefined;
	for (const command of rawCommands) {
		if (/^cd\s+/.test(command) && !/[;&|]/.test(command)) {
			cdCommand = command;
			continue;
		}

		commands.push(cdCommand ? `(${cdCommand} && ${command})` : command);
	}

	if (commands.length === 0 && cdCommand) commands.push(cdCommand);
	return commands;
}

function extractFencedCodeBlocks(
	text: string,
): Array<Omit<CodeBlock, "label">> {
	const blocks: Array<Omit<CodeBlock, "label">> = [];
	const fenceRegex = /^```([^`\r\n]*)\r?\n([\s\S]*?)^```[ \t]*$/gm;

	let match: RegExpExecArray | null;
	while ((match = fenceRegex.exec(text)) !== null) {
		const language = (match[1] ?? "").trim();
		const code = (match[2] ?? "").replace(/\r?\n$/, "");
		if (!code.trim()) continue;

		if (isShellLanguage(language)) {
			for (const command of splitShellCommands(code)) {
				blocks.push({
					language: language || "bash",
					code: command,
					isShell: true,
				});
			}
		} else {
			blocks.push({ language, code, isShell: false });
		}
	}

	return blocks;
}

function assistantText(message: AssistantMessage): string {
	return message.content
		.filter(
			(content): content is { type: "text"; text: string } =>
				content.type === "text",
		)
		.map((content) => content.text)
		.join("\n");
}

function preview(code: string): string {
	const firstLine = code
		.split(/\r?\n/)
		.map((line) => line.trim())
		.find((line) => line.length > 0);
	const text = (firstLine ?? "(blank)").replace(/\s+/g, " ");
	return text.length > 72 ? `${text.slice(0, 69)}...` : text;
}

function collectCodeBlocks(
	ctx: ExtensionCommandContext,
	options: { includeRecent: boolean; includeCode: boolean },
): CodeBlock[] {
	const candidates: Array<Omit<CodeBlock, "label">> = [];
	const branch = ctx.sessionManager.getBranch();

	for (let entryIndex = branch.length - 1; entryIndex >= 0; entryIndex--) {
		const entry = branch[entryIndex];
		if (entry.type !== "message") continue;

		const message = entry.message;
		if (!("role" in message) || message.role !== "assistant") continue;

		candidates.push(...extractFencedCodeBlocks(assistantText(message)));
		if (!options.includeRecent) break;
		if (candidates.length >= 30) break;
	}

	const preferred = options.includeCode
		? candidates
		: candidates.filter((block) => block.isShell);
	const selected = preferred.length > 0 ? preferred : candidates;
	const seen = new Set<string>();
	const blocks: CodeBlock[] = [];

	for (const block of selected) {
		if (seen.has(block.code)) continue;
		seen.add(block.code);

		const number = blocks.length + 1;
		const language = block.language || "text";
		blocks.push({
			...block,
			label: `${number}. ${language} · ${preview(block.code)}`,
		});
	}

	return blocks;
}

async function copyBlock(
	block: CodeBlock,
	ctx: ExtensionCommandContext,
): Promise<void> {
	await copyToClipboard(block.code);
	ctx.ui.notify(
		`Copied ${block.language || "code"} block to clipboard`,
		"info",
	);
}

async function handleCopyCode(
	args: string,
	ctx: ExtensionCommandContext,
): Promise<void> {
	await ctx.waitForIdle();
	const argWords = args.trim().toLowerCase().split(/\s+/).filter(Boolean);
	const blocks = collectCodeBlocks(ctx, {
		includeRecent: !argWords.includes("last"),
		includeCode: argWords.includes("code") || argWords.includes("all-code"),
	});
	if (blocks.length === 0) {
		ctx.ui.notify(
			"No copyable code blocks found in recent assistant messages",
			"error",
		);
		return;
	}

	const requestedIndex = Number.parseInt(args.trim(), 10);
	if (
		Number.isInteger(requestedIndex) &&
		requestedIndex >= 1 &&
		requestedIndex <= blocks.length
	) {
		await copyBlock(blocks[requestedIndex - 1], ctx);
		return;
	}

	if (blocks.length === 1) {
		await copyBlock(blocks[0], ctx);
		return;
	}

	if (!ctx.hasUI) {
		ctx.ui.notify(
			`Found ${blocks.length} items; run interactively or pass a number, e.g. /cc 1`,
			"error",
		);
		return;
	}

	const choice = await ctx.ui.select(
		"Copy which command/code block?",
		blocks.map((block) => block.label),
	);
	if (!choice) return;

	const block = blocks.find((candidate) => candidate.label === choice);
	if (!block) return;

	await copyBlock(block, ctx);
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("cc", {
		description: "Copy a raw fenced code block from recent assistant messages",
		handler: handleCopyCode,
	});

	pi.registerCommand("copy-code", {
		description: "Copy a raw fenced code block from recent assistant messages",
		handler: handleCopyCode,
	});
}
