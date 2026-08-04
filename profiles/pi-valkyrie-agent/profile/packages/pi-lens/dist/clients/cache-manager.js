/**
 * CacheManager for pi-lens.
 *
 * Manages persistent cache for scanner results and turn state.
 * Provides read/write/freshness checks for:
 * - Scanner cache: .pi-lens/cache/{scanner}.json
 * - Turn state: .pi-lens/turn-state.json
 *
 * All paths are relative to project root (process.cwd()).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
import { readJsonCache } from "./json-cache-read.js";
import { normalizeMapKey } from "./path-utils.js";
// --- Defaults ---
const DEFAULT_MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_TURN_STATE = {
    files: {},
    turnCycles: 0,
    maxCycles: 3,
    lastUpdated: "",
};
// --- Helpers ---
function getLensDir(cwd) {
    return getProjectDataDir(cwd);
}
function getCacheDir(cwd) {
    return path.join(getLensDir(cwd), "cache");
}
function getTurnStatePath(cwd) {
    return path.join(getLensDir(cwd), "turn-state.json");
}
// --- Cache Manager ---
export class CacheManager {
    log;
    constructor(verbose = false) {
        this.log = verbose
            ? (msg) => console.error(`[cache] ${msg}`)
            : () => { };
    }
    /**
     * Convert a file path to a stable turn-state key.
     * Uses normalized absolute paths first, then stores cwd-relative keys when possible.
     */
    toTurnStateKey(filePath, cwd) {
        const cwdNorm = normalizeMapKey(path.resolve(cwd));
        const fileNorm = normalizeMapKey(path.resolve(cwd, filePath));
        const rel = path.relative(cwdNorm, fileNorm).replace(/\\/g, "/");
        if (!rel || rel === ".")
            return fileNorm;
        if (rel === ".." || rel.startsWith("../"))
            return fileNorm;
        return rel;
    }
    /**
     * Get turn-state entry for a file path using normalized lookup.
     */
    getTurnFileState(filePath, cwd) {
        const state = this.readTurnState(cwd);
        const key = this.toTurnStateKey(filePath, cwd);
        return state.files[key];
    }
    // ---- Scanner Cache ----
    /**
     * Read a scanner cache entry. Returns null if not found or stale.
     */
    readCache(scanner, cwd, maxAgeMs = DEFAULT_MAX_AGE_MS) {
        const cachePath = path.join(getCacheDir(cwd), `${scanner}.json`);
        const metaPath = path.join(getCacheDir(cwd), `${scanner}.meta.json`);
        if (!fs.existsSync(cachePath) || !fs.existsSync(metaPath)) {
            this.log(`Cache miss: ${scanner} (files don't exist)`);
            return null;
        }
        try {
            const onReadError = (err) => {
                this.log(`Cache read error: ${scanner} — ${err}`);
            };
            const meta = readJsonCache(metaPath, (parsed) => parsed, onReadError);
            if (meta === undefined)
                return null;
            const age = Date.now() - new Date(meta.timestamp).getTime();
            if (age > maxAgeMs) {
                this.log(`Cache stale: ${scanner} (age: ${Math.round(age / 1000)}s, max: ${maxAgeMs / 1000}s)`);
                return null;
            }
            const data = readJsonCache(cachePath, (parsed) => parsed, onReadError);
            if (data === undefined)
                return null;
            this.log(`Cache hit: ${scanner} (age: ${Math.round(age / 1000)}s)`);
            return { data, meta };
        }
        catch (err) {
            this.log(`Cache read error: ${scanner} — ${err}`);
            return null;
        }
    }
    /**
     * Write a scanner cache entry.
     */
    writeCache(scanner, data, cwd, extraMeta) {
        const cacheDir = getCacheDir(cwd);
        fs.mkdirSync(cacheDir, { recursive: true });
        const cachePath = path.join(cacheDir, `${scanner}.json`);
        const metaPath = path.join(cacheDir, `${scanner}.meta.json`);
        const meta = {
            timestamp: new Date().toISOString(),
            ...extraMeta,
        };
        fs.writeFileSync(cachePath, JSON.stringify(data, null, 2));
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
        this.log(`Cache written: ${scanner}`);
    }
    /**
     * Check if a cache entry is fresh (exists and not expired).
     */
    isCacheFresh(scanner, cwd, maxAgeMs = DEFAULT_MAX_AGE_MS) {
        const metaPath = path.join(getCacheDir(cwd), `${scanner}.meta.json`);
        if (!fs.existsSync(metaPath))
            return false;
        try {
            const meta = readJsonCache(metaPath, (parsed) => parsed);
            if (meta === undefined)
                return false;
            const age = Date.now() - new Date(meta.timestamp).getTime();
            return age <= maxAgeMs;
        }
        catch {
            return false;
        }
    }
    /**
     * Clear a specific cache entry.
     */
    clearCache(scanner, cwd) {
        const cachePath = path.join(getCacheDir(cwd), `${scanner}.json`);
        const metaPath = path.join(getCacheDir(cwd), `${scanner}.meta.json`);
        for (const p of [cachePath, metaPath]) {
            try {
                fs.unlinkSync(p);
            }
            catch (err) {
                // ENOENT: file doesn't exist, other errors logged
                if (err.code !== "ENOENT") {
                    this.log(`Failed to delete ${p}: ${err}`);
                }
            }
        }
    }
    // ---- Turn State ----
    /**
     * Read turn state. Returns default if not found.
     */
    readTurnState(cwd) {
        const statePath = getTurnStatePath(cwd);
        if (!fs.existsSync(statePath)) {
            return {
                ...DEFAULT_TURN_STATE,
                files: {},
                lastUpdated: new Date().toISOString(),
            };
        }
        const state = readJsonCache(statePath, (parsed) => parsed);
        return (state ?? {
            ...DEFAULT_TURN_STATE,
            files: {},
            lastUpdated: new Date().toISOString(),
        });
    }
    /**
     * Write turn state.
     */
    writeTurnState(state, cwd) {
        const lensDir = getLensDir(cwd);
        fs.mkdirSync(lensDir, { recursive: true });
        const statePath = getTurnStatePath(cwd);
        state.lastUpdated = new Date().toISOString();
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    }
    /**
     * Add or update a file's modified ranges in turn state.
     * Merges overlapping ranges.
     */
    addModifiedRange(filePath, range, importsChanged, cwd, sessionId) {
        const state = this.readTurnState(cwd);
        if (sessionId)
            state.sessionId = sessionId;
        const normalizedPath = this.toTurnStateKey(filePath, cwd);
        const existing = state.files[normalizedPath];
        if (existing) {
            // Merge ranges
            existing.modifiedRanges = this.mergeRanges([
                ...existing.modifiedRanges,
                range,
            ]);
            existing.importsChanged = existing.importsChanged || importsChanged;
            existing.lastEdit = new Date().toISOString();
        }
        else {
            state.files[normalizedPath] = {
                modifiedRanges: [range],
                importsChanged,
                lastEdit: new Date().toISOString(),
            };
        }
        this.writeTurnState(state, cwd);
        return state;
    }
    /**
     * Clear turn state (after turn_end processes it).
     */
    clearTurnState(cwd) {
        const state = {
            ...DEFAULT_TURN_STATE,
            files: {}, // fresh object — DEFAULT_TURN_STATE.files can be polluted by addModifiedRange
            lastUpdated: new Date().toISOString(),
        };
        this.writeTurnState(state, cwd);
    }
    /**
     * Increment turn cycle counter.
     */
    incrementTurnCycle(cwd) {
        const state = this.readTurnState(cwd);
        state.turnCycles++;
        this.writeTurnState(state, cwd);
        return state;
    }
    /**
     * Check if max cycles exceeded.
     */
    isMaxCyclesExceeded(cwd) {
        const state = this.readTurnState(cwd);
        return state.turnCycles >= state.maxCycles;
    }
    /**
     * Get files that need jscpd re-scan (any edit).
     * Only returns source code files jscpd can meaningfully analyse.
     */
    getFilesForJscpd(cwd) {
        const state = this.readTurnState(cwd);
        return Object.keys(state.files).filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|rb|java|cs|php|cpp|c|h|hpp|swift|kt)$/.test(f));
    }
    /**
     * Get files that need madge re-scan (imports changed).
     */
    getFilesForMadge(cwd) {
        const state = this.readTurnState(cwd);
        return Object.entries(state.files)
            .filter(([, f]) => f.importsChanged)
            .map(([p]) => p);
    }
    // ---- Utilities ----
    /**
     * Merge overlapping or adjacent ranges.
     */
    mergeRanges(ranges) {
        if (ranges.length === 0)
            return [];
        const sorted = [...ranges].sort((a, b) => a.start - b.start);
        const merged = [sorted[0]];
        for (const current of sorted.slice(1)) {
            const last = merged[merged.length - 1];
            if (current.start <= last.end + 1) {
                last.end = Math.max(last.end, current.end);
            }
            else {
                merged.push({ ...current });
            }
        }
        return merged;
    }
    /**
     * Check if a line falls within any modified range.
     */
    isLineInModifiedRange(line, ranges) {
        return ranges.some((r) => r.start <= line && line <= r.end);
    }
}
