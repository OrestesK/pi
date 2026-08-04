import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "../file-utils.js";
import { readJsonCache } from "../json-cache-read.js";
// v2: cheap-tier scan now also runs ast-grep-napi (#308); invalidate older
// snapshots so a pre-ast-grep cache isn't served as complete via refreshRunners=cached.
export const PROJECT_DIAGNOSTICS_CACHE_VERSION = 2;
const SNAPSHOT_CACHE_FILE = "project-diagnostics.json";
const DELTA_CACHE_FILE = "project-diagnostics-delta.json";
function cachePath(cwd, fileName) {
    return path.join(getProjectDataDir(cwd), "cache", fileName);
}
export function loadProjectDiagnosticsSnapshot(cwd) {
    return readJsonCache(cachePath(cwd, SNAPSHOT_CACHE_FILE), (parsed) => {
        if (!parsed || typeof parsed !== "object")
            return undefined;
        const snapshot = parsed;
        if (snapshot.version !== PROJECT_DIAGNOSTICS_CACHE_VERSION)
            return undefined;
        if (!Array.isArray(snapshot.diagnostics))
            return undefined;
        return snapshot;
    });
}
export function saveProjectDiagnosticsSnapshot(cwd, snapshot) {
    const filePath = cachePath(cwd, SNAPSHOT_CACHE_FILE);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2));
}
export function loadProjectDiagnosticsDeltaReport(cwd) {
    return readJsonCache(cachePath(cwd, DELTA_CACHE_FILE), (parsed) => {
        if (!parsed || typeof parsed !== "object")
            return undefined;
        const report = parsed;
        if (report.version !== PROJECT_DIAGNOSTICS_CACHE_VERSION)
            return undefined;
        if (!Array.isArray(report.diagnostics))
            return undefined;
        return report;
    });
}
export function writeProjectDiagnosticsDeltaReport(cwd, report) {
    const filePath = cachePath(cwd, DELTA_CACHE_FILE);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
}
/**
 * Drop diagnostics whose underlying file changed on disk after the snapshot was
 * taken (`mtimeMs > scannedAt`) or no longer exists. The persisted snapshot is a
 * cross-session cache served by `lens_diagnostics mode=full refreshRunners=cached`;
 * without this it replays diagnostics the agent has since fixed or for files that
 * were deleted (#298 — "the cache needs to be cleaned before running diagnostics
 * because it became stale"). This mirrors `reconcileStaleWidgetFiles` for the
 * in-memory widget, applied at the consumer so `loadProjectDiagnosticsSnapshot`
 * stays a pure reader. Synchronous (a `statSync` per *distinct* file, memoised),
 * since the cached full-mode path is already off the typing hot loop.
 *
 * Fail-safe on an unparseable `scannedAt`: return the snapshot untouched rather
 * than risk dropping live findings on a clock/format anomaly.
 */
export function reconcileProjectDiagnosticsSnapshot(snapshot) {
    const scannedAtMs = Date.parse(snapshot.scannedAt);
    if (!Number.isFinite(scannedAtMs))
        return { snapshot, staleDropped: 0 };
    const staleByFile = new Map();
    const isStale = (filePath) => {
        const cached = staleByFile.get(filePath);
        if (cached !== undefined)
            return cached;
        let stale;
        try {
            // +1ms tolerance: a file scanned at scannedAt has mtime <= scannedAt.
            stale = fs.statSync(filePath).mtimeMs > scannedAtMs + 1;
        }
        catch {
            stale = true; // deleted / unreadable → drop
        }
        staleByFile.set(filePath, stale);
        return stale;
    };
    const kept = snapshot.diagnostics.filter((d) => !isStale(d.filePath));
    if (kept.length === snapshot.diagnostics.length) {
        return { snapshot, staleDropped: 0 };
    }
    const staleDropped = [...staleByFile.values()].filter(Boolean).length;
    return { snapshot: { ...snapshot, diagnostics: kept }, staleDropped };
}
