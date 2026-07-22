import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectIgnoreMatcher, isExcludedDirName, } from "./file-utils.js";
import { isGeneratedArtifactDirectoryName, isGeneratedOrArtifact, } from "./generated-artifacts.js";
import { collectSourceFiles, collectSourceFilesAsync, } from "./source-filter.js";
export function shouldSkipProjectPath(filePath, options) {
    const isDirectory = options.isDirectory === true;
    const matcher = options.ignoreMatcher ?? getProjectIgnoreMatcher(options.rootDir);
    if (matcher.isIgnored(filePath, isDirectory))
        return true;
    const name = path.basename(filePath);
    if (isDirectory) {
        if (isExcludedDirName(name))
            return true;
        return (options.includeGenerated !== true &&
            isGeneratedArtifactDirectoryName(name));
    }
    return (options.includeGenerated !== true &&
        isGeneratedOrArtifact(filePath, {
            readContentHeader: options.inspectGeneratedHeaders !== false,
            includeDeclarations: options.includeDeclarationFiles !== true,
        }));
}
export function shouldScanProjectSourceFile(filePath, options) {
    try {
        if (!fs.statSync(filePath).isFile())
            return false;
    }
    catch {
        return false;
    }
    return !shouldSkipProjectPath(filePath, {
        ...options,
        isDirectory: false,
    });
}
export function collectProjectSourceFiles(rootDir, options) {
    return collectSourceFiles(rootDir, options);
}
/**
 * Async, chunked-yield twin of {@link collectProjectSourceFiles}. Produces the
 * exact same file list (it shares `classifyEntry` with the sync collector) but
 * yields to the event loop every N entries so a large-tree walk on a hot hook
 * tick (e.g. the per-edit cascade graph rebuild) never holds the loop in one
 * synchronous burst. Prefer this on the per-edit / per-cascade path.
 */
export function collectProjectSourceFilesAsync(rootDir, options) {
    return collectSourceFilesAsync(rootDir, options);
}
