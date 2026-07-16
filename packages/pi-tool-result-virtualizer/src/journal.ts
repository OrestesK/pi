import {
	access,
	chmod,
	mkdir,
	readdir,
	readFile,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

const SOURCE_ID_PATTERN = /^tr_[a-z0-9]+_(?:[a-f0-9]{8}|[a-f0-9]{32})$/;

export type JournalTransaction = {
	sourceId: string;
	hasDetails: boolean;
	journalPath: string;
	stagedSourcePath: string;
	stagedDetailsPath: string;
	finalSourcePath: string;
	finalDetailsPath: string;
};

export type JournalRecoveryReport = {
	recoveredTransactionCount: number;
	committedTransactionCount: number;
	unresolvedTransactionCount: number;
};

export type JournalInspection = {
	pendingTransactionCount: number;
	invalidJournalCount: number;
};

type JournalRecord = {
	version: 1;
	sourceId: string;
	hasDetails: boolean;
	ownerPid: number;
};

function isMissing(error: unknown): boolean {
	return error instanceof Error && "code" in error && error.code === "ENOENT";
}

async function pathExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch (error) {
		if (isMissing(error)) return false;
		throw error;
	}
}

async function unlinkIfPresent(path: string): Promise<void> {
	try {
		await unlink(path);
	} catch (error) {
		if (!isMissing(error)) throw error;
	}
}

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		return !(
			error instanceof Error &&
			"code" in error &&
			error.code === "ESRCH"
		);
	}
}

function parseJournalRecord(text: string): JournalRecord | undefined {
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return undefined;
	}
	if (!value || typeof value !== "object" || Array.isArray(value))
		return undefined;
	const record = value as Record<string, unknown>;
	if (
		record.version !== 1 ||
		typeof record.sourceId !== "string" ||
		!SOURCE_ID_PATTERN.test(record.sourceId) ||
		typeof record.hasDetails !== "boolean" ||
		typeof record.ownerPid !== "number" ||
		!Number.isSafeInteger(record.ownerPid) ||
		record.ownerPid <= 0
	) {
		return undefined;
	}
	return {
		version: 1,
		sourceId: record.sourceId,
		hasDetails: record.hasDetails,
		ownerPid: record.ownerPid,
	};
}

export class StoreJournal {
	private readonly root: string;
	private readonly transactionsDir: string;
	private readonly stagingDir: string;
	private readonly sourcesDir: string;
	private readonly detailsDir: string;

	constructor(root: string) {
		this.root = root;
		this.transactionsDir = join(root, "transactions");
		this.stagingDir = join(this.transactionsDir, "staging");
		this.sourcesDir = join(root, "sources");
		this.detailsDir = join(root, "details");
	}

	private transaction(
		sourceId: string,
		hasDetails: boolean,
	): JournalTransaction {
		return {
			sourceId,
			hasDetails,
			journalPath: join(this.transactionsDir, `${sourceId}.json`),
			stagedSourcePath: join(this.stagingDir, `${sourceId}.txt`),
			stagedDetailsPath: join(this.stagingDir, `${sourceId}.details.json`),
			finalSourcePath: join(this.sourcesDir, `${sourceId}.txt`),
			finalDetailsPath: join(this.detailsDir, `${sourceId}.json`),
		};
	}

	private async ensureDirectories(hasDetails: boolean): Promise<void> {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		await mkdir(this.transactionsDir, { recursive: true, mode: 0o700 });
		await mkdir(this.stagingDir, { recursive: true, mode: 0o700 });
		await mkdir(this.sourcesDir, { recursive: true, mode: 0o700 });
		if (hasDetails)
			await mkdir(this.detailsDir, { recursive: true, mode: 0o700 });
		await Promise.all([
			chmod(this.root, 0o700),
			chmod(this.transactionsDir, 0o700),
			chmod(this.stagingDir, 0o700),
			chmod(this.sourcesDir, 0o700),
			...(hasDetails ? [chmod(this.detailsDir, 0o700)] : []),
		]);
	}

	async begin(
		sourceId: string,
		hasDetails: boolean,
	): Promise<JournalTransaction> {
		if (!SOURCE_ID_PATTERN.test(sourceId))
			throw new Error("invalid tool-result source id for transaction journal");
		await this.ensureDirectories(hasDetails);
		const transaction = this.transaction(sourceId, hasDetails);
		const record: JournalRecord = {
			version: 1,
			sourceId,
			hasDetails,
			ownerPid: process.pid,
		};
		await writeFile(transaction.journalPath, `${JSON.stringify(record)}\n`, {
			flag: "wx",
			mode: 0o600,
		});
		return transaction;
	}

	async commit(transaction: JournalTransaction): Promise<void> {
		await unlinkIfPresent(transaction.stagedSourcePath);
		if (transaction.hasDetails)
			await unlinkIfPresent(transaction.stagedDetailsPath);
		await unlinkIfPresent(transaction.journalPath);
	}

	async rollback(transaction: JournalTransaction): Promise<void> {
		await unlinkIfPresent(transaction.stagedSourcePath);
		await unlinkIfPresent(transaction.stagedDetailsPath);
		await unlinkIfPresent(transaction.journalPath);
	}

	async inspect(): Promise<JournalInspection> {
		let entries: string[];
		try {
			entries = await readdir(this.transactionsDir);
		} catch (error) {
			if (isMissing(error))
				return { pendingTransactionCount: 0, invalidJournalCount: 0 };
			throw error;
		}
		let pendingTransactionCount = 0;
		let invalidJournalCount = 0;
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;
			const record = parseJournalRecord(
				await readFile(join(this.transactionsDir, entry), "utf8"),
			);
			if (record) pendingTransactionCount += 1;
			else invalidJournalCount += 1;
		}
		return { pendingTransactionCount, invalidJournalCount };
	}

	async recover(
		committedSourceIds: ReadonlySet<string>,
	): Promise<JournalRecoveryReport> {
		let entries: string[];
		try {
			entries = await readdir(this.transactionsDir);
		} catch (error) {
			if (isMissing(error))
				return {
					recoveredTransactionCount: 0,
					committedTransactionCount: 0,
					unresolvedTransactionCount: 0,
				};
			throw error;
		}
		const report: JournalRecoveryReport = {
			recoveredTransactionCount: 0,
			committedTransactionCount: 0,
			unresolvedTransactionCount: 0,
		};
		for (const entry of entries) {
			if (!entry.endsWith(".json")) continue;
			const journalPath = join(this.transactionsDir, entry);
			const record = parseJournalRecord(await readFile(journalPath, "utf8"));
			if (!record) {
				report.unresolvedTransactionCount += 1;
				continue;
			}
			const transaction = this.transaction(record.sourceId, record.hasDetails);
			if (isProcessAlive(record.ownerPid)) {
				report.unresolvedTransactionCount += 1;
				continue;
			}
			if (!committedSourceIds.has(record.sourceId)) {
				await this.rollback(transaction);
				report.recoveredTransactionCount += 1;
				continue;
			}
			const sourceExists = await pathExists(transaction.finalSourcePath);
			const detailsExist =
				!record.hasDetails || (await pathExists(transaction.finalDetailsPath));
			if (!sourceExists || !detailsExist) {
				report.unresolvedTransactionCount += 1;
				continue;
			}
			await this.commit(transaction);
			report.committedTransactionCount += 1;
		}
		return report;
	}
}
