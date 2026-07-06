import { chmod, mkdir } from "node:fs/promises";
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

const SEARCH_INDEX_FILE = "search-index.sqlite";
const SCHEMA_VERSION = 2;

function stringField(row: Record<string, unknown>, key: string): string | undefined {
	const value = row[key];
	return typeof value === "string" ? value : undefined;
}

function numberField(row: Record<string, unknown>, key: string): number | undefined {
	const value = row[key];
	return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function quoteFtsPhrase(query: string): string {
	return `"${query.replaceAll('"', '""')}"`;
}

function toIndexRow(row: Record<string, unknown>): IndexRow | undefined {
	const id = numberField(row, "id");
	const sourceId = stringField(row, "source_id");
	const sha256 = stringField(row, "sha256");
	if (id === undefined || sourceId === undefined || sha256 === undefined) return undefined;
	return { id, sourceId, sha256 };
}

export class SearchIndex {
	readonly path: string;
	private readonly db: DatabaseSync;

	private constructor(db: DatabaseSync, path: string) {
		this.db = db;
		this.path = path;
	}

	static async create(root: string): Promise<SearchIndex | undefined> {
		let sqlite: SqliteModule;
		try {
			sqlite = await import("node:sqlite");
		} catch {
			return undefined;
		}
		await mkdir(root, { recursive: true, mode: 0o700 });
		await chmod(root, 0o700);
		const dbPath = join(root, SEARCH_INDEX_FILE);
		let db: DatabaseSync | undefined;
		try {
			db = new sqlite.DatabaseSync(dbPath);
			const index = new SearchIndex(db, dbPath);
			index.initialize();
			await chmod(dbPath, 0o600);
			return index;
		} catch {
			db?.close();
			return undefined;
		}
	}

	close(): void {
		this.db.close();
	}

	sync(entries: StoredSourceMetadata[]): void {
		this.ensureSchema();
		const rows = this.indexRows();
		if (!this.matchesPrefix(rows, entries) || !this.matchesFtsRows(rows)) {
			this.rebuild(entries);
			return;
		}
		if (rows.length < entries.length) this.indexEntries(entries, rows.length);
	}

	candidateSourceIds(query: string, entries: StoredSourceMetadata[]): string[] {
		this.sync(entries);
		const rows = this.db.prepare([
			"SELECT indexed_sources.source_id AS source_id",
			"FROM sources_fts",
			"JOIN indexed_sources ON indexed_sources.id = sources_fts.rowid",
			"WHERE sources_fts MATCH ?",
		].join(" ")).all(quoteFtsPhrase(query));
		const ids: string[] = [];
		for (const row of rows) {
			const sourceId = stringField(row, "source_id");
			if (sourceId !== undefined) ids.push(sourceId);
		}
		return ids;
	}

	append(entry: StoredSourceMetadata, text: string): void {
		this.ensureSchema();
		const rows = this.indexRows();
		if (rows.some((row) => row.sourceId === entry.sourceId)) return;
		this.db.exec("BEGIN");
		try {
			this.indexEntry(entry, text, rows.length + 1);
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private initialize(): void {
		this.ensureSchema();
		this.db.exec("CREATE VIRTUAL TABLE __trigram_probe USING fts5(value, tokenize='trigram')");
		this.db.exec("DROP TABLE __trigram_probe");
	}

	private ensureSchema(): void {
		const version = this.schemaVersion();
		if (version !== 0 && version !== SCHEMA_VERSION) this.dropSchema();
		this.db.exec([
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
			`PRAGMA user_version=${SCHEMA_VERSION};`,
		].join("\n"));
	}

	private schemaVersion(): number {
		const row = this.db.prepare("PRAGMA user_version").get();
		return row === undefined ? 0 : numberField(row, "user_version") ?? 0;
	}

	private dropSchema(): void {
		this.db.exec([
			"DROP TABLE IF EXISTS sources_fts;",
			"DROP TABLE IF EXISTS indexed_sources;",
			"PRAGMA user_version=0;",
		].join("\n"));
	}

	private indexRows(): IndexRow[] {
		const rows = this.db.prepare("SELECT id, source_id, sha256 FROM indexed_sources ORDER BY id").all();
		return rows.map(toIndexRow).filter((row) => row !== undefined);
	}

	private matchesPrefix(rows: IndexRow[], entries: StoredSourceMetadata[]): boolean {
		if (rows.length > entries.length) return false;
		return rows.every((row, index) => {
			const entry = entries[index];
			return entry !== undefined
				&& row.id === index + 1
				&& row.sourceId === entry.sourceId
				&& row.sha256 === entry.sha256;
		});
	}

	private matchesFtsRows(rows: IndexRow[]): boolean {
		const ftsRows = this.db.prepare("SELECT rowid FROM sources_fts ORDER BY rowid").all();
		if (ftsRows.length !== rows.length) return false;
		return ftsRows.every((row, index) => numberField(row, "rowid") === rows[index]?.id);
	}

	private rebuild(entries: StoredSourceMetadata[]): void {
		this.db.exec("DROP TABLE IF EXISTS sources_fts");
		this.db.exec("DROP TABLE IF EXISTS indexed_sources");
		this.ensureSchema();
		this.indexEntries(entries, 0);
	}

	private indexEntries(entries: StoredSourceMetadata[], startIndex: number): void {
		if (startIndex >= entries.length) return;
		this.db.exec("BEGIN");
		try {
			for (let index = startIndex; index < entries.length; index += 1) {
				const entry = entries[index];
				if (entry === undefined) continue;
				this.indexEntry(entry, readFileSync(entry.textPath, "utf8"), index + 1);
			}
			this.db.exec("COMMIT");
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private indexEntry(entry: StoredSourceMetadata, text: string, rowid: number): void {
		const insertSource = this.db.prepare([
			"INSERT INTO indexed_sources(id, source_id, sha256)",
			"VALUES (?, ?, ?)",
		].join(" "));
		const insertFts = this.db.prepare("INSERT INTO sources_fts(rowid, text) VALUES (?, ?)");
		insertSource.run(rowid, entry.sourceId, entry.sha256);
		insertFts.run(rowid, text);
	}
}
