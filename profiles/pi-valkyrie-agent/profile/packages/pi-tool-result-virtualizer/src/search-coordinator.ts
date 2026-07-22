import type { SearchIndex } from "./search-index.ts";
import type { SearchIndexFactory, StoredSourceMetadata } from "./store.ts";

const FTS_QUERY_BYTE_LIMIT = 512;

function unicodeLength(text: string): number {
	return [...text].length;
}

function isAscii(text: string): boolean {
	return /^[\u0000-\u007f]*$/.test(text);
}

export class SearchCoordinator {
	readonly #root: string;
	readonly #searchIndexFactory: SearchIndexFactory;
	#searchIndexPromise: Promise<SearchIndex | undefined> | undefined;
	#searchIndexDisabled = false;

	constructor(root: string, searchIndexFactory: SearchIndexFactory) {
		this.#root = root;
		this.#searchIndexFactory = searchIndexFactory;
	}

	async candidateSources(
		query: string,
		entries: StoredSourceMetadata[],
	): Promise<StoredSourceMetadata[] | undefined> {
		if (
			this.#searchIndexDisabled ||
			unicodeLength(query) < 3 ||
			!isAscii(query) ||
			Buffer.byteLength(query, "utf8") > FTS_QUERY_BYTE_LIMIT
		)
			return undefined;
		try {
			const searchIndex = await this.getSearchIndex();
			if (searchIndex === undefined) return undefined;
			const candidateIds = new Set(
				searchIndex.candidateSourceIds(query, entries),
			);
			return [...entries]
				.reverse()
				.filter((entry) => candidateIds.has(entry.sourceId));
		} catch {
			this.#searchIndexDisabled = true;
			return undefined;
		}
	}

	async append(metadata: StoredSourceMetadata, text: string): Promise<void> {
		if (this.#searchIndexDisabled || this.#searchIndexPromise === undefined)
			return;
		try {
			const searchIndex = await this.getSearchIndex();
			searchIndex?.append(metadata, text);
		} catch {
			this.#searchIndexDisabled = true;
		}
	}

	private async getSearchIndex(): Promise<SearchIndex | undefined> {
		if (this.#searchIndexDisabled) return undefined;
		this.#searchIndexPromise ??= this.#searchIndexFactory(this.#root);
		const searchIndex = await this.#searchIndexPromise;
		if (searchIndex === undefined) this.#searchIndexDisabled = true;
		return searchIndex;
	}
}
