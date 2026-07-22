/**
 * Cross-file call graph — Sections 1, 2 & 3 of issue #154.
 *
 * Builds a bidirectional function-level call graph by resolving symbol
 * references across files. Provides BFS impact analysis with severity tiers.
 * Uses the Symbol/SymbolRef data produced by TreeSitterSymbolExtractor and
 * persists the result with per-file mtime tracking for incremental sessions.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
const CACHE_VERSION = 3;
function severityForDepth(depth) {
    if (depth === 1)
        return "WillBreak";
    if (depth === 2)
        return "MayBreak";
    return "Review";
}
/**
 * BFS upstream through the callers map from `startKey`.
 *
 * Returns all symbols that would be affected if `startKey` changes,
 * classified by severity:
 *   depth 1 → WillBreak (direct callers)
 *   depth 2 → MayBreak  (callers of callers)
 *   depth 3+ → Review   (transitive)
 *
 * @param maxDepth  Limit traversal depth (default 3 — Review tier cutoff).
 * @param minWeight Only follow edges with weight ≥ this threshold (default 0.1).
 *                  Filters out highly ambiguous name resolutions.
 */
export function impact(graph, startKey, maxDepth = 3, minWeight = 0.1) {
    const results = [];
    const visited = new Set([startKey]);
    const queue = [{ key: startKey, depth: 0 }];
    // Build a weight lookup from edges for filtering
    const edgeWeightMap = new Map();
    for (const edge of graph.edges) {
        const edgeKey = `${edge.calleeKey}→${edge.callerKey}`;
        const existing = edgeWeightMap.get(edgeKey) ?? 0;
        edgeWeightMap.set(edgeKey, Math.max(existing, edge.weight));
    }
    while (queue.length > 0) {
        const item = queue.shift();
        if (item.depth >= maxDepth)
            continue;
        const directCallers = graph.callers.get(item.key);
        if (!directCallers)
            continue;
        for (const callerKey of directCallers) {
            if (visited.has(callerKey))
                continue;
            // Check edge weight — skip highly ambiguous resolutions
            const edgeKey = `${item.key}→${callerKey}`;
            const weight = edgeWeightMap.get(edgeKey) ?? 1.0;
            if (weight < minWeight)
                continue;
            visited.add(callerKey);
            const depth = item.depth + 1;
            results.push({ symbolKey: callerKey, depth, severity: severityForDepth(depth) });
            queue.push({ key: callerKey, depth });
        }
    }
    // Sort by depth then symbolKey for stable output
    return results.sort((a, b) => a.depth - b.depth || a.symbolKey.localeCompare(b.symbolKey));
}
/**
 * Format an impact result set as a compact human-readable summary.
 * Example: "handleToolResult (WillBreak) → handleAgentEnd (MayBreak) → 3 Review callers"
 */
export function formatImpact(results, projectRoot) {
    if (results.length === 0)
        return "";
    const willBreak = results.filter((r) => r.severity === "WillBreak");
    const mayBreak = results.filter((r) => r.severity === "MayBreak");
    const review = results.filter((r) => r.severity === "Review");
    const parts = [];
    const label = (r) => {
        const name = r.symbolKey.includes(":")
            ? r.symbolKey.split(":").pop() ?? r.symbolKey
            : r.symbolKey;
        const file = r.symbolKey.includes(":")
            ? r.symbolKey.split(":").slice(0, -1).join(":").replace(projectRoot, "").replace(/^[/\\]/, "")
            : "";
        return file ? `${name} (${file})` : name;
    };
    if (willBreak.length > 0) {
        parts.push(willBreak.slice(0, 3).map((r) => `${label(r)} ⚠ WillBreak`).join(", "));
    }
    if (mayBreak.length > 0) {
        parts.push(mayBreak.slice(0, 2).map((r) => `${label(r)} MayBreak`).join(", "));
    }
    if (review.length > 0) {
        parts.push(`${review.length} Review caller${review.length === 1 ? "" : "s"}`);
    }
    return parts.join(" → ");
}
// ── Stdlib / builtin noise filter ─────────────────────────────────────────────
/**
 * Common stdlib / builtin names that appear in call sites but never resolve
 * to project-defined symbols. Filtering them cuts noise significantly.
 */
