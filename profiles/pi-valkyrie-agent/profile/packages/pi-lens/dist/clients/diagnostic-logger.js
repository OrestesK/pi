/**
 * Diagnostic Logger — append-only JSONL log for cross-session analytics
 *
 * Log file: ~/.pi-lens/logs/{date}.jsonl
 */
import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
function getLogDir() {
    return path.join(getGlobalPiLensDir(), "logs");
}
function getLogFile() {
    const date = new Date().toISOString().split("T")[0];
    return path.join(getLogDir(), `${date}.jsonl`);
}
// Module-level singleton — persists across all writes
let _logger = null;
export function getDiagnosticLogger() {
    if (!_logger) {
        _logger = createDiagnosticLogger();
    }
    return _logger;
}
export function createDiagnosticLogger() {
    // Lazy filePath: the log file is keyed on the current date, resolved per
    // drain so a long-lived logger rolls over at midnight.
    const writer = createNdjsonLogger({ filePath: () => getLogFile() });
    return {
        log(entry) {
            if (isTestMode()) {
                return;
            }
            writer.log(entry); // async, non-blocking
        },
        logCaught(d, context, shownInline = false) {
            this.log({
                timestamp: new Date().toISOString(),
                tool: d.tool || "unknown",
                ruleId: d.rule || d.id || "unknown",
                severity: d.severity || "warning",
                language: d.language || "unknown",
                filePath: d.filePath,
                line: d.line || 1,
                column: d.column || 1,
                message: d.message || "",
                caughtByPipeline: true,
                shownInline,
                autoFixed: false,
                shownToAgent: shownInline,
                agentFixed: false,
                unresolved: true,
                model: context.model,
                sessionId: context.sessionId,
                turnIndex: context.turnIndex,
                writeIndex: context.writeIndex,
            });
        },
        async flush() {
            await writer.flush();
        },
    };
}
