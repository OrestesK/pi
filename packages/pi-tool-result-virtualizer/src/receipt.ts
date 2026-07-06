export type ParsedToolResultVirtualizerReceipt =
	| {
		kind: "stored";
		toolName: string;
		sourceId: string;
		captureStatus?: string;
		lineCount?: number;
		previewLines: string[];
	}
	| {
		kind: "failure";
		toolName: string;
		byteCountText?: string;
		lineCount?: number;
		failureLines: string[];
	};

const RECEIPT_PREFIX = "[tool-result-virtualizer]";
const STORED_HEADER = /^\[tool-result-virtualizer\] Large (.+) result stored locally$/;
const FAILURE_HEADER = /^\[tool-result-virtualizer\] Large (.+) result failed before local storage completed$/;
const CAPTURE_LINE = /^Capture: ([^;]+); size: .+?, ([\d,]+) lines; sha256: /;
const WITHHELD_LINE = /^Original content withheld: (.+), ([\d,]+) lines$/;

function parseLineCount(value: string | undefined): number | undefined {
	if (value === undefined) return undefined;
	const parsed = Number.parseInt(value.replace(/,/g, ""), 10);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function parseStoredReceipt(lines: string[]): ParsedToolResultVirtualizerReceipt | undefined {
	const header = lines[0]?.match(STORED_HEADER);
	if (!header) return undefined;
	const source = lines.find((line) => line.startsWith("Source: "))?.slice("Source: ".length).trim();
	if (!source) return undefined;
	const capture = lines.find((line) => line.startsWith("Capture: "))?.match(CAPTURE_LINE);
	const previewLines: string[] = [];
	let inCroppedPreview = false;

	for (const line of lines) {
		if (line === "## Cropped preview") {
			inCroppedPreview = true;
			continue;
		}
		if (line.startsWith("## Choose before relying")) break;
		if (!inCroppedPreview) continue;
		if (line.length === 0 || line.startsWith("Preview only")) continue;
		if (line.startsWith("Sampled ") || line.startsWith("[omitted ")) {
			previewLines.push(line);
			continue;
		}
		if (line.startsWith("### ")) {
			previewLines.push(line.slice(4));
			continue;
		}
		if (/^\d+:\s?/.test(line)) previewLines.push(line);
	}

	const result: Extract<ParsedToolResultVirtualizerReceipt, { kind: "stored" }> = {
		kind: "stored",
		toolName: header[1] ?? "tool",
		sourceId: source,
		previewLines,
	};
	if (capture?.[1] !== undefined) result.captureStatus = capture[1];
	const lineCount = parseLineCount(capture?.[2]);
	if (lineCount !== undefined) result.lineCount = lineCount;
	return result;
}

function parseFailureReceipt(lines: string[]): ParsedToolResultVirtualizerReceipt | undefined {
	const header = lines[0]?.match(FAILURE_HEADER);
	if (!header) return undefined;
	const withheld = lines.find((line) => line.startsWith("Original content withheld: "));
	const noSource = lines.find((line) => line.startsWith("No source id was created."));
	if (!withheld || !noSource) return undefined;
	const withheldMatch = withheld.match(WITHHELD_LINE);

	const result: Extract<ParsedToolResultVirtualizerReceipt, { kind: "failure" }> = {
		kind: "failure",
		toolName: header[1] ?? "tool",
		failureLines: [withheld, noSource],
	};
	if (withheldMatch?.[1] !== undefined) result.byteCountText = withheldMatch[1];
	const lineCount = parseLineCount(withheldMatch?.[2]);
	if (lineCount !== undefined) result.lineCount = lineCount;
	return result;
}

export function parseToolResultVirtualizerReceipt(text: string): ParsedToolResultVirtualizerReceipt | undefined {
	if (!text.startsWith(RECEIPT_PREFIX)) return undefined;
	const lines = text.split(/\r?\n/);
	return parseStoredReceipt(lines) ?? parseFailureReceipt(lines);
}
