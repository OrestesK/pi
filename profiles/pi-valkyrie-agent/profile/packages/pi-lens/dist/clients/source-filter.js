/**
 * Source File Filter — Deduplicates source files by detecting build artifacts.
 *
 * Problem: When scanning a codebase, we encounter both source files and their
 * compiled/transpiled outputs (TypeScript → JavaScript, Vue → JavaScript, etc.).
 * Scanning both wastes time and produces duplicate findings.
 *
 * Solution: For each file, check if a "higher precedence" source sibling exists.
 * If yes, skip the file as a build artifact. If no, keep it as hand-written source.
 *
 * Supported ecosystems:
 * - TypeScript: .ts shadows .js, .tsx shadows .jsx
 * - Vue/Svelte: .vue/.svelte shadows .js
 * - CoffeeScript: .coffee shadows .js
 *
 * Files without higher-precedence siblings are kept only when they do not look
 * generated/codegen-produced (hand-written JS, Python, Go, Rust, etc.).
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectIgnoreMatcher } from "./file-utils.js";
import { isDeclarationFile, isGeneratedOrArtifact, } from "./generated-artifacts.js";
import { normalizeEphemeralMapKey } from "./path-utils.js";
import { isSlowFs, SLOW_FS_REDUCED_MAX_FILES } from "./slow-fs.js";
import { readDirEntriesSafe, shouldRecurseIntoDir } from "./source-walker.js";
/**
 * Create a fresh, empty per-walk probe cache. Callers that enumerate many
 * files (a single `collectSourceFiles`/`collectSourceFilesAsync` invocation)
 * should create one of these at the start of the walk and pass it through;
 * it must not be reused across separate walks.
 */
export function createArtifactProbeCache() {
    return new Map();
}
function probeExists(filePath, cache) {
    if (!cache)
        return fs.existsSync(filePath);
    const key = normalizeEphemeralMapKey(filePath);
    const cached = cache.get(key);
    if (cached !== undefined)
        return cached;
    const result = fs.existsSync(filePath);
    cache.set(key, result);
    return result;
}
/**
 * Mapping of file extension to the extensions it shadows (build artifacts).
 * Order matters: first entry has highest precedence.
 */
export const SOURCE_PRECEDENCE = {
    ".ts": [".js", ".mjs", ".cjs"],
    ".tsx": [".jsx", ".js", ".mjs", ".cjs"],
    ".vue": [".js", ".mjs"],
    ".svelte": [".js", ".mjs"],
    ".coffee": [".js"],
};
/**
 * All extensions that could be source or artifacts, in precedence order.
 */
export const ALL_SCANNABLE_EXTENSIONS = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".vue",
    ".svelte",
    ".coffee",
    ".py",
    ".go",
    ".rs",
    ".rb",
    ".rake",
    ".gemspec",
    ".ru",
];
function shouldSkipGeneratedOrArtifact(filePath, options) {
    const includeDeclarations = options?.includeDeclarationFiles === true;
    if (options?.includeGenerated === true) {
        return !includeDeclarations && isDeclarationFile(filePath);
    }
    return isGeneratedOrArtifact(filePath, {
        readContentHeader: options?.inspectGeneratedHeaders !== false,
        includeDeclarations: !includeDeclarations,
    });
}
/**
 * Extract the basename (filename without extension) from a path.
 */
function getBasename(filePath) {
    const ext = path.extname(filePath);
    return path.basename(filePath, ext);
}
/**
 * Get the directory of a file path.
 */
function getDir(filePath) {
    return path.dirname(filePath);
}
/**
 * Check if a file has a higher-precedence source sibling.
 * Returns the shadowing source file path if found, null otherwise.
 */
export function findSourceSibling(filePath, probeCache) {
    const ext = path.extname(filePath).toLowerCase();
    const dir = getDir(filePath);
    const base = getBasename(filePath);
    // Find which precedence group this extension belongs to
    for (const [sourceExt, shadowedExts] of Object.entries(SOURCE_PRECEDENCE)) {
        if (shadowedExts.includes(ext)) {
            // This file could be shadowed by a source file with sourceExt
            const siblingPath = path.join(dir, base + sourceExt);
            if (probeExists(siblingPath, probeCache)) {
                return siblingPath;
            }
        }
    }
    return null;
}
/**
 * Check if a file is a build artifact (has a source sibling).
 *
 * @param probeCache - Optional per-walk memo (see {@link ArtifactProbeCache}).
 * Omit for the original, uncached behavior.
 */
