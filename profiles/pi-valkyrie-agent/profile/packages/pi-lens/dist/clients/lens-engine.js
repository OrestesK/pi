/**
 * LensEngine — the single internal-facing seam for pi-lens host adapters.
 *
 * The maintainability rule: host adapters (the MCP server today; index.ts can
 * adopt incrementally) talk ONLY to this module, never reaching into pi-lens
 * internals directly. So when an internal API is refactored, the break surfaces
 * HERE (one file, TypeScript-loud), not scattered across the adapter. New
 * mirrored capabilities (cascade, call-graph, …) get a method here and the
 * adapter just routes to it — coupling stays capped at this interface instead of
 * growing per tool.
 *
 * It re-exports the per-concern facades (analyze / review / session / ipc) and
 * adds thin wrappers over the remaining internal reach-ins (latency, project
 * scan, LSP status, diagnostic stats, LSP config).
 */
import { getDiagnosticTracker } from "./diagnostic-tracker.js";
import { getLatencyReports, } from "./dispatch/integration.js";
import { getResourceFootprint as getResourceFootprintSnapshot, } from "./instance-registry.js";
import { initLSPConfig } from "./lsp/config.js";
import { getLSPService } from "./lsp/index.js";
import { getOrLoadWarmWordIndex } from "./mcp/analyze.js";
import { scanProjectDiagnostics } from "./project-diagnostics/scanner.js";
import * as path from "node:path";
import { normalizeMapKey } from "./path-utils.js";
import { loadProjectSnapshot } from "./project-snapshot.js";
import { centralityFromReverseDeps, deserializeWordIndex, searchWordIndex, triggerBackgroundWordIndexBuild, } from "./word-index.js";
// --- Facades (re-exported so adapters import only this module) ---------------
export { analyzeFile, } from "./mcp/analyze.js";
export { createMcpHost } from "./mcp/host-shim.js";
export { ipcPathForCwd, requestWarmAnalyze, } from "./mcp/ipc.js";
export { analyzeFileFresh, resolveRebuildScript, runRebuild, summarizeScan, } from "./mcp/review.js";
export { runSessionStart, runTurnEnd, } from "./mcp/session.js";
export { moduleReport, readEnclosing, readSymbol, renderCompactModuleReport, } from "./module-report.js";
// --- Query wrappers (own the remaining internal reach-ins) -------------------
/** Recent dispatch latency reports (latency.log schema), newest first. */
export function recentLatency(limit = 5, fileFilter) {
    let reports = getLatencyReports();
    if (fileFilter) {
        const needle = fileFilter.replace(/\\/g, "/");
        reports = reports.filter((report) => report.filePath.replace(/\\/g, "/").endsWith(needle));
    }
    return reports.slice(-limit).reverse();
}
/** Cheap project-wide scan (tree-sitter + fact rules). */
export function projectScan(cwd, maxFiles) {
    return scanProjectDiagnostics({ cwd, tier: "cheap", maxFiles });
}
/** Alive LSP client count + per-server status. */
export function lspStatus() {
    const lsp = getLSPService();
    return { aliveClients: lsp.getAliveClientCount(), servers: lsp.getStatus() };
}
/** Session diagnostic counters (shown / auto-fixed / unresolved …). */
export function diagnosticStats() {
    return getDiagnosticTracker().getStats();
}
/** Initialise LSP config for a workspace (idempotent at the LSP layer). */
export function ensureLspConfig(cwd) {
    return initLSPConfig(cwd);
}
/**
 * #620: total CPU/RAM footprint attributable to pi-lens across every process
 * it owns — every registered instance's host, plus that instance's live LSP
 * children. Reads the machine-global `~/.pi-lens/instances.json` registry, so
 * this answers across ALL concurrent pi-lens sessions/worktrees on the box,
 * not just this one. Best-effort: reflects whatever heartbeats have landed so
 * far — a stale-heartbeat instance simply reports its last-sampled numbers.
 */
export function resourceFootprint() {
    return getResourceFootprintSnapshot();
}
function toSymbolSearchHit(result) {
    const line = result.lines[0] ?? 1;
    return {
        file: result.file,
        score: result.score,
        hits: result.hits,
        startLine: line,
        endLine: line,
    };
}
/**
 * Ranked identifier search over the persisted word index (#162). Mostly
 * stateless: loads the index from the project snapshot (built by the session
 * scan, in either the pi extension or the MCP session), so it works without a
 * warm runtime. Returns `available: false` when no index exists yet — and
 * kicks off a single bounded background build for this workspace (deduped per
 * cwd, never blocking this call) so a retry shortly after succeeds (#348
 * decision 3).
 *
 * #536 rider: prefers the warm in-memory index (`getOrLoadWarmWordIndex`,
 * clients/mcp/analyze.ts) over a fresh disk read when one exists for this
 * cwd — a warm `pilens_analyze` call updates that live copy synchronously but
 * persists it to disk on a debounce (default 1500ms), so without this a query
 * immediately following an analyze in the SAME process would read stale
 * on-disk state until the debounce flushes. Falls back to the stateless disk
 * read exactly as before when no warm copy is cached (nothing has called
 * pilens_analyze yet this process, or #348 phase 2's forward-index isn't
 * available) — this function's public contract (available/hint/results shape)
 * is unchanged either way.
 */
export function symbolSearch(query, cwd, limit = 20) {
    const snapshot = loadProjectSnapshot(cwd);
    const index = getOrLoadWarmWordIndex(cwd) ?? deserializeWordIndex(snapshot?.wordIndex);
    if (!index) {
        triggerBackgroundWordIndexBuild(cwd);
        return {
            available: false,
            query,
            results: [],
            hint: "Word index is building in the background for this workspace — retry this query shortly.",
        };
    }
    // Boost well-connected files using the snapshot's reverse-dependency
    // (importedBy) counts; snapshot keys are normalized, index keys are raw.
    const centrality = centralityFromReverseDeps(index, snapshot?.reverseDeps, (file) => normalizeMapKey(path.resolve(file)));
    const results = searchWordIndex(index, query, { limit, centrality });
    return {
        available: true,
        query,
        results: results.map(toSymbolSearchHit),
        snapshotGeneratedAt: snapshot?.generatedAt,
    };
}
// symbolImpact was removed (#304 follow-up): the transitive blast radius is now
// served by module_report's `blastRadius` option (clients/module-report.ts), which
// calls computeTransitiveImpact (review-graph/query.ts) directly over the cached
// graph. No engine wrapper is needed.
