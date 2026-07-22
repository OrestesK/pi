/**
 * Fact-provider-specific tree-sitter helper (#402).
 *
 * The generic node-walk utilities (`walk`, `childrenOfType`, `firstChildOfType`,
 * `parseTreeSitterRoot`, `TsNode`) live in `clients/tree-sitter-shared.ts` so both
 * the fact extractors and the complexity client share them. This module re-exports
 * them for the extractors and adds the FactProvider-specific `extractFactsFromTree`
 * shell.
 */
import { childrenOfType, firstChildOfType, parseTreeSitterRoot, walk, } from "../../tree-sitter-shared.js";
export { childrenOfType, firstChildOfType, walk, };
/** Parse `content` for `filePath` into a root node (or null). Alias of the shared helper. */
export const parseFactTree = parseTreeSitterRoot;
/**
 * Provider shell for tree-sitter-backed fact extractors: read `file.content`,
 * parse via the shared client, and hand the root node to `extract`. On empty
 * content / parse failure / wasm abort it writes the empty `defaults` and returns
 * (there is no typescript-compiler fallback by design, #402). Centralising this
 * keeps each provider to just its extraction logic (and de-duplicates the prologue).
 */
export async function extractFactsFromTree(ctx, store, defaults, extract) {
    const writeAll = (facts) => {
        for (const key of Object.keys(defaults)) {
            store.setFileFact(ctx.filePath, key, facts[key] ?? defaults[key]);
        }
    };
    const content = store.getFileFact(ctx.filePath, "file.content");
    if (!content)
        return writeAll(defaults);
    const root = await parseFactTree(ctx.filePath, content);
    if (!root)
        return writeAll(defaults);
    writeAll(extract(root, content));
}
