import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
export const SESSIONSTART_LOG_FILE = path.join(getGlobalPiLensDir(), "sessionstart.log");
// All ordinary writers share this queue, preserving their in-process order.
const writer = createNdjsonLogger({ filePath: SESSIONSTART_LOG_FILE });
export function logSessionStart(message) {
    if (isTestMode())
        return;
    writer.append(`[${new Date().toISOString()}] ${message}`);
}
export function flushSessionStartLog() {
    return writer.flush();
}
export function flushSessionStartLogSync() {
    writer.flushSync();
}