export function isBuildArtifact(filePath, probeCache) {
    return findSourceSibling(filePath, probeCache) !== null;
}
/**
 * Filter a list of files, removing build artifacts that have source siblings
 * plus likely generated/codegen artifacts.
 * Returns de-duplicated list keeping only highest-precedence source files.
 */
export function filterSourceFiles(filePaths, options) {
    // Track which files we're keeping and why we're skipping others
    const keep = [];
    const skipReasons = new Map(); // skipped file -> kept source
    // This is itself one enumeration over `filePaths`, so a per-call memo is
    // safe by the same point-in-time-snapshot reasoning as the directory
    // walkers below (refs #191).
    const probeCache = createArtifactProbeCache();
    for (const filePath of filePaths) {
        const sourceSibling = findSourceSibling(filePath, probeCache);
        if (sourceSibling) {
            // This is a build artifact, skip it
            skipReasons.set(filePath, sourceSibling);
        }
        else if (shouldSkipGeneratedOrArtifact(filePath, options)) {
            // Generated/codegen outputs are not hand-written source.
            skipReasons.set(filePath, "generated-or-artifact");
        }
        else {
            // No higher-precedence source, keep it
            keep.push(filePath);
        }
    }
    return keep;
}
function resolveCollectionConfig(rootDir, options, config) {
    const rawMax = options?.maxFiles;
    const requestedMax = typeof rawMax === "number" && Number.isFinite(rawMax) && rawMax > 0
        ? Math.floor(rawMax)
        : Number.POSITIVE_INFINITY;
    // Slow-FS mode (#462): the sync collector can't yield to the event loop, so
    // on a measured-slow filesystem (9p/drvfs/NFS) clamp its walk to a much
    // smaller cap regardless of what the caller asked for. The async twin
    // (`collectSourceFilesAsync`) yields every N entries and keeps its normal
    // cap — callers that can go async should prefer it instead of relying on
    // this clamp.
    const maxFiles = config?.clampForSlowFsSyncWalk === true && isSlowFs(rootDir)
        ? Math.min(requestedMax, SLOW_FS_REDUCED_MAX_FILES)
        : requestedMax;
    return {
        ignoreMatcher: getProjectIgnoreMatcher(rootDir),
        extraExcludePatterns: options?.excludeDirs ?? [],
        extensions: new Set(options?.extensions || ALL_SCANNABLE_EXTENSIONS),
        maxFiles,
        options,
    };
}
/**
 * Decide how to handle a single directory entry. Returns the subdirectory to
 * recurse into (`recurseInto`), the source file to keep (`keepFile`), or
 * neither (skip). Shared verbatim by the sync and async collectors so they
 * produce identical results — the only difference between the two is that the
 * async variant yields to the event loop every N entries.
 */
