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
