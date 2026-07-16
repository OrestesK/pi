import type { SourceRead } from "./store.ts";
import { byteLength, byteSafePrefix } from "./formatting.ts";

const OUTLINE_SAMPLE_LINE_BYTE_LIMIT = 256;
const OUTLINE_KEYWORDS = [
	"error",
	"warn",
	"fail",
	"exception",
	"traceback",
	"panic",
	"fatal",
	"timeout",
	"denied",
	"refused",
] as const;

type OutlineKeywordHit = {
	keyword: string;
	lineNumber: number;
	line: string;
};

type PreviewRange = {
	labels: string[];
	startIndex: number;
	endIndex: number;
};

export type SourcePreviewBlock = {
	labels: string[];
	startLine: number;
	endLine: number;
	lines: string[];
};

export type SourcePreview = {
	text: string;
	lineCount: number;
	sampledLineCount: number;
	omittedLineCount: number;
	blocks: SourcePreviewBlock[];
};

export type SourceOutline = {
	text: string;
	omittedMiddleLineCount: number;
	keywordHitCount: number;
};

function splitSourceLines(text: string): string[] {
	if (text.length === 0) return [];
	const lines = text.split("\n");
	if (lines.at(-1) === "") lines.pop();
	return lines;
}

function capSampleLine(line: string, byteLimit: number): string {
	if (byteLength(line) <= byteLimit) return line;
	const marker = " ... [line capped]";
	return `${byteSafePrefix(line, byteLimit - byteLength(marker))}${marker}`;
}

function capOutlineLine(line: string): string {
	return capSampleLine(line, OUTLINE_SAMPLE_LINE_BYTE_LIMIT);
}

function formatNumberedLine(
	lines: string[],
	index: number,
	byteLimit = OUTLINE_SAMPLE_LINE_BYTE_LIMIT,
): string {
	return `${index + 1}: ${capSampleLine(lines[index] ?? "", byteLimit)}`;
}

function sampleLineBlock(
	lines: string[],
	startIndex: number,
	count: number,
): string[] {
	return Array.from({ length: count }, (_unused, offset) =>
		formatNumberedLine(lines, startIndex + offset),
	);
}

function addRange(
	ranges: PreviewRange[],
	label: string,
	lineCount: number,
	startIndex: number,
	count: number,
): void {
	if (lineCount === 0 || count <= 0) return;
	const boundedStart = Math.max(0, Math.min(startIndex, lineCount));
	const boundedEnd = Math.max(
		boundedStart,
		Math.min(boundedStart + count, lineCount),
	);
	if (boundedEnd <= boundedStart) return;
	ranges.push({
		labels: [label],
		startIndex: boundedStart,
		endIndex: boundedEnd,
	});
}

function mergePreviewRanges(ranges: PreviewRange[]): PreviewRange[] {
	const sorted = [...ranges].sort(
		(left, right) =>
			left.startIndex - right.startIndex || left.endIndex - right.endIndex,
	);
	const merged: PreviewRange[] = [];
	for (const range of sorted) {
		const previous = merged.at(-1);
		if (previous === undefined || range.startIndex > previous.endIndex) {
			merged.push({
				labels: [...range.labels],
				startIndex: range.startIndex,
				endIndex: range.endIndex,
			});
			continue;
		}
		previous.endIndex = Math.max(previous.endIndex, range.endIndex);
		for (const label of range.labels) {
			if (!previous.labels.includes(label)) previous.labels.push(label);
		}
	}
	return merged;
}

function previewLabel(labels: string[]): string {
	const [first = "Sample", ...rest] = labels;
	return [first[0]?.toUpperCase() + first.slice(1), ...rest].join("/");
}

export function sampleSourcePreview(
	text: string,
	options: {
		headLineCount: number;
		middleLineCount: number;
		tailLineCount: number;
		lineByteLimit: number;
	},
): Omit<SourcePreview, "text"> {
	const lines = splitSourceLines(text);
	const lineCount = lines.length;
	const ranges: PreviewRange[] = [];
	const headCount = Math.min(
		Math.max(0, Math.floor(options.headLineCount)),
		lineCount,
	);
	const middleCount = Math.min(
		Math.max(0, Math.floor(options.middleLineCount)),
		lineCount,
	);
	const tailCount = Math.min(
		Math.max(0, Math.floor(options.tailLineCount)),
		lineCount,
	);
	addRange(ranges, "head", lineCount, 0, headCount);
	addRange(
		ranges,
		"middle",
		lineCount,
		Math.floor((lineCount - middleCount) / 2),
		middleCount,
	);
	addRange(ranges, "tail", lineCount, lineCount - tailCount, tailCount);
	const blocks = mergePreviewRanges(ranges).map(
		(range): SourcePreviewBlock => ({
			labels: range.labels,
			startLine: range.startIndex + 1,
			endLine: range.endIndex,
			lines: Array.from(
				{ length: range.endIndex - range.startIndex },
				(_unused, offset) =>
					formatNumberedLine(
						lines,
						range.startIndex + offset,
						options.lineByteLimit,
					),
			),
		}),
	);
	const sampledLineCount = blocks.reduce(
		(sum, block) => sum + block.lines.length,
		0,
	);
	return {
		lineCount,
		sampledLineCount,
		omittedLineCount: Math.max(0, lineCount - sampledLineCount),
		blocks,
	};
}

