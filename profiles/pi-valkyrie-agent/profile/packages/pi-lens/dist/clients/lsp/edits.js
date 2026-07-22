import fs from "node:fs/promises";
import path from "node:path";
import { uriToPath } from "./path-utils.js";
function isPosition(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.line === "number" &&
        typeof value.character === "number");
}
function isRange(value) {
    return (typeof value === "object" &&
        value !== null &&
        isPosition(value.start) &&
        isPosition(value.end));
}
function isTextEdit(value) {
    return (typeof value === "object" &&
        value !== null &&
        isRange(value.range) &&
        typeof value.newText === "string");
}
function isTextDocumentEdit(value) {
    return (typeof value === "object" &&
        value !== null &&
        typeof value.textDocument?.uri ===
            "string" &&
        Array.isArray(value.edits));
}
function comparePosition(a, b) {
    return a.line === b.line ? a.character - b.character : a.line - b.line;
}
function formatRange(range) {
    return `${range.start.line + 1}:${range.start.character + 1}-${range.end.line + 1}:${range.end.character + 1}`;
}
export function rangesOverlap(a, b) {
    return (comparePosition(a.start, b.end) < 0 && comparePosition(b.start, a.end) < 0);
}
export function applyTextEditsToString(content, edits) {
    const sortedEdits = [...edits].sort((a, b) => {
        const lineDelta = b.range.start.line - a.range.start.line;
        return lineDelta !== 0
            ? lineDelta
            : b.range.start.character - a.range.start.character;
    });
    for (let index = 0; index < sortedEdits.length - 1; index++) {
        const later = sortedEdits[index]?.range;
        const earlier = sortedEdits[index + 1]?.range;
        if (later && earlier && comparePosition(earlier.end, later.start) > 0) {
            throw new Error(`overlapping LSP edits: ${formatRange(earlier)} conflicts with ${formatRange(later)}`);
        }
    }
    const lines = content.split("\n");
    for (const edit of sortedEdits) {
        const { start, end } = edit.range;
        if (start.line === end.line) {
            const line = lines[start.line] ?? "";
            lines[start.line] =
                line.slice(0, start.character) +
                    edit.newText +
                    line.slice(end.character);
            continue;
        }
        const startLine = lines[start.line] ?? "";
        const endLine = lines[end.line] ?? "";
        const replacement = startLine.slice(0, start.character) +
            edit.newText +
            endLine.slice(end.character);
        lines.splice(start.line, end.line - start.line + 1, ...replacement.split("\n"));
    }
    return lines.join("\n");
}
export function flattenWorkspaceTextEdits(edit) {
    const out = new Map();
    const push = (uri, edits) => {
        const textEdits = edits.filter(isTextEdit);
        if (textEdits.length === 0)
            return;
        const existing = out.get(uri);
        if (existing)
            existing.push(...textEdits);
        else
            out.set(uri, [...textEdits]);
    };
    for (const [uri, edits] of Object.entries(edit.changes ?? {})) {
        push(uri, edits);
    }
    for (const change of edit.documentChanges ?? []) {
        if (isTextDocumentEdit(change)) {
            push(change.textDocument.uri, change.edits);
        }
    }
    return out;
}
function textEditKey(uri, edit) {
    return [
        uri,
        edit.range.start.line,
        edit.range.start.character,
        edit.range.end.line,
        edit.range.end.character,
        edit.newText,
    ].join(":");
}
export function mergeWorkspaceTextEditsByPriority(entries) {
    const merged = new Map();
    const seenExact = new Set();
    let droppedConflicts = 0;
    let inputEditCount = 0;
    const serverIds = [];
    for (const entry of entries) {
        serverIds.push(entry.serverId);
        if (!entry.edit)
            continue;
        for (const [uri, edits] of flattenWorkspaceTextEdits(entry.edit)) {
            const kept = merged.get(uri) ?? [];
            for (const edit of edits) {
                inputEditCount += 1;
                const exactKey = textEditKey(uri, edit);
                if (seenExact.has(exactKey))
                    continue;
                if (kept.some((existing) => rangesOverlap(existing.range, edit.range))) {
                    droppedConflicts += 1;
                    continue;
                }
                seenExact.add(exactKey);
                kept.push(edit);
            }
            if (kept.length > 0)
                merged.set(uri, kept);
        }
    }
    const changes = {};
    for (const [uri, edits] of merged) {
        changes[uri] = edits;
    }
    return { edit: { changes }, droppedConflicts, inputEditCount, serverIds };
}
function relativeToCwd(filePath, cwd) {
    const rel = path.relative(cwd, filePath) || path.basename(filePath);
    return rel.replace(/\\/g, "/");
}
export function summarizeWorkspaceEdit(edit, cwd) {
    const lines = [];
    const textEditsByUri = flattenWorkspaceTextEdits(edit);
    for (const [uri, edits] of textEditsByUri) {
        lines.push(`Apply ${edits.length} edit(s) to ${relativeToCwd(uriToPath(uri), cwd)}`);
    }
    for (const change of edit.documentChanges ?? []) {
        if (typeof change !== "object" || change === null || !("kind" in change))
            continue;
        const kind = change.kind;
        if (kind === "create" && typeof change.uri === "string") {
            lines.push(`Create ${relativeToCwd(uriToPath(change.uri), cwd)}`);
        }
        else if (kind === "rename" &&
            typeof change.oldUri === "string" &&
            typeof change.newUri === "string") {
            lines.push(`Rename ${relativeToCwd(uriToPath(change.oldUri), cwd)} → ${relativeToCwd(uriToPath(change.newUri), cwd)}`);
        }
        else if (kind === "delete" &&
            typeof change.uri === "string") {
            lines.push(`Delete ${relativeToCwd(uriToPath(change.uri), cwd)}`);
        }
    }
    return lines;
}
export async function applyWorkspaceEdit(edit, cwd) {
    const descriptions = [];
    const touchedFiles = new Set();
    const textEditsByUri = flattenWorkspaceTextEdits(edit);
    try {
        for (const [uri, edits] of textEditsByUri) {
            const filePath = uriToPath(uri);
            const content = await fs.readFile(filePath, "utf-8");
            const updated = applyTextEditsToString(content, edits);
            await fs.writeFile(filePath, updated, "utf-8");
            touchedFiles.add(filePath);
            descriptions.push(`Applied ${edits.length} edit(s) to ${relativeToCwd(filePath, cwd)}`);
        }
        for (const change of edit.documentChanges ?? []) {
            if (typeof change !== "object" || change === null || !("kind" in change))
                continue;
            const kind = change.kind;
            if (kind === "create" &&
                typeof change.uri === "string") {
                const filePath = uriToPath(change.uri);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs
                    .writeFile(filePath, "", { flag: "wx" })
                    .catch(async (err) => {
                    if (err.code !== "EEXIST")
                        throw err;
                });
                touchedFiles.add(filePath);
                descriptions.push(`Created ${relativeToCwd(filePath, cwd)}`);
            }
            else if (kind === "rename" &&
                typeof change.oldUri === "string" &&
                typeof change.newUri === "string") {
                const oldPath = uriToPath(change.oldUri);
                const newPath = uriToPath(change.newUri);
                await fs.mkdir(path.dirname(newPath), { recursive: true });
                await fs.rename(oldPath, newPath);
                touchedFiles.add(oldPath);
                touchedFiles.add(newPath);
                descriptions.push(`Renamed ${relativeToCwd(oldPath, cwd)} → ${relativeToCwd(newPath, cwd)}`);
            }
            else if (kind === "delete" &&
                typeof change.uri === "string") {
                const filePath = uriToPath(change.uri);
                await fs.rm(filePath, { recursive: true, force: true });
                touchedFiles.add(filePath);
                descriptions.push(`Deleted ${relativeToCwd(filePath, cwd)}`);
            }
        }
    }
    catch (err) {
        const already = [...touchedFiles];
        if (already.length > 0) {
            const alreadyList = already
                .map((f) => `  • ${relativeToCwd(f, cwd)}`)
                .join("\n");
            throw new Error(`Workspace edit failed mid-application — ${already.length} file(s) already written, no rollback performed:\n${alreadyList}\nCause: ${err instanceof Error ? err.message : String(err)}`);
        }
        throw err;
    }
    return { descriptions, files: [...touchedFiles] };
}
