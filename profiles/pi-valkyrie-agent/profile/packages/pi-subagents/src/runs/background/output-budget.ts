const MODEL_VISIBLE_BYTE_LIMIT = 50_000;
const TRANSCRIPT_METADATA_BYTE_LIMIT = 10_000;
const OMISSION_NOTICE = "[… content omitted to fit the 50,000-byte model-visible output limit …]";

interface CompleteRecordPage<T> {
	total: number;
	offset: number;
	shown: number;
	remaining: number;
	records: T[];
	compact: boolean;
}

interface CompleteRecordPageOptions<T> {
	records: T[];
	offset: number;
	render: (page: CompleteRecordPage<T>) => string;
}

function byteLength(text: string): number {
	return Buffer.byteLength(text, "utf-8");
}

function utf8Prefix(text: string, maxBytes: number): string {
	const bytes = Buffer.from(text, "utf-8");
	if (bytes.length <= maxBytes) return text;
	let end = maxBytes;
	while (end > 0 && (bytes[end] & 0xc0) === 0x80) end--;
	return bytes.subarray(0, end).toString("utf-8");
}

function utf8Suffix(text: string, maxBytes: number): string {
	const bytes = Buffer.from(text, "utf-8");
	if (bytes.length <= maxBytes) return text;
	let start = bytes.length - maxBytes;
	while (start < bytes.length && (bytes[start] & 0xc0) === 0x80) start++;
	return bytes.subarray(start).toString("utf-8");
}

function prefixWithNotice(text: string, maxBytes: number): string {
	if (byteLength(text) <= maxBytes) return text;
	const separator = "\n";
	const prefixBytes = maxBytes - byteLength(separator) - byteLength(OMISSION_NOTICE);
	return `${utf8Prefix(text, Math.max(0, prefixBytes))}${separator}${OMISSION_NOTICE}`;
}

export function fitCompleteRecordPage<T>(options: CompleteRecordPageOptions<T>): { text: string; page: CompleteRecordPage<T> } {
	const total = options.records.length;
	const offset = Math.min(options.offset, total);
	let page: CompleteRecordPage<T> = { total, offset, shown: 0, remaining: total - offset, records: [], compact: false };
	let text = options.render(page);
	for (let shown = 1; offset + shown <= total; shown++) {
		const candidate: CompleteRecordPage<T> = {
			total,
			offset,
			shown,
			remaining: total - offset - shown,
			records: options.records.slice(offset, offset + shown),
			compact: false,
		};
		const candidateText = options.render(candidate);
		if (byteLength(candidateText) > MODEL_VISIBLE_BYTE_LIMIT) {
			if (shown === 1) {
				const compactCandidate = { ...candidate, compact: true };
				page = compactCandidate;
				text = options.render(compactCandidate);
			}
			break;
		}
		page = candidate;
		text = candidateText;
	}
	return { text: prefixWithNotice(text, MODEL_VISIBLE_BYTE_LIMIT), page };
}

export function fitMetadataAndNewestTail(metadataParts: string[], body?: string): string {
	const metadata = metadataParts.filter(Boolean).join("\n");
	if (!body) return prefixWithNotice(metadata, MODEL_VISIBLE_BYTE_LIMIT);

	const fittedMetadata = prefixWithNotice(metadata, TRANSCRIPT_METADATA_BYTE_LIMIT);
	const separator = "\n";
	const complete = `${fittedMetadata}${separator}${body}`;
	if (byteLength(complete) <= MODEL_VISIBLE_BYTE_LIMIT) return complete;

	const reservedBytes = byteLength(fittedMetadata) + byteLength(separator) * 2 + byteLength(OMISSION_NOTICE);
	const bodyBytes = Math.max(0, MODEL_VISIBLE_BYTE_LIMIT - reservedBytes);
	return `${fittedMetadata}${separator}${OMISSION_NOTICE}${separator}${utf8Suffix(body, bodyBytes)}`;
}