function classifyEntry(entry, fullPath, cfg, probeCache) {
    const { ignoreMatcher, extraExcludePatterns, extensions, options } = cfg;
    if (entry.isDirectory()) {
        const canRecurse = shouldRecurseIntoDir(entry, fullPath, {
            ignoreMatcher,
            extraExcludeDirs: extraExcludePatterns,
            skipGeneratedArtifactDirs: options?.includeGenerated !== true,
            followSymlinks: options?.followSymlinks === true,
        });
        if (!canRecurse)
            return {};
        return { recurseInto: fullPath };
    }
    if (entry.isFile()) {
        if (ignoreMatcher.isIgnored(fullPath, false))
            return {};
        const ext = path.extname(entry.name).toLowerCase();
        if (!extensions.has(ext))
            return {};
        // Skip if this is a build artifact or generated/codegen output.
        if (isBuildArtifact(fullPath, probeCache))
            return {};
        if (shouldSkipGeneratedOrArtifact(fullPath, options))
            return {};
        return { keepFile: fullPath };
    }
    return {};
}
export function collectSourceFiles(dir, options) {
    const rootDir = path.resolve(dir);
    const cfg = resolveCollectionConfig(rootDir, options, {
        clampForSlowFsSyncWalk: true,
    });
    const files = [];
    // Per-walk sibling-probe memo (refs #191, item 1). Created here, discarded
    // on return — never persisted across calls.
    const probeCache = createArtifactProbeCache();
    function scan(currentDir) {
        if (files.length >= cfg.maxFiles)
            return; // hard cap (#250)
        const entries = readDirEntriesSafe(currentDir);
        for (const entry of entries) {
            if (files.length >= cfg.maxFiles)
                return;
            const fullPath = path.join(currentDir, entry.name);
            const { recurseInto, keepFile } = classifyEntry(entry, fullPath, cfg, probeCache);
            if (recurseInto)
                scan(recurseInto);
            else if (keepFile)
                files.push(keepFile);
        }
    }
    scan(rootDir);
    return files;
}
/**
 * Async, chunked-yield twin of {@link collectSourceFiles}. Returns the exact
 * same file list (it shares `classifyEntry`), but yields to the event loop
 * every `yieldEvery` directory entries so a large tree never holds the loop in
 * one synchronous burst.
 *
 * Why this exists: on a ~2k-file project the synchronous `collectSourceFiles`
 * blocks the loop for ~1.5s on a cold scan (≈70% of that is the per-file
 * generated-header read inside `shouldSkipGeneratedOrArtifact`). When that runs
 * on a hook tick — even a deferred background one — pi's TUI input stalls for
 * the whole burst. Background / deferred callers should prefer this variant;
 * the sync version is kept for synchronous call sites and tests.
 */
export async function collectSourceFilesAsync(dir, options) {
    const rootDir = path.resolve(dir);
    const cfg = resolveCollectionConfig(rootDir, options);
    // #703: prime the tracked-files set once before the walk so a tracked file
    // matching a `.gitignore`/global pattern still surfaces (the review-graph
    // build walk, word-index, and every other async caller of this function
    // funnel through here). Fail-open on no-git/spawn failure.
    await cfg.ignoreMatcher.ensureTrackedIndex();
    // 50 entries/chunk keeps the worst-case synchronous burst under ~40ms even
    // on a cold scan where every kept file pays the 4 KB generated-header read
    // (measured on a 2k-file fixture). Larger values regress past the ~50ms
    // event-loop budget; see PERF-AUDIT.md.
    const yieldEvery = Math.max(1, options?.yieldEvery ?? 50);
    const files = [];
    // Depth-first stack mirrors the recursion order of the sync collector.
    const stack = [rootDir];
    let processedSinceYield = 0;
    // Per-walk sibling-probe memo (refs #191, item 1). A single async walk is
    // still one point-in-time snapshot despite yielding between chunks, so
    // caching across the whole call remains invalidation-free.
    const probeCache = createArtifactProbeCache();
    while (stack.length > 0) {
        const currentDir = stack.pop();
        if (currentDir === undefined)
            continue;
        const entries = readDirEntriesSafe(currentDir);
        // Push subdirectories in reverse so the deepest-first pop order matches
        // the sync collector's left-to-right recursion within a directory.
        const subDirs = [];
        for (const entry of entries) {
            const fullPath = path.join(currentDir, entry.name);
            const { recurseInto, keepFile } = classifyEntry(entry, fullPath, cfg, probeCache);
            if (recurseInto)
                subDirs.push(recurseInto);
            else if (keepFile) {
                files.push(keepFile);
                if (files.length >= cfg.maxFiles)
                    return files; // hard cap (#250)
            }
            if (++processedSinceYield >= yieldEvery) {
                processedSinceYield = 0;
                await new Promise((resolve) => setImmediate(resolve));
            }
        }
        for (let i = subDirs.length - 1; i >= 0; i--)
            stack.push(subDirs[i]);
    }
    return files;
}
/**
 * Get statistics about source file filtering for debugging/monitoring.
 */
export function getFilterStats(allFiles, filteredFiles) {
    const skipped = allFiles.length - filteredFiles.length;
    const byType = {};
    // Count what we skipped
    for (const file of allFiles) {
        if (!filteredFiles.includes(file)) {
            const ext = path.extname(file).toLowerCase();
            byType[ext] = (byType[ext] || 0) + 1;
        }
    }
    return {
        total: allFiles.length,
        kept: filteredFiles.length,
        skipped,
        byType,
    };
}
