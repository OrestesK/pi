import { chmod, mkdir, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { StoredSourceMetadata } from "./store.ts";

type SqliteModule = typeof import("node:sqlite");
type DatabaseSync = import("node:sqlite").DatabaseSync;

type IndexRow = {
	id: number;
	sourceId: string;
	sha256: string;
};

type IndexState = {
	entryCount: number;
	lastSourceId: string | null;
	lastSha256: string | null;
};

export type SearchIndexInspection = {
	status: "missing" | "healthy" | "mismatch" | "unavailable";
	mismatchSourceIds: string[];
};

const SEARCH_INDEX_FILE = "search-index.sqlite";
const SCHEMA_VERSION = 3;

function stringField(
	row: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = row[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(
	row: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = row[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function quoteFtsPhrase(query: string): string {
	return `"${query.replaceAll('"', '""')}"`;
}

function toIndexRow(row: Record<string, unknown>): IndexRow | undefined {
	const id = numberField(row, "id");
	const sourceId = stringField(row, "source_id");
	const sha256 = stringField(row, "sha256");
	if (id === undefined || sourceId === undefined || sha256 === undefined)
		return undefined;
	return { id, sourceId, sha256 };
}

export class SearchIndex {
	readonly path: string;
	private readonly db: DatabaseSync;

	private constructor(db: DatabaseSync, path: string) {
		this.db = db;
		this.path = path;
	}

	static async inspect(
		root: string,
		entries: StoredSourceMetadata[],
	): Promise<SearchIndexInspection> {
		const dbPath = join(root, SEARCH_INDEX_FILE);
		try {
			await stat(dbPath);
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			) {
				return { status: "missing", mismatchSourceIds: [] };
			}
			throw error;
		}
		let sqlite: SqliteModule;
		try {
			sqlite = await import("node:sqlite");
		} catch {
			return { status: "unavailable", mismatchSourceIds: [] };
		}
		let db: DatabaseSync | undefined;
		try {
			db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
			const versionRow = db.prepare("PRAGMA user_version").get();
			if (versionRow === undefined)
				return {
					status: "mismatch",
					mismatchSourceIds: entries.map((entry) => entry.sourceId),
				};
			if (numberField(versionRow, "user_version") !== SCHEMA_VERSION)
				return {
					status: "mismatch",
					mismatchSourceIds: entries.map((entry) => entry.sourceId),
				};
			const rows = db
				.prepare(
					"SELECT id, source_id, sha256 FROM indexed_sources ORDER BY id",
				)
				.all()
				.map(toIndexRow)
				.filter((row) => row !== undefined);
			const rowsBySourceId = new Map(rows.map((row) => [row.sourceId, row]));
			const ftsRowIds = new Set(
				db
					.prepare("SELECT rowid FROM sources_fts")
					.all()
					.map((row) => numberField(row, "rowid"))
					.filter((rowId) => rowId !== undefined),
			);
			const mismatchSourceIds = entries.flatMap((entry) => {
				const row = rowsBySourceId.get(entry.sourceId);
				return row && row.sha256 === entry.sha256 && ftsRowIds.has(row.id)
					? []
					: [entry.sourceId];
			});
			return {
				status: mismatchSourceIds.length === 0 ? "healthy" : "mismatch",
				mismatchSourceIds,
			};
		} catch {
			return { status: "unavailable", mismatchSourceIds: [] };
		} finally {
			db?.close();
		}
	}

	static async open(root: string): Promise<SearchIndex | undefined> {
		const dbPath = join(root, SEARCH_INDEX_FILE);
		try {
			await stat(dbPath);
		} catch (error) {
			if (
				error instanceof Error &&
				"code" in error &&
				error.code === "ENOENT"
			)
				return undefined;
			throw error;
		}
		let sqlite: SqliteModule;
		try {
			sqlite = await import("node:sqlite");
		} catch {
			return undefined;
		}
		let db: DatabaseSync | undefined;
		try {
			db = new sqlite.DatabaseSync(dbPath, { readOnly: true });
			return new SearchIndex(db, dbPath);
		} catch {
			db?.close();
			return undefined;
		}
	}

	static async rebuildOffline(
		root: string,
		entries: StoredSourceMetadata[],
	): Promise<void> {
		let sqlite: SqliteModule;
		try {
			sqlite = await import("node:sqlite");
		} catch {
			throw new Error("SQLite FTS is unavailable");
		}
		await mkdir(root, { recursive: true, mode: 0o700 });
		await chmod(root, 0o700);
		const dbPath = join(root, SEARCH_INDEX_FILE);
		const db = new sqlite.DatabaseSync(dbPath);
		try {
			const index = new SearchIndex(db, dbPath);
			index.rebuild(entries);
			await chmod(dbPath, 0o600);
		} finally {
			db.close();
		}
	}

	close(): void {
		this.db.close();
	}

	isCurrent(entries: StoredSourceMetadata[]): boolean {
		try {
			return (
				this.schemaVersion() === SCHEMA_VERSION &&
				this.matchesState(this.indexState(), entries)
			);
		} catch {
			return false;
		}
	}

	candidateSourceIds(query: string): string[] {
		const rows = this.db
			.prepare(
				[
					"SELECT indexed_sources.source_id AS source_id",
					"FROM sources_fts",
					"JOIN indexed_sources ON indexed_sources.id = sources_fts.rowid",
					"WHERE sources_fts MATCH ?",
				].join(" "),
			)
			.all(quoteFtsPhrase(query));
		const ids: string[] = [];
		for (const row of rows) {
			const sourceId = stringField(row, "source_id");
			if (sourceId !== undefined) ids.push(sourceId);
		}
		return ids;
	}


	private ensureSchema(): void {
		const version = this.schemaVersion();
		if (version !== 0 && version !== SCHEMA_VERSION) this.dropSchema();
		this.db.exec(
			[
				"PRAGMA journal_mode=DELETE;",
				"PRAGMA synchronous=NORMAL;",
				"PRAGMA temp_store=MEMORY;",
				"PRAGMA busy_timeout=2000;",
				"CREATE TABLE IF NOT EXISTS indexed_sources (",
				"id INTEGER PRIMARY KEY,",
				"source_id TEXT UNIQUE NOT NULL,",
				"sha256 TEXT NOT NULL",
				");",
				"CREATE VIRTUAL TABLE IF NOT EXISTS sources_fts USING fts5(text, content='', tokenize='trigram');",
				"CREATE TABLE IF NOT EXISTS index_state (singleton INTEGER PRIMARY KEY CHECK (singleton = 1), entry_count INTEGER NOT NULL, last_source_id TEXT, last_sha256 TEXT);",
				`PRAGMA user_version=${SCHEMA_VERSION};`,
			].join("\n"),
		);
	}

	private schemaVersion(): number {
		const row = this.db.prepare("PRAGMA user_version").get();
		return row === undefined ? 0 : (numberField(row, "user_version") ?? 0);
	}

	private dropSchema(): void {
		this.db.exec(
			[
				"DROP TABLE IF EXISTS sources_fts;",
				"DROP TABLE IF EXISTS indexed_sources;",
				"DROP TABLE IF EXISTS index_state;",
				"PRAGMA user_version=0;",
			].join("\n"),
		);
	}

	private indexState(): IndexState | undefined {
		const row = this.db
			.prepare("SELECT entry_count, last_source_id, last_sha256 FROM index_state WHERE singleton = 1")
			.get() as Record<string, unknown> | undefined;
		if (row === undefined) return undefined;
		const entryCount = numberField(row, "entry_count");
		const lastSourceId = row.last_source_id === null ? null : stringField(row, "last_source_id");
		const lastSha256 = row.last_sha256 === null ? null : stringField(row, "last_sha256");
		return entryCount === undefined || lastSourceId === undefined || lastSha256 === undefined
			? undefined
			: { entryCount, lastSourceId, lastSha256 };
	}

	private matchesState(
		state: IndexState | undefined,
		entries: StoredSourceMetadata[],
	): boolean {
		if (state === undefined) return false;
		const last = entries.at(-1);
		const indexedCount = this.rowCount("indexed_sources");
		const ftsCount = this.rowCount("sources_fts");
		return state.entryCount === entries.length &&
			state.lastSourceId === (last?.sourceId ?? null) &&
			state.lastSha256 === (last?.sha256 ?? null) &&
			indexedCount === entries.length &&
			ftsCount === entries.length;
	}

	private rowCount(table: "indexed_sources" | "sources_fts"): number {
		const row = this.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as Record<string, unknown> | undefined;
		return row === undefined ? -1 : (numberField(row, "count") ?? -1);
	}

	private writeState(entries: StoredSourceMetadata[]): void {
		const last = entries.at(-1);
		this.db.prepare(
			"INSERT OR REPLACE INTO index_state(singleton, entry_count, last_source_id, last_sha256) VALUES (1, ?, ?, ?)",
		).run(entries.length, last?.sourceId ?? null, last?.sha256 ?? null);
	}

	private rebuild(entries: StoredSourceMetadata[]): void {
		this.db.exec("DROP TABLE IF EXISTS sources_fts");
		this.db.exec("DROP TABLE IF EXISTS indexed_sources");
		this.db.exec("DROP TABLE IF EXISTS index_state");
		this.ensureSchema();
		this.indexEntries(entries, 0);
	}

	private indexEntries(
		entries: StoredSourceMetadata[],
		startIndex: number,
	): void {
		if (startIndex >= entries.length) {
			this.writeState(entries);
			return;
		}
		this.db.exec("BEGIN");
		try {
			for (let index = startIndex; index < entries.length; index += 1) {
				const entry = entries[index];
				if (entry === undefined) continue;
				this.indexEntry(entry, readFileSync(entry.textPath, "utf8"), index + 1);
			}
			this.writeState(entries);
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private indexEntry(
		entry: StoredSourceMetadata,
		text: string,
		rowid: number,
	): void {
		const insertSource = this.db.prepare(
			[
				"INSERT INTO indexed_sources(id, source_id, sha256)",
				"VALUES (?, ?, ?)",
			].join(" "),
		);
		const insertFts = this.db.prepare(
			"INSERT INTO sources_fts(rowid, text) VALUES (?, ?)",
		);
		insertSource.run(rowid, entry.sourceId, entry.sha256);
		insertFts.run(rowid, text);
	}
}
