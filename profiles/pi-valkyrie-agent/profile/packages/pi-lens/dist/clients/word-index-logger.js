import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
const WORD_INDEX_LOG_FILE = path.join(getGlobalPiLensDir(), "word-index.log");
const writer = createNdjsonLogger({ filePath: WORD_INDEX_LOG_FILE });
export function logWordIndex(entry) {
    if (isTestMode())
        return;
    writer.log({ ts: new Date().toISOString(), ...entry });
}
export function wordIndexDebug(cwd) {
    return (message) => logWordIndex({
        phase: message.startsWith("word-index persist") ? "persist" : "cold-build",
        cwd: path.resolve(cwd),
        outcome: message.includes("failed")
            ? "failed"
            : message.includes("skipped")
                ? "refused"
                : "succeeded",
        reason: message,
    });
}
export function getWordIndexLogPath() {
    return WORD_INDEX_LOG_FILE;
}
export function flushWordIndexLog() {
    return writer.flush();
}
