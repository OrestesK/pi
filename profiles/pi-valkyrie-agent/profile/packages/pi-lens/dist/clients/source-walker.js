/**
 * Shared directory-walk primitives (refs #191, "unify the three divergent
 * source walkers").
 *
 * `source-filter.ts` (`collectSourceFiles`/`collectSourceFilesAsync`),
 * `language-profile.ts` (`collectSourceFilesForWarmup`), and
 * `startup-scan.ts` (`countSourceFilesWithinLimit`/`countSourceFilesWithinLimitAsync`)
 * each re-implement a `readdirSync` + ignore-matcher + exclude-dir walk. The
 * SonarCloud duplication flagged on PR #188's async variants is a symptom of
 * this repeated boilerplate.
 *
 * This module intentionally does NOT own the full traversal loop for any
 * caller. Each walker's loop shape (sync-recursive vs. stack-based, yield
 * cadence, file-classification rules — extensions vs. regex vs. build-artifact
 * detection, hard caps vs. count-and-early-exit) is caller-specific and
 * preserved exactly where it already lived; unifying those would silently
 * change observable behavior (e.g. which files survive a `maxFiles` cap on an
 * over-large tree), which issue #191 explicitly calls out as NOT to do
 * silently.
 *
 * What genuinely was duplicated five times across those files is:
 *   1. The "should I recurse into this directory" decision — ignore-matcher +
 *      exclude-dir-name, plus two checks only `source-filter.ts` needs
 *      (generated-artifact directories, symlink-following).
 *   2. The `readdirSync(..., { withFileTypes: true })` + try/catch-swallow
 *      boilerplate (a missing/unreadable directory is silently skipped).
 * Both are centralized here so there is exactly one place that encodes "what
 * counts as an excluded directory."
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { isExcludedDirName } from "./file-utils.js";
import { isGeneratedArtifactDirectoryName } from "./generated-artifacts.js";
/**
 * Read a directory's entries, returning `[]` for a permission-denied or
 * missing directory instead of throwing. Shared by every walker below — a
 * directory can legitimately disappear or become unreadable mid-walk (race
 * with another process, a broken symlink target, etc.) and every existing
 * caller already treated that as "yields no entries," not a hard failure.
 */
export function readDirEntriesSafe(dirPath) {
    try {
        return fs.readdirSync(dirPath, { withFileTypes: true });
    }
    catch {
        return [];
    }
}
/**
 * The one shared "should this directory be walked into" decision. Every
 * caller's own loop still owns *when* to call this (inline recursion vs. a
 * stack) and what to do with the answer.
 */
export function shouldRecurseIntoDir(entry, fullPath, policy) {
    if (isExcludedDirName(entry.name, policy.extraExcludeDirs ?? [])) {
        return false;
    }
    if (policy.ignoreMatcher.isIgnored(fullPath, true))
        return false;
    if (policy.skipGeneratedArtifactDirs === true &&
        isGeneratedArtifactDirectoryName(entry.name)) {
        return false;
    }
    if (policy.followSymlinks !== true && entry.isSymbolicLink())
        return false;
    return true;
}
/**
 * The one depth-first stack loop, written once as a generator so the sync and
 * async drivers below can't drift: it yields after every visited entry (the
 * async driver's chance to `setImmediate` between steps; the sync driver just
 * drains it), and its return value is true iff the visitor stopped the walk
 * via `"stop"` (vs. exhausting the tree or tripping `shouldStop`). Within each
 * directory, entries are visited left-to-right; entries the visitor marks
 * `"recurse"` are gathered and pushed in reverse after the entry loop, so the
 * pop order descends left-to-right.
 */
function* walkTreeStackSteps(rootDir, visit, shouldStop) {
    const stack = [rootDir];
    while (stack.length > 0) {
        if (shouldStop?.())
            return false;
        const dir = stack.pop();
        if (dir === undefined)
            continue;
        const subDirs = [];
        for (const entry of readDirEntriesSafe(dir)) {
            const fullPath = path.join(dir, entry.name);
            const disposition = visit(entry, fullPath);
            if (disposition === "stop")
                return true;
            if (disposition === "recurse")
                subDirs.push(fullPath);
            yield;
        }
        for (let i = subDirs.length - 1; i >= 0; i--)
            stack.push(subDirs[i]);
    }
    return false;
}
/**
 * Depth-first, stack-based synchronous driver — drains
 * {@link walkTreeStackSteps} with no pause between steps. Returns true iff the
 * visitor stopped the walk via `"stop"`.
 */
export function walkTreeStackSync(rootDir, visit, opts = {}) {
    const steps = walkTreeStackSteps(rootDir, visit, opts.shouldStop);
    let step = steps.next();
    while (!step.done)
        step = steps.next();
    return step.value;
}
/**
 * Async, chunked-yield twin of {@link walkTreeStackSync} — the identical
 * {@link walkTreeStackSteps} traversal, plus a `setImmediate` yield every
 * `yieldEvery` processed entries so a large tree never holds the event loop in
 * one synchronous burst. Returns true iff the visitor stopped the walk via
 * `"stop"`.
 */
export async function walkTreeStackAsync(rootDir, visit, opts) {
    await opts.beforeWalk?.();
    const steps = walkTreeStackSteps(rootDir, visit, opts.shouldStop);
    let processedSinceYield = 0;
    let step = steps.next();
    while (!step.done) {
        if (++processedSinceYield >= opts.yieldEvery) {
            processedSinceYield = 0;
            await new Promise((resolve) => setImmediate(resolve));
        }
        step = steps.next();
    }
    return step.value;
}
/**
 * Depth-first synchronous driver that descends into a `"recurse"` directory
 * IMMEDIATELY, before visiting the remaining sibling entries — the recursion
 * shape (and therefore the result-array order) of `source-filter.ts`'s sync
 * collector, which its stack-based async twin deliberately does NOT share.
 * Returns true iff the visitor stopped the walk via `"stop"`; the stop
 * propagates up through every recursion frame so the walk halts at once.
 */
export function walkTreeRecursiveSync(rootDir, visit) {
    function scan(currentDir) {
        for (const entry of readDirEntriesSafe(currentDir)) {
            const fullPath = path.join(currentDir, entry.name);
            const disposition = visit(entry, fullPath);
            if (disposition === "stop")
                return true;
            if (disposition === "recurse" && scan(fullPath))
                return true;
        }
        return false;
    }
    return scan(rootDir);
}
