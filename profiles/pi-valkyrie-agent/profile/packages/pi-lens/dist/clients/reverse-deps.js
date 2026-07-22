import * as fs from "node:fs";
import * as path from "node:path";
import { normalizeMapKey } from "./path-utils.js";
import { loadProjectSnapshot, saveProjectSnapshot, } from "./project-snapshot.js";
function sortedUnique(values) {
    return [...new Set([...values].map((value) => normalizeMapKey(value)))].sort((a, b) => a.localeCompare(b));
}
function addEdge(index, fromFile, toFile) {
    const from = normalizeMapKey(fromFile);
    const to = normalizeMapKey(toFile);
    if (from === to)
        return;
    (index.imports[from] ??= []).push(to);
    (index.importedBy[to] ??= []).push(from);
}
function normalizeIndex(index) {
    const fileKeys = new Set([
        ...Object.keys(index.imports),
        ...Object.keys(index.importedBy),
    ]);
    const imports = {};
    const importedBy = {};
    for (const file of [...fileKeys].sort((a, b) => a.localeCompare(b))) {
        imports[file] = sortedUnique(index.imports[file] ?? []);
        importedBy[file] = sortedUnique(index.importedBy[file] ?? []);
    }
    return { ...index, imports, importedBy };
}
function filePathForNode(graph, nodeId) {
    const filePath = graph.nodes.get(nodeId)?.filePath;
    return filePath ? normalizeMapKey(filePath) : undefined;
}
export function buildReverseDependencyIndexFromGraph(args) {
    const index = {
        projectRoot: normalizeMapKey(path.resolve(args.cwd)),
        generatedAt: new Date().toISOString(),
        seq: args.seq,
        imports: {},
        importedBy: {},
        source: "review-graph",
    };
    for (const filePath of args.graph.fileNodes.keys()) {
        const normalized = normalizeMapKey(filePath);
        index.imports[normalized] ??= [];
        index.importedBy[normalized] ??= [];
    }
    for (const edge of args.graph.edges) {
        if (edge.kind !== "imports")
            continue;
        const fromFile = filePathForNode(args.graph, edge.from);
        const toFile = filePathForNode(args.graph, edge.to);
        if (!fromFile || !toFile)
            continue;
        addEdge(index, fromFile, toFile);
    }
    return normalizeIndex(index);
}
export function buildReverseDependencyIndexFromSnapshot(snapshot) {
    const reverseDeps = snapshot.reverseDeps ?? {};
    const hasReverseDeps = Object.keys(reverseDeps).length > 0;
    const fileEntries = Object.entries(snapshot.files ?? {});
    const hasFileImports = fileEntries.some(([, file]) => Array.isArray(file.imports));
    if (!hasReverseDeps && !hasFileImports)
        return null;
    const index = {
        projectRoot: normalizeMapKey(snapshot.projectRoot),
        generatedAt: snapshot.generatedAt,
        seq: snapshot.seq,
        imports: {},
        importedBy: {},
        source: "project-snapshot",
    };
    for (const [filePath, file] of fileEntries) {
        const normalized = normalizeMapKey(file.path || filePath);
        index.imports[normalized] = sortedUnique(file.imports ?? []);
        index.importedBy[normalized] ??= [];
        for (const imported of index.imports[normalized]) {
            index.importedBy[imported] ??= [];
            index.importedBy[imported].push(normalized);
        }
    }
    for (const [filePath, importers] of Object.entries(reverseDeps)) {
        const normalized = normalizeMapKey(filePath);
        index.importedBy[normalized] = sortedUnique([
            ...(index.importedBy[normalized] ?? []),
            ...importers,
        ]);
        index.imports[normalized] ??= [];
        for (const importer of index.importedBy[normalized]) {
            index.imports[importer] ??= [];
            if (!index.imports[importer].includes(normalized)) {
                index.imports[importer].push(normalized);
            }
        }
    }
    return normalizeIndex(index);
}
export function loadReverseDependencyIndexFromSnapshot(args) {
    const snapshot = loadProjectSnapshot(args.cwd);
    if (!snapshot)
        return null;
    if (typeof args.currentProjectSeq === "number" &&
        snapshot.seq !== args.currentProjectSeq) {
        return null;
    }
    return buildReverseDependencyIndexFromSnapshot(snapshot);
}
export function getReverseDepsFromIndex(index, filePath) {
    return sortedUnique(index.importedBy[normalizeMapKey(path.resolve(filePath))] ?? []);
}
export function getAffectedFilesFromIndex(index, filePath, depth = 1, maxFiles = 50) {
    const start = normalizeMapKey(path.resolve(filePath));
    const maxDepth = Math.max(1, Math.floor(depth));
    const queue = [
        { filePath: start, depth: 0 },
    ];
    const seen = new Set([start]);
    const affected = [];
    while (queue.length > 0 && affected.length < maxFiles) {
        const current = queue.shift();
        if (!current || current.depth >= maxDepth)
            continue;
        for (const importer of getReverseDepsFromIndex(index, current.filePath)) {
            if (seen.has(importer))
                continue;
            seen.add(importer);
            affected.push(importer);
            if (affected.length >= maxFiles)
                break;
            queue.push({ filePath: importer, depth: current.depth + 1 });
        }
    }
    return affected;
}
function snapshotFileFor(filePath, imports) {
    try {
        const stat = fs.statSync(filePath);
        return {
            path: filePath,
            mtimeMs: stat.mtimeMs,
            size: stat.size,
            imports,
            lastSeq: 0,
        };
    }
    catch {
        return { path: filePath, mtimeMs: 0, size: 0, imports, lastSeq: 0 };
    }
}
export function writeReverseDependencyIndexToSnapshot(args) {
    try {
        const snapshot = loadProjectSnapshot(args.cwd);
        if (!snapshot)
            return false;
        const reverseDeps = {};
        for (const [filePath, importers] of Object.entries(args.index.importedBy)) {
            reverseDeps[normalizeMapKey(filePath)] = sortedUnique(importers);
        }
        const files = { ...snapshot.files };
        for (const [filePath, imports] of Object.entries(args.index.imports)) {
            const normalized = normalizeMapKey(filePath);
            files[normalized] = {
                ...(files[normalized] ??
                    snapshotFileFor(normalized, sortedUnique(imports))),
                path: normalized,
                imports: sortedUnique(imports),
            };
        }
        saveProjectSnapshot(args.cwd, {
            ...snapshot,
            generatedAt: new Date().toISOString(),
            files,
            reverseDeps,
        });
        args.dbg?.(`reverse_deps: saved ${Object.keys(reverseDeps).length} entries to project snapshot`);
        return true;
    }
    catch (err) {
        args.dbg?.(`reverse_deps: snapshot save failed: ${err}`);
        return false;
    }
}
