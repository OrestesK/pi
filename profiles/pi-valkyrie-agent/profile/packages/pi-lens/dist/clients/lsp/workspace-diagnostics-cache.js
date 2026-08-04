import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "../file-utils.js";
import { readJsonCache } from "../json-cache-read.js";
import { normalizeMapKey } from "../path-utils.js";
import { loadReverseDependencyIndexFromSnapshot } from "../reverse-deps.js";
/**
 * #671: per-file cache of the last CONFIRMED `runWorkspaceDiagnostics` sweep
 * result, so a repeat `lens_diagnostics mode=full` with no intervening edits
 * doesn't re-touch every file through the language server(s) again. Mirrors
 * `clients/project-diagnostics/cache.ts`'s load/save + mtime-staleness shape
 * (same `getProjectDataDir`-rooted `cache/` path, same version-guard +
 * fail-open-on-corrupt read), but keyed PER FILE with its own scan timestamp
 * rather than one global `scannedAt` — a workspace sweep can span many
 * seconds/minutes across thousands of files, each finishing at a different
 * time, so a single project-wide timestamp would either understate or
 * overstate every individual file's real staleness window.
 *
 * NEVER persist an inconclusive/timed-out `touchFile` result here — an
 * unconfirmed result read back as "cached clean" on a later sweep is exactly
 * the false-clean bug class #571/#630 already fixed for the live path; a
 * caching layer must not reintroduce that failure shape via a second
 * mechanism. Callers must only pass CONFIRMED results (see
 * `LSPWorkspaceDiagnosticResult.timedOut` in `./index.ts`) into
 * `WorkspaceDiagnosticsCacheEntry`.
 */
export const WORKSPACE_DIAGNOSTICS_CACHE_VERSION = 1;
const CACHE_FILE = "lsp-workspace-diagnostics.json";
function cachePath(cwd) {
    return path.join(getProjectDataDir(cwd), "cache", CACHE_FILE);
}
/** Fail-safe on any read/parse/shape problem: return `undefined` so the
 * caller treats a stale/missing/corrupt cache as "nothing cached" — every
 * file then falls through to a fresh touch, same fail-open posture as
 * `loadProjectDiagnosticsSnapshot`. */
export function loadWorkspaceDiagnosticsCache(cwd) {
    return readJsonCache(cachePath(cwd), (parsed) => {
        if (!parsed || typeof parsed !== "object")
            return undefined;
        const cache = parsed;
        if (cache.version !== WORKSPACE_DIAGNOSTICS_CACHE_VERSION)
            return undefined;
        if (!cache.entries || typeof cache.entries !== "object")
            return undefined;
        return cache;
    });
}
export function saveWorkspaceDiagnosticsCache(cwd, cache) {
    const filePath = cachePath(cwd);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(cache, null, 2));
}
/**
 * True when `filePath`'s cached entry is still trustworthy enough to reuse
 * instead of paying for a fresh `touchFile`.
 *
 * Two invalidation layers:
 * 1. The file's OWN mtime must be unchanged since it was scanned (exact
 *    match against `entry.mtimeMs`) — any drift, or a stat failure
 *    (deleted/unreadable), invalidates.
 * 2. When a reverse-dependency index is available (`getImports` returns an
 *    array rather than `undefined`), every file THIS file imports must not
 *    have changed after `entry.scannedAt` either — this is the fix for the
 *    cross-file blind spot plain mtime-checking has: a TypeScript diagnostic
 *    on file A can change purely because a dependency B's exported shape
 *    changed, with zero edits to A's own bytes/mtime.
 *
 * `getImports` returning `undefined` means "no dependency graph available
 * for this project this session" (e.g. no cascade/session-start has built
 * `clients/reverse-deps.ts`'s persisted index yet). That is a real, expected
 * state (a cold session, or a project where the cascade path hasn't run) —
 * we fail OPEN per-file to mtime-only invalidation in that case rather than
 * refusing to use the cache at all, matching the same blind spot the
 * cheap-tier `project-diagnostics.json` cache already accepts today. Once a
 * reverse-deps index IS available, this function upgrades to using it
 * automatically — no separate cache format/version needed.
 */
export function isEntryFresh(filePath, entry, getImports) {
    let ownMtime;
    try {
        ownMtime = fs.statSync(filePath).mtimeMs;
    }
    catch {
        return false; // deleted / unreadable
    }
    if (ownMtime !== entry.mtimeMs)
        return false;
    const imports = getImports(filePath);
    if (imports === undefined)
        return true; // no dep graph this session: mtime-only
    for (const dep of imports) {
        try {
            if (fs.statSync(dep).mtimeMs > entry.scannedAt)
                return false;
        }
        catch {
            return false; // dependency deleted/unreadable: fail closed
        }
    }
    return true;
}
/** Cache-map key helper — every read/write of `WorkspaceDiagnosticsCache.entries`
 * must go through this so `/`↔`\` and casing differences (#210's read-guard
 * bug class) can never produce a false cache miss OR a false cache hit. */
export function cacheKeyFor(filePath) {
    return normalizeMapKey(filePath);
}
/**
 * Fingerprint identifying "what a touch actually covered" — see the
 * `scopeKey` doc on `WorkspaceDiagnosticsCacheEntry`. Both sweep call sites
 * (`runWorkspaceDiagnostics` and `tools/lsp-diagnostics.ts`'s batch/directory
 * scan) build this from the same two inputs (`touchFile`'s `clientScope` and
 * `excludeServerIds`) so an entry is only ever reused where its coverage is
 * IDENTICAL to what the new lookup is asking for.
 */
export function buildScopeKey(clientScope, excludeServerIds) {
    const excluded = excludeServerIds
        ? [...excludeServerIds].sort((a, b) => a.localeCompare(b))
        : [];
    return `${clientScope}|${excluded.join(",")}`;
}
export function createWorkspaceDiagnosticsCacheContext(cwd) {
    const root = path.resolve(cwd);
    const existing = loadWorkspaceDiagnosticsCache(root);
    const entries = {
        ...(existing?.entries ?? {}),
    };
    const reverseDepsIndex = loadReverseDependencyIndexFromSnapshot({
        cwd: root,
    });
    const getImports = (filePath) => {
        if (!reverseDepsIndex)
            return undefined;
        return reverseDepsIndex.imports[cacheKeyFor(filePath)] ?? [];
    };
    let dirty = false;
    return {
        lookup(filePath, scopeKey) {
            const entry = entries[cacheKeyFor(filePath)];
            if (!entry || entry.scopeKey !== scopeKey)
                return undefined;
            if (!isEntryFresh(filePath, entry, getImports))
                return undefined;
            return { diagnostics: entry.diagnostics, count: entry.count };
        },
        record(filePath, scopeKey, diagnostics, mtimeMs) {
            entries[cacheKeyFor(filePath)] = {
                diagnostics,
                count: diagnostics.length,
                mtimeMs,
                scannedAt: Date.now(),
                scopeKey,
            };
            dirty = true;
        },
        persist() {
            if (!dirty)
                return;
            try {
                saveWorkspaceDiagnosticsCache(root, {
                    version: WORKSPACE_DIAGNOSTICS_CACHE_VERSION,
                    entries,
                });
                dirty = false;
            }
            catch {
                // Best-effort: a failed cache write just means the next sweep pays
                // the full cost again — never worth failing the sweep itself over.
            }
        },
    };
}
