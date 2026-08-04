import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
import { getMaxLogSizeMB } from "./log-cleanup.js";
const LATENCY_LOG_DIR = getGlobalPiLensDir();
const LATENCY_LOG_FILE = path.join(LATENCY_LOG_DIR, "latency.log");
const writer = createNdjsonLogger({
    filePath: LATENCY_LOG_FILE,
    maxBytes: getMaxLogSizeMB() * 1024 * 1024,
});
export function logLatency(entry) {
    if (isTestMode()) {
        return;
    }
    writer.log({ ...entry, ts: new Date().toISOString(), pid: process.pid });
}
export function getLatencyLogPath() {
    return LATENCY_LOG_FILE;
}
/** Resolve once all enqueued latency writes are on disk (tests/shutdown). */
export function flushLatencyLog() {
    return writer.flush();
}
export function clearLatencyLog() {
    // Enqueue the truncate in the same serialized queue so a clear cannot race a
    // pending drain. Await flushLatencyLog() if you need the file empty on disk.
    writer.truncate();
}