export function formatSourcePreview(
	text: string,
	options: {
		headLineCount: number;
		middleLineCount: number;
		tailLineCount: number;
		lineByteLimit: number;
	},
): SourcePreview {
	const preview = sampleSourcePreview(text, options);
	const lines = [
		"## Cropped preview",
		"Preview only — not complete evidence. Search, then get cited lines before claiming hidden content.",
		`Sampled ${preview.sampledLineCount} of ${preview.lineCount} lines; omitted ${preview.omittedLineCount} hidden lines.`,
	];
	let previousEndLine = 0;
	for (const block of preview.blocks) {
		const omittedBetween = block.startLine - previousEndLine - 1;
		if (omittedBetween > 0)
			lines.push(`[omitted ${omittedBetween} lines between samples]`);
		lines.push(
			`### ${previewLabel(block.labels)} lines ${block.startLine}-${block.endLine}`,
		);
		lines.push(...block.lines);
		previousEndLine = block.endLine;
	}
	const omittedAfter = preview.lineCount - previousEndLine;
	if (omittedAfter > 0)
		lines.push(`[omitted ${omittedAfter} lines after samples]`);
	return { ...preview, text: lines.join("\n") };
}

function findOutlineKeywordHits(
	lines: string[],
	limit: number,
): OutlineKeywordHit[] {
	const hits: OutlineKeywordHit[] = [];
	for (const keyword of OUTLINE_KEYWORDS) {
		if (hits.length >= limit) break;
		const lowerKeyword = keyword.toLowerCase();
		const index = lines.findIndex((line) =>
			line.toLowerCase().includes(lowerKeyword),
		);
		if (index === -1) continue;
		hits.push({
			keyword,
			lineNumber: index + 1,
			line: capOutlineLine(lines[index] ?? ""),
		});
	}
	return hits;
}

export function formatSourceOutline(
	source: SourceRead,
	headLineCount: number,
	tailLineCount: number,
	keywordLimit: number,
): SourceOutline {
	const lines = splitSourceLines(source.text);
	const headCount = Math.min(headLineCount, lines.length);
	const tailStart = Math.max(headCount, lines.length - tailLineCount);
	const tailCount = Math.max(0, lines.length - tailStart);
	const omittedMiddleLineCount = Math.max(
		0,
		lines.length - headCount - tailCount,
	);
	const keywordHits = findOutlineKeywordHits(lines, keywordLimit);
	const keywordBlock =
		keywordHits.length === 0
			? ["- no broad keyword hits"]
			: keywordHits.map(
					(hit) => `- ${hit.keyword}: line ${hit.lineNumber}: ${hit.line}`,
				);
	const headBlock =
		headCount === 0 ? ["(none)"] : sampleLineBlock(lines, 0, headCount);
	const tailBlock =
		tailCount === 0 ? ["(none)"] : sampleLineBlock(lines, tailStart, tailCount);
	return {
		text: [
			`# Tool-result outline ${source.metadata.sourceId}`,
			`Tool: ${source.metadata.toolName}; capture: ${source.metadata.captureStatus}; bytes: ${source.metadata.byteCount}; lines: ${source.metadata.lineCount}; sha256:${source.metadata.sha256.slice(0, 12)}`,
			"Deterministic triage only. Source remains local; use focused search and bounded get windows for evidence.",
			"",
			"## Keyword scan",
			"Whole source scanned case-insensitively for broad diagnostic terms.",
			...keywordBlock,
			"",
			`## Head sample (${headCount} lines)`,
			...headBlock,
			"",
			`## Tail sample (${tailCount} lines)`,
			...tailBlock,
			"",
			"## Not returned by outline",
			`- Full source text and ${omittedMiddleLineCount} unsampled middle lines.`,
			`- Any content beyond ${OUTLINE_SAMPLE_LINE_BYTE_LIMIT} bytes in sampled or keyword-hit lines.`,
			"- Original details sidecar JSON, if present.",
			`Next: tool_result_search sourceId:"${source.metadata.sourceId}" query:"..."; then use bounded tool_result_get windows for cited lines.`,
		].join("\n"),
		omittedMiddleLineCount,
		keywordHitCount: keywordHits.length,
	};
}
