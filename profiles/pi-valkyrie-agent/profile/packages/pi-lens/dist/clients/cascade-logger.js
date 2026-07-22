import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
const CASCADE_LOG_DIR = getGlobalPiLensDir();
const CASCADE_LOG_FILE = path.join(CASCADE_LOG_DIR, "cascade.log");
const writer = createNdjsonLogger({ filePath: CASCADE_LOG_FILE });
export function logCascade(entry) {
    if (isTestMode()) {
        return;
    }
    writer.log({ ts: new Date().toISOString(), ...entry });
}
export function getCascadeLogPath() {
    return CASCADE_LOG_FILE;
}
/** Resolve once all enqueued cascade writes are on disk (tests/shutdown). */
export function flushCascadeLog() {
    return writer.flush();
}
