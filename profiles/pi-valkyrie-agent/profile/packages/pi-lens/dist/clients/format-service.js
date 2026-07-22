/**
 * Format Service for pi-lens
 *
 * Concurrent formatter execution using Effect-TS.
 * Auto-formats files on write with a single selected formatter per file.
 *
 * Key features:
 * - Chooses one formatter per file using config-gated or smart-default policy
 * - Runs formatting with timeout protection
 * - FileTime integration for safety
 * - Explicit config wins; otherwise smart defaults apply
 */
import * as path from "node:path";
import { recordFormatter } from "./widget-state.js";
import { FileTime } from "./file-time.js";
import { clearFormatterRuntimeState, formatFile, getFormattersForFile, } from "./formatters.js";
// --- Configuration ---
/** Reserved for future batching; formatting currently runs one selected formatter per file. */
const DEFAULT_FORMATTER_CONCURRENCY = 1;
// --- Format Service ---
export class FormatService {
    fileTime;
    enabled;
    constructor(sessionID, enabled = true) {
        this.fileTime = new FileTime(sessionID);
        this.enabled = enabled;
    }
    /**
     * Format a file with the single selected formatter for that file.
     */
    async formatFile(filePath, options = {}) {
        const absolutePath = path.resolve(filePath);
        const cwd = path.dirname(absolutePath);
        // Skip if disabled
        if (options.skip || !this.enabled) {
            return {
                filePath: absolutePath,
                formatters: [],
                anyChanged: false,
                allSucceeded: true,
            };
        }
        // Check if file was modified externally (safety check)
        if (this.fileTime.hasChanged(absolutePath)) {
            console.warn(`[format] File ${absolutePath} modified externally, skipping format`);
            return {
                filePath: absolutePath,
                formatters: [],
                anyChanged: false,
                allSucceeded: false,
            };
        }
        // Get formatters for this file
        const formatters = options.formatters
            ? await this.getFormattersByName(options.formatters)
            : await getFormattersForFile(absolutePath, cwd);
        if (formatters.length === 0) {
            return {
                filePath: absolutePath,
                formatters: [],
                anyChanged: false,
                allSucceeded: true,
            };
        }
        // Run formatters with limited concurrency
        const results = await this.runFormattersWithConcurrency(absolutePath, formatters);
        // Record new file state after formatting
        this.fileTime.read(absolutePath);
        for (const [index, result] of results.entries()) {
            recordFormatter(absolutePath, formatters[index]?.name ?? "unknown", result.changed, result.success);
        }
        // Build summary
        const anyChanged = results.some((r) => r.changed);
        const allSucceeded = results.every((r) => r.success);
        return {
            filePath: absolutePath,
            formatters: results.map((r, i) => ({
                name: formatters[i].name,
                success: r.success,
                changed: r.changed,
                error: r.error,
            })),
            anyChanged,
            allSucceeded,
        };
    }
    /**
     * Run the selected formatter with timeout protection.
     */
    async runFormattersWithConcurrency(filePath, formatters, _concurrency = DEFAULT_FORMATTER_CONCURRENCY) {
        const results = [];
        for (const formatter of formatters) {
            try {
                const timeoutMs = 30000;
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error(`Formatter ${formatter.name} timed out after ${timeoutMs}ms`)), timeoutMs);
                });
                const result = await Promise.race([
                    formatFile(filePath, formatter),
                    timeoutPromise,
                ]);
                results.push(result);
            }
            catch (error) {
                results.push({
                    success: false,
                    changed: false,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return results;
    }
    /**
     * Get formatters by name (for explicit formatter selection)
     */
    async getFormattersByName(names) {
        const { listAllFormatters, ...formatters } = await import("./formatters.js");
        const allNames = listAllFormatters();
        return names
            .filter((name) => allNames.includes(name))
            .map((name) => {
            // Convert hyphenated name to camelCase then append Formatter
            // e.g. "php-cs-fixer" → "phpCsFixerFormatter", "clang-format" → "clangFormatFormatter"
            const camel = name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
            const key = `${camel}Formatter`;
            return formatters[key];
        })
            .filter(Boolean);
    }
    /**
     * Assert file hasn't changed before editing
     * Throws FileTimeError if file modified externally
     */
    assertUnchanged(filePath) {
        this.fileTime.assert(filePath);
    }
    /**
     * Check if file has changed externally
     */
    hasChanged(filePath) {
        return this.fileTime.hasChanged(filePath);
    }
    /**
     * Record file read (after agent reads file)
     */
    recordRead(filePath) {
        this.fileTime.read(filePath);
    }
    /**
     * Clear detection cache
     */
    clearCache() {
        clearFormatterRuntimeState();
    }
}
// --- Singleton Instance ---
let globalFormatService = null;
let currentSessionID = null;
export function getFormatService(sessionID, enabled = true) {
    // Create new instance if:
    // 1. No service exists yet
    // 2. Session ID changed (different session)
    const shouldCreateNew = !globalFormatService || (sessionID && sessionID !== currentSessionID);
    if (shouldCreateNew) {
        globalFormatService = new FormatService(sessionID ?? "default", enabled);
        currentSessionID = sessionID ?? "default";
    }
    return globalFormatService;
}
export function resetFormatService() {
    clearFormatterRuntimeState();
    globalFormatService = null;
    currentSessionID = null;
}
/**
 * Reset format service and clear all file tracking state.
 * Use this in tests to ensure complete isolation.
 */
export function clearFormatServiceAndFileState() {
    resetFormatService();
}
// Re-export for convenience
export { clearAllSessions } from "./file-time.js";
