/**
 * Codebase mental model — issue #155.
 *
 * Builds a compact structural summary of the codebase from the call graph:
 * top-N symbols by in-degree centrality, each with signature, calls, and
 * calledBy lists. Persisted to cache; never injected into agent context
 * until validated across several real sessions.
 *
 * This is intentionally internal-only. The one agent-facing surface is a
 * single dbg log line at session-start so quality can be assessed via
 * ~/.pi-lens/sessionstart.log before any agent exposure.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_TOKEN_BUDGET = 1500;
const MAX_CALLS_PER_SYMBOL = 10;
const MIN_IN_DEGREE = 0.5; // skip symbols with low centrality (avoids noise)
// ── Builder ───────────────────────────────────────────────────────────────────
function inferKind(symbolKey) {
    const name = symbolKey.split(":").pop() ?? "";
    if (/^[A-Z]/.test(name))
        return "class";
    if (name.includes("."))
        return "method";
    return "function";
}
function estimateTokens(entry) {
    const text = [
        entry.name,
        entry.file,
        entry.calls.join(","),
        entry.calledBy.join(","),
    ].join(" ");
    return Math.ceil(text.length / 4) + 5; // +5 for structural overhead
}
/**
 * Build a codebase mental model from a function-level call graph.
 *
 * Selection: rank all symbols by weighted in-degree, then fill a token budget
 * from the top. Symbols below MIN_IN_DEGREE are skipped to avoid noise.
 *
 * @param graph   The session's FunctionCallGraph (must have inDegree populated).
 * @param cwd     Project root — used to compute relative file paths.
 * @param budget  Maximum total token budget (default 1500).
 */
export function buildCodebaseModel(graph, cwd, budget = DEFAULT_TOKEN_BUDGET) {
    // Sort all callee keys by in-degree descending
    const ranked = [...graph.inDegree.entries()]
        .filter(([, score]) => score >= MIN_IN_DEGREE)
        .sort(([, a], [, b]) => b - a);
    const entries = [];
    let totalTokens = 0;
    const seenNames = new Set();
    for (const [calleeKey, inDegree] of ranked) {
        if (totalTokens >= budget)
            break;
        const parts = calleeKey.split(":");
        const name = parts.pop() ?? calleeKey;
        const filePath = parts.join(":");
        // Skip if file is in test/node_modules/generated directories
        if (filePath.includes("node_modules") ||
            filePath.includes(".test.") ||
            filePath.includes(".spec.") ||
            filePath.includes("/__tests__/") ||
            filePath.includes("/dist/") ||
            filePath.includes("/generated/")) {
            continue;
        }
        // Deduplicate by name when the same function appears in multiple files
        if (seenNames.has(name))
            continue;
        seenNames.add(name);
        const calls = [...(graph.callees.get(calleeKey) ?? new Set())]
            .map((k) => k.split(":").pop() ?? k)
            .filter(Boolean)
            .slice(0, MAX_CALLS_PER_SYMBOL);
        const calledBy = [...(graph.callers.get(calleeKey) ?? new Set())]
            .map((k) => k.split(":").pop() ?? k)
            .filter((n) => !n.startsWith("file:"))
            .slice(0, MAX_CALLS_PER_SYMBOL);
        const file = filePath
            ? path.relative(cwd, filePath).replace(/\\/g, "/")
            : "unknown";
        const draft = {
            file,
            name,
            kind: inferKind(calleeKey),
            calls,
            calledBy,
            inDegree,
        };
        const tokens = estimateTokens(draft);
        if (totalTokens + tokens > budget)
            continue;
        entries.push({ ...draft, tokens });
        totalTokens += tokens;
    }
    const allFiles = new Set([...graph.callers.keys(), ...graph.callees.keys()]
        .map((k) => k.split(":").slice(0, -1).join(":"))
        .filter(Boolean));
    return {
        generatedAt: new Date().toISOString(),
        totalSymbols: graph.inDegree.size,
        totalFiles: allFiles.size,
        entries,
        totalTokens,
    };
}
// ── Persistence ───────────────────────────────────────────────────────────────
function cacheFilePath(cwd) {
    return path.join(getProjectDataDir(cwd), "cache", "codebase-model.json");
}
function metaFilePath(cwd) {
    return path.join(getProjectDataDir(cwd), "cache", "codebase-model.meta.json");
}
export function saveCodebaseModel(cwd, model) {
    const cacheFile = cacheFilePath(cwd);
    try {
        fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
        fs.writeFileSync(cacheFile, JSON.stringify(model), "utf-8");
        fs.writeFileSync(metaFilePath(cwd), JSON.stringify({ savedAt: new Date().toISOString(), entryCount: model.entries.length, totalTokens: model.totalTokens }), "utf-8");
    }
    catch {
        // Non-fatal — next session rebuilds.
    }
}
export function loadCodebaseModel(cwd) {
    try {
        return JSON.parse(fs.readFileSync(cacheFilePath(cwd), "utf-8"));
    }
    catch {
        return undefined;
    }
}
