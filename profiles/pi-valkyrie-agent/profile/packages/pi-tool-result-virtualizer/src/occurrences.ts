import {
	chmod,
	mkdir,
	readFile,
	readdir,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

import type { StoredSourceMetadata } from "./store.ts";

const OCCURRENCES_DIR = "occurrences";
const OCCURRENCES_FILE = "occurrences.jsonl";
const PENDING_DIR = "pending";
const RECORDS_DIR = "records";

export type OccurrenceMetadata = Pick<
	StoredSourceMetadata,
	| "sourceId"
	| "createdAt"
	| "toolCallId"
	| "inputSummary"
	| "originalPath"
	| "originalFullOutputPath"
	| "originalDetailsPath"
	| "originalDetailsByteCount"
	| "originalDetailsSha256"
	| "sessionId"
	| "subagentRunId"
	| "agentName"
>;

export type CaptureOccurrence = {
	occurrenceId: string;
	sourceId: string;
	createdAt: number;
	toolCallId?: string;
	inputSummary?: string;
	originalPath?: string;
	originalFullOutputPath?: string;
	originalDetailsPath?: string;
	originalDetailsByteCount?: number;
	originalDetailsSha256?: string;
	sessionId?: string;
	subagentRunId?: string;
	agentName?: string;
};

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function occurrenceFromMetadata(occurrenceId: string, metadata: OccurrenceMetadata): CaptureOccurrence {
	const occurrence: CaptureOccurrence = { occurrenceId, sourceId: metadata.sourceId, createdAt: metadata.createdAt };
	if (metadata.toolCallId !== undefined) occurrence.toolCallId = metadata.toolCallId;
	if (metadata.inputSummary !== undefined) occurrence.inputSummary = metadata.inputSummary;
	if (metadata.originalPath !== undefined) occurrence.originalPath = metadata.originalPath;
	if (metadata.originalFullOutputPath !== undefined) occurrence.originalFullOutputPath = metadata.originalFullOutputPath;
	if (metadata.originalDetailsPath !== undefined) occurrence.originalDetailsPath = metadata.originalDetailsPath;
	if (metadata.originalDetailsByteCount !== undefined) occurrence.originalDetailsByteCount = metadata.originalDetailsByteCount;
	if (metadata.originalDetailsSha256 !== undefined) occurrence.originalDetailsSha256 = metadata.originalDetailsSha256;
	if (metadata.sessionId !== undefined) occurrence.sessionId = metadata.sessionId;
	if (metadata.subagentRunId !== undefined) occurrence.subagentRunId = metadata.subagentRunId;
	if (metadata.agentName !== undefined) occurrence.agentName = metadata.agentName;
	return occurrence;
}

export class OccurrenceJournal {
	readonly directory: string;
	readonly path: string;
	private readonly pendingDirectory: string;
	private readonly recordsDirectory: string;

	constructor(root: string) {
		this.directory = join(root, OCCURRENCES_DIR);
		this.path = join(root, OCCURRENCES_FILE);
		this.pendingDirectory = join(this.directory, PENDING_DIR);
		this.recordsDirectory = join(this.directory, RECORDS_DIR);
	}

	private async ensureDirectory(): Promise<void> {
		await Promise.all([mkdir(this.directory, { recursive: true, mode: 0o700 }), mkdir(this.pendingDirectory, { recursive: true, mode: 0o700 }), mkdir(this.recordsDirectory, { recursive: true, mode: 0o700 })]);
		await Promise.all([chmod(this.directory, 0o700), chmod(this.pendingDirectory, 0o700), chmod(this.recordsDirectory, 0o700)]);
	}

	async prepare(occurrence: CaptureOccurrence, detailsText?: string): Promise<void> {
		await this.ensureDirectory();
		await writeFile(this.pendingPath(occurrence.occurrenceId), JSON.stringify(occurrence), { encoding: "utf8", flag: "wx", mode: 0o600 });
		if (detailsText !== undefined)
			await writeFile(this.detailsPath(occurrence.occurrenceId), detailsText, { encoding: "utf8", mode: 0o600 });
	}

	async publish(occurrence: CaptureOccurrence): Promise<void> {
		await this.ensureDirectory();
		const record = JSON.stringify(occurrence);
		try {
			await writeFile(this.recordPath(occurrence.occurrenceId), record, { encoding: "utf8", flag: "wx", mode: 0o600 });
		} catch (error) {
			if (!isMissing(error) && !(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
			if (!isMissing(error)) {
				const existing = await readFile(this.recordPath(occurrence.occurrenceId), "utf8");
				if (existing !== record) throw new Error("occurrence ID collision");
			}
		}
		await unlink(this.pendingPath(occurrence.occurrenceId)).catch((error: unknown) => { if (!isMissing(error)) throw error; });
	}

	async byteCount(): Promise<number> {
		const count = async (path: string): Promise<number> => {
			let entries;
			try { entries = await readdir(path, { withFileTypes: true }); }
			catch (error) { if (isMissing(error)) return 0; throw error; }
			let total = 0;
			for (const entry of entries) {
				const entryPath = join(path, entry.name);
				if (entry.isDirectory()) total += await count(entryPath);
				else if (entry.isFile()) total += (await stat(entryPath)).size;
			}
			return total;
		};
		return (await count(this.directory)) + (await stat(this.path).then((value) => value.size).catch((error: unknown) => { if (isMissing(error)) return 0; throw error; }));
	}

	async byteCountBySource(sourceIds: ReadonlySet<string>): Promise<number> {
		let total = 0;
		const add = async (text: string) => {
			let occurrence: CaptureOccurrence;
			try { occurrence = JSON.parse(text) as CaptureOccurrence; } catch { return; }
			if (!sourceIds.has(occurrence.sourceId)) return;
			total += Buffer.byteLength(text);
			if (occurrence.originalDetailsPath)
				total += await stat(occurrence.originalDetailsPath).then((value) => value.size).catch((error: unknown) => { if (isMissing(error)) return 0; throw error; });
		};
		try { for (const line of (await readFile(this.path, "utf8")).split("\n")) if (line) await add(`${line}\n`); } catch (error) { if (!isMissing(error)) throw error; }
		for (const name of await readdir(this.recordsDirectory).catch((error: unknown) => { if (isMissing(error)) return [] as string[]; throw error; }))
			if (name.endsWith(".json")) await add(await readFile(join(this.recordsDirectory, name), "utf8"));
		return total;
	}

	async recover(committedSourceIds: ReadonlySet<string>): Promise<void> {
		let entries: string[];
		try { entries = await readdir(this.pendingDirectory); } catch (error) { if (isMissing(error)) return; throw error; }
		for (const name of entries) {
			if (!name.endsWith(".json")) continue;
			const pendingPath = join(this.pendingDirectory, name);
			let occurrence: CaptureOccurrence;
			try { occurrence = JSON.parse(await readFile(pendingPath, "utf8")) as CaptureOccurrence; } catch { continue; }
			if (committedSourceIds.has(occurrence.sourceId)) await this.publish(occurrence);
			else {
				await unlink(this.detailsPath(occurrence.occurrenceId)).catch((error: unknown) => { if (!isMissing(error)) throw error; });
				await unlink(pendingPath);
			}
		}
	}

	detailsPath(occurrenceId: string): string { return join(this.directory, `${occurrenceId}.details.json`); }
	private pendingPath(occurrenceId: string): string { return join(this.pendingDirectory, `${occurrenceId}.json`); }
	private recordPath(occurrenceId: string): string { return join(this.recordsDirectory, `${occurrenceId}.json`); }
}