const STDLIB_NAMES = new Set([
    // JS/TS
    "console", "Math", "Object", "Array", "String", "Number", "Boolean",
    "Promise", "Error", "Map", "Set", "WeakMap", "WeakSet", "JSON", "Date",
    "RegExp", "Symbol", "BigInt", "parseInt", "parseFloat", "isNaN",
    "isFinite", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
    "fetch", "URL", "URLSearchParams", "Buffer", "process", "require",
    // Python
    "print", "len", "range", "list", "dict", "str", "int", "float", "bool",
    "open", "isinstance", "issubclass", "type", "super", "hasattr", "getattr",
    "setattr", "enumerate", "zip", "map", "filter", "sorted", "reversed",
    // Go
    "fmt", "log", "os", "io", "err", "make", "append", "len", "cap", "copy",
    "close", "delete", "panic", "recover", "new",
    // Rust
    "println", "eprintln", "print", "eprint", "vec", "Some", "None", "Ok", "Err",
    "Box", "Rc", "Arc", "String", "Vec", "HashMap", "HashSet", "format",
    // Java/Kotlin
    "System", "println", "toString", "equals", "hashCode", "Objects",
    // Generic
    "new", "this", "self", "super", "nil", "null", "undefined", "true", "false",
]);
// ── Core resolution ────────────────────────────────────────────────────────────
/**
 * Build def index: symbol name → list of SymbolKeys that define it.
 * Exported symbols and all symbols are indexed; the ambiguity weight
 * discounts edges when many files define the same name.
 */
function buildDefIndex(allSymbols) {
    const index = new Map();
    for (const [, symbols] of allSymbols) {
        for (const sym of symbols) {
            if (!sym.name)
                continue;
            const key = `${sym.filePath}:${sym.name}`;
            const existing = index.get(sym.name) ?? [];
            if (!existing.includes(key))
                existing.push(key);
            index.set(sym.name, existing);
        }
    }
    return index;
}
/**
 * Find the enclosing function/method for a ref at `refLine` using a
 * "last start-line before ref" heuristic. Returns the symbol whose
 * start line is closest to (and not after) the ref's line.
 */
function findEnclosingSymbol(symbols, refLine) {
    let best;
    for (const sym of symbols) {
        if (sym.line <= refLine &&
            (sym.kind === "function" || sym.kind === "method")) {
            if (!best || sym.line > best.line)
                best = sym;
        }
    }
    return best;
}
/**
 * Build the function-level call graph from extracted symbols and refs.
 *
 * Two passes:
 *   1. Index all defs by name across all files.
 *   2. For each ref, resolve to cross-file defs; find enclosing caller.
 */
