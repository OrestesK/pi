/**
 * Project-level `.pi-lens.json` config loader.
 *
 * Reads an optional `.pi-lens.json` (or `pi-lens.json`) at the project root and
 * surfaces two fields the rest of pi-lens now honors:
 *
 *   - `ignore` — gitignore-style glob patterns added to every scan (LSP walk,
 *     fact-rules, tree-sitter, jscpd, knip, review graph, source-filter). Wired
 *     into `getProjectIgnoreMatcher` in `file-utils.ts` via the existing
 *     `createProjectIgnoreMatcher(rootDir, extraPatterns)` extension point.
 *
 *   - `rules` — per-rule threshold overrides. Currently honored:
 *       rules["high-complexity"].threshold — cyclomatic complexity (default 15)
 *       rules["high-fan-out"].threshold   — distinct-function calls (default 20)
 *
 * The file is loaded once per `(path, mtimeMs)` and cached — editing the file
 * invalidates the cache so the next access sees the new values without
 * restarting pi. Discovery is cached by starting directory and validated by the
 * cached directory mtimes plus the config-file mtime, so hot paths do not repeat
 * candidate-file probes on every dispatch.
 *
 * The loader walks up from the starting directory until it finds a config file
 * (mirroring `lsp/config.ts`'s `loadLSPConfig` so project-monorepos with a
 * `.pi-lens.json` at the repo root work without per-subdir configs).
 *
 * A malformed file is treated as "no config" and logged once — we never want a
 * stray syntax error in user-edited JSON to break diagnostics.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { walkUpDirs } from "./path-utils.js";
const PROJECT_CONFIG_BASENAMES = [".pi-lens.json", "pi-lens.json"];
export const EMPTY_PROJECT_CONFIG = {
    ignore: [],
    rules: {},
    raw: undefined,
    configPath: undefined,
};
/** Cache by absolute config path; we read each candidate's mtime before reuse. */
const configCache = new Map();
const discoveryCache = new Map();
const warnedInvalidConfigs = new Set();
/**
 * Walk up from `startDir` looking for a `.pi-lens.json` or `pi-lens.json`.
 * Returns the parsed config, or an empty config if none was found.
 */
export function loadPiLensProjectConfig(startDir, preloadedInfo = findPiLensProjectConfig(startDir)) {
    const configInfo = preloadedInfo;
    if (!configInfo)
        return EMPTY_PROJECT_CONFIG;
    const cached = configCache.get(configInfo.path);
    if (cached && cached.mtimeMs === configInfo.mtimeMs) {
        return cached.config;
    }
    const config = parseConfigFile(configInfo.path);
    configCache.set(configInfo.path, { mtimeMs: configInfo.mtimeMs, config });
    return config;
}
/** For tests + callers that need to force a re-read (e.g. config-watcher hooks). */
export function resetProjectLensConfigCache() {
    configCache.clear();
    discoveryCache.clear();
    warnedInvalidConfigs.clear();
}
export function findPiLensProjectConfig(startDir) {
    const cacheKey = path.resolve(startDir);
    const cached = discoveryCache.get(cacheKey);
    if (cached && discoveryCacheStillFresh(cached)) {
        if (!cached.info)
            return undefined;
        const stat = safeFileStat(cached.info.path);
        if (stat?.isFile())
            return { ...cached.info, mtimeMs: stat.mtimeMs };
    }
    const discovered = discoverPiLensProjectConfig(cacheKey);
    discoveryCache.set(cacheKey, discovered);
    return discovered.info;
}
function safeFileStat(filePath) {
    try {
        return fs.statSync(filePath);
    }
    catch {
        return undefined;
    }
}
function safeDirMtimeMs(dir) {
    try {
        return fs.statSync(dir).mtimeMs;
    }
    catch {
        return -1;
    }
}
function discoveryCacheStillFresh(entry) {
    return entry.dirMtimes.every((cached) => safeDirMtimeMs(cached.dir) === cached.mtimeMs);
}
function discoverPiLensProjectConfig(startDir) {
    const dirMtimes = [];
    for (const dir of walkUpDirs(startDir)) {
        dirMtimes.push({ dir, mtimeMs: safeDirMtimeMs(dir) });
        for (const name of PROJECT_CONFIG_BASENAMES) {
            const candidate = path.join(dir, name);
            const stat = safeFileStat(candidate);
            if (stat?.isFile()) {
                return {
                    info: { path: candidate, dir, mtimeMs: stat.mtimeMs },
                    dirMtimes,
                };
            }
        }
    }
    return { info: undefined, dirMtimes };
}
function warnInvalidConfigOnce(configPath, reason) {
    const key = `${configPath}:${reason}`;
    if (warnedInvalidConfigs.has(key))
        return;
    warnedInvalidConfigs.add(key);
    console.error(`[pi-lens] ignoring invalid project config ${configPath}: ${reason}`);
}
function parseConfigFile(configPath) {
    let raw;
    try {
        const text = fs.readFileSync(configPath, "utf-8");
        raw = JSON.parse(text);
    }
    catch (error) {
        warnInvalidConfigOnce(configPath, error instanceof Error ? error.message : "failed to parse JSON");
        return EMPTY_PROJECT_CONFIG;
    }
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        warnInvalidConfigOnce(configPath, "top-level value must be an object");
        return EMPTY_PROJECT_CONFIG;
    }
    const obj = raw;
    const ignore = Array.isArray(obj.ignore)
        ? obj.ignore.filter((p) => typeof p === "string")
        : [];
    const rules = {};
    if (obj.rules && typeof obj.rules === "object" && !Array.isArray(obj.rules)) {
        const rawRules = obj.rules;
        for (const [ruleId, ruleCfg] of Object.entries(rawRules)) {
            if (!ruleCfg || typeof ruleCfg !== "object" || Array.isArray(ruleCfg)) {
                continue;
            }
            const r = ruleCfg;
            if (typeof r.threshold === "number" &&
                Number.isFinite(r.threshold) &&
                r.threshold > 0) {
                rules[ruleId] = { threshold: r.threshold };
            }
            else if ("threshold" in r) {
                warnInvalidConfigOnce(configPath, `rules.${ruleId}.threshold must be a positive finite number`);
            }
        }
    }
    return { ignore, rules, raw, configPath };
}
