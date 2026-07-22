import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
const TREE_SITTER_LOG_DIR = getGlobalPiLensDir();
const TREE_SITTER_LOG_FILE = path.join(TREE_SITTER_LOG_DIR, "tree-sitter.log");
const writer = createNdjsonLogger({ filePath: TREE_SITTER_LOG_FILE });
export function logTreeSitter(entry) {
    if (isTestMode()) {
        return;
    }
    writer.log({ ts: new Date().toISOString(), ...entry });
}
export function getTreeSitterLogPath() {
    return TREE_SITTER_LOG_FILE;
}
/** Resolve once all enqueued tree-sitter writes are on disk (tests/shutdown). */
export function flushTreeSitterLog() {
    return writer.flush();
}