export function buildCallGraph(allSymbols, allRefs) {
    const defIndex = buildDefIndex(allSymbols);
    const callees = new Map();
    const callers = new Map();
    const inDegree = new Map();
    const edges = [];
    let unresolvedRefs = 0;
    let totalRefs = 0;
    for (const [callerFile, refs] of allRefs) {
        const callerSymbols = allSymbols.get(callerFile) ?? [];
        for (const ref of refs) {
            totalRefs++;
            // ref.symbolId is "filePath:name" from the extractor; we only need the name.
            const refName = ref.symbolId.split(":").pop() ?? ref.symbolId;
            if (STDLIB_NAMES.has(refName) || !refName)
                continue;
            const defs = defIndex.get(refName);
            if (!defs || defs.length === 0) {
                unresolvedRefs++;
                continue;
            }
            // Only cross-file refs are interesting for the call graph.
            const crossFileDefs = defs.filter((d) => !d.startsWith(`${callerFile}:`));
            if (crossFileDefs.length === 0)
                continue;
            const weight = 1.0 / crossFileDefs.length;
            // Enclosing function is the caller; fall back to file-level key.
            const enclosing = findEnclosingSymbol(callerSymbols, ref.line);
            const callerKey = enclosing
                ? `${callerFile}:${enclosing.name}`
                : `file:${callerFile}`;
            for (const calleeKey of crossFileDefs) {
                const calleeFile = calleeKey.split(":").slice(0, -1).join(":");
                const calleeSymbol = calleeKey.split(":").pop() ?? calleeKey;
                // Bidirectional maps (deduplicated by Set).
                const callerCallees = callees.get(callerKey) ?? new Set();
                callerCallees.add(calleeKey);
                callees.set(callerKey, callerCallees);
                const calleeCallers = callers.get(calleeKey) ?? new Set();
                calleeCallers.add(callerKey);
                callers.set(calleeKey, calleeCallers);
                // Weighted in-degree accumulation.
                inDegree.set(calleeKey, (inDegree.get(calleeKey) ?? 0) + weight);
                edges.push({
                    callerFile,
                    callerSymbol: enclosing?.name,
                    callerKey,
                    calleeFile,
                    calleeSymbol,
                    calleeKey,
                    weight,
                });
            }
        }
    }
    return {
        callees,
        callers,
        inDegree,
        edges,
        unresolvedRefs,
        totalRefs,
        builtAt: new Date().toISOString(),
    };
}
// ── Persistence ────────────────────────────────────────────────────────────────
function cacheFilePath(cwd) {
    return path.join(getProjectDataDir(cwd), "cache", "call-graph.json");
}
function metaFilePath(cwd) {
    return path.join(getProjectDataDir(cwd), "cache", "call-graph.meta.json");
}
/**
 * Persist the call graph to disk with per-file mtime tracking.
 * On the next session-start, stale files can be identified without a full rebuild.
 */
export function saveCallGraph(cwd, graph, fileMtimes) {
    const cacheFile = cacheFilePath(cwd);
    const metaFile = metaFilePath(cwd);
    try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        const persisted = {
            version: CACHE_VERSION,
            builtAt: graph.builtAt,
            fileMtimes: Object.fromEntries(fileMtimes),
            edges: graph.edges,
            callees: [...graph.callees.entries()].map(([k, v]) => [k, [...v]]),
            callers: [...graph.callers.entries()].map(([k, v]) => [k, [...v]]),
            inDegree: [...graph.inDegree.entries()],
        };
        fs.writeFileSync(cacheFile, JSON.stringify(persisted), "utf-8");
        fs.writeFileSync(metaFile, JSON.stringify({ savedAt: new Date().toISOString(), edgeCount: graph.edges.length }), "utf-8");
    }
    catch {
        // Non-fatal — next session rebuilds from scratch.
    }
}
/**
 * Load the persisted call graph from disk.
 * Returns undefined if the cache is missing, version-mismatched, or corrupt.
 */
export function loadCallGraph(cwd) {
    const cacheFile = cacheFilePath(cwd);
    try {
        const raw = JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
        if (raw.version !== CACHE_VERSION)
            return undefined;
        return {
            graph: {
                callees: new Map(raw.callees.map(([k, v]) => [k, new Set(v)])),
                callers: new Map(raw.callers.map(([k, v]) => [k, new Set(v)])),
                inDegree: new Map(raw.inDegree),
                edges: raw.edges,
                unresolvedRefs: 0,
                totalRefs: 0,
                builtAt: raw.builtAt,
            },
            fileMtimes: new Map(Object.entries(raw.fileMtimes)),
        };
    }
    catch {
        return undefined;
    }
}
/**
 * Returns the set of file paths whose mtime has changed since the cache was saved.
 * Files not in the mtime map are treated as new (stale).
 */
export function staleFiles(fileMtimes, currentFiles) {
    return currentFiles.filter((f) => {
        const cached = fileMtimes.get(f);
        if (cached === undefined)
            return true; // new file
        try {
            return fs.statSync(f).mtimeMs !== cached;
        }
        catch {
            return true; // deleted or unreadable
        }
    });
}
/**
 * Read current mtimes for a set of files.
 */
export function readMtimes(files) {
    const mtimes = new Map();
    for (const f of files) {
        try {
            mtimes.set(f, fs.statSync(f).mtimeMs);
        }
        catch {
            // skip
        }
    }
    return mtimes;
}
