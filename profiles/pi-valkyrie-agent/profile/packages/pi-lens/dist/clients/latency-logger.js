import * as fs from "node:fs";
import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
const LATENCY_LOG_DIR = getGlobalPiLensDir();
const LATENCY_LOG_FILE = path.join(LATENCY_LOG_DIR, "latency.log");
const writer = createNdjsonLogger({ filePath: LATENCY_LOG_FILE });
export function logLatency(entry) {
    if (isTestMode()) {
        return;
    }
    writer.log({ ts: new Date().toISOString(), ...entry });
}
export function getLatencyLogPath() {
    return LATENCY_LOG_FILE;
}
/** Resolve once all enqueued latency writes are on disk (tests/shutdown). */
export function flushLatencyLog() {
    return writer.flush();
}
export function readLatencyLog(limit = 100) {
    try {
        const content = fs.readFileSync(LATENCY_LOG_FILE, "utf-8");
        const lines = content.trim().split(/\r?\n/).filter(Boolean);
        return lines
            .slice(-limit)
            .map((line) => JSON.parse(line))
            .reverse();
    }
    catch {
        return [];
    }
}
export function clearLatencyLog() {
    // Enqueue the truncate in the same serialized queue so a clear cannot race a
    // pending drain. Await flushLatencyLog() if you need the file empty on disk.
    writer.truncate();
}
