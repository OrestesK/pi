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
		visibleEntries: StoredSourceMetadata[],
		allEntries: StoredSourceMetadata[],
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
			if (
				searchIndex === undefined ||
				!searchIndex.isCurrent(allEntries)
			)
				return undefined;
			const candidateIds = new Set(searchIndex.candidateSourceIds(query));
			return [...visibleEntries]
				.reverse()
				.filter((entry) => candidateIds.has(entry.sourceId));
		} catch {
			this.#searchIndexDisabled = true;
			return undefined;
		}
	}


	private async getSearchIndex(): Promise<SearchIndex | undefined> {
		if (this.#searchIndexDisabled) return undefined;
		this.#searchIndexPromise ??= this.#searchIndexFactory(this.#root);
		const searchIndex = await this.#searchIndexPromise;
		if (searchIndex === undefined) this.#searchIndexPromise = undefined;
		return searchIndex;
	}
}
