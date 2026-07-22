/**
 * Register the lines a *search* tool revealed to the agent as reads, so a
 * follow-up edit to those lines is not blocked by the read-guard (#169).
 *
 * Search → edit is a common flow: the agent finds where something must change
 * (ast_grep_search / lsp_navigation / grep), then edits exactly those lines.
 * Those lines were genuinely shown, so they count as read — but ONLY those lines
 * (plus a small context margin), never the whole file, so editing an unseen
 * region is still guarded.
 */
import * as nodeFs from "node:fs";
import * as path from "node:path";
import { isPathIgnoredByProject } from "./file-utils.js";
import { isExternalOrVendorFile } from "./path-utils.js";
const DEFAULT_CONTEXT_MARGIN = 2;
/**
 * Record each shown location as a read (± context margin). Resolves project-
 * relative paths, skips external/vendor/ignored/non-existent files, and dedupes
 * identical spans. Returns how many reads were recorded.
 */
export function registerSearchReads(readGuard, locations, opts) {
    const margin = opts.contextMargin ?? DEFAULT_CONTEXT_MARGIN;
    const seen = new Set();
    let recorded = 0;
    for (const loc of locations) {
        if (!loc?.file || !Number.isFinite(loc.startLine))
            continue;
        const abs = path.isAbsolute(loc.file)
            ? loc.file
            : path.resolve(opts.projectRoot, loc.file);
        if (isExternalOrVendorFile(abs, opts.projectRoot))
            continue;
        if (isPathIgnoredByProject(abs, opts.projectRoot, false))
            continue;
        try {
            if (!nodeFs.statSync(abs).isFile())
                continue;
        }
        catch {
            continue;
        }
        const start = Math.max(1, Math.floor(loc.startLine) - margin);
        const endLine = Number.isFinite(loc.endLine)
            ? loc.endLine
            : loc.startLine;
        const end = Math.max(start, Math.floor(endLine) + margin);
        const limit = end - start + 1;
        const key = `${abs}:${start}:${limit}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        readGuard.recordRead({
            filePath: abs,
            requestedOffset: start,
            requestedLimit: limit,
            effectiveOffset: start,
            effectiveLimit: limit,
            expandedByLsp: false,
            turnIndex: opts.turnIndex,
            writeIndex: opts.writeIndex,
            timestamp: Date.now(),
        });
        recorded++;
    }
    return recorded;
}
