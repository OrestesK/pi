import * as fs from "node:fs";
import { detectLineEnding, normalizeToLF, restoreLineEndings, } from "./host-edit-normalize.js";
function replaceOnce(content, oldText, newText) {
    const idx = content.indexOf(oldText);
    if (idx === -1)
        return { content, changed: false };
    return {
        content: content.slice(0, idx) + newText + content.slice(idx + oldText.length),
        changed: true,
    };
}
/**
 * Applies already-resolved oldText edits from the preflight path, then invokes
 * the caller's normal post-edit bookkeeping/pipeline hook. The edits are exact
 * LF-normalized replacements; entries that no longer match are skipped rather
 * than logged as applied.
 */
export async function applyPartiallyApplicableEdits(args) {
    const raw = fs.readFileSync(args.filePath, "utf-8");
    // Detect + restore line endings the way the host edit tool does:
    // first-occurrence-wins detection (not "any CRLF present") and lone-CR -> LF
    // normalization, so this self-apply path can't diverge from how the host
    // would have written the same edits (#257).
    const ending = detectLineEnding(raw);
    let content = normalizeToLF(raw);
    const applied = [];
    for (const edit of args.edits) {
        const oldText = normalizeToLF(edit.oldText);
        const newText = normalizeToLF(edit.newText ?? "");
        const replaced = replaceOnce(content, oldText, newText);
        if (!replaced.changed)
            continue;
        content = replaced.content;
        applied.push(edit.originalIndex);
    }
    if (applied.length > 0) {
        fs.writeFileSync(args.filePath, restoreLineEndings(content, ending), "utf-8");
    }
    const postEditOutput = applied.length > 0 ? await args.afterWrite?.() : undefined;
    return {
        appliedCount: applied.length,
        appliedIndices: applied.map((index) => `edits[${index}]`).join(", "),
        postEditOutput,
    };
}
