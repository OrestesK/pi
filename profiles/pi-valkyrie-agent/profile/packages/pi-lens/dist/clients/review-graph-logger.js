import * as path from "node:path";
import { isTestMode } from "./env-utils.js";
import { getGlobalPiLensDir } from "./file-utils.js";
import { createNdjsonLogger } from "./ndjson-logger.js";
const REVIEW_GRAPH_LOG_DIR = getGlobalPiLensDir();
const REVIEW_GRAPH_LOG_FILE = path.join(REVIEW_GRAPH_LOG_DIR, "review-graph.log");
const writer = createNdjsonLogger({ filePath: REVIEW_GRAPH_LOG_FILE });
export function logReviewGraph(entry) {
    if (isTestMode()) {
        return;
    }
    writer.log({ ts: new Date().toISOString(), ...entry });
}
export function getReviewGraphLogPath() {
    return REVIEW_GRAPH_LOG_FILE;
}
/** Resolve once all enqueued review-graph writes are on disk (tests/shutdown). */
export function flushReviewGraphLog() {
    return writer.flush();
}
/** Teardown-only: force queued entries to disk before the process exits. */
export function flushReviewGraphLogSync() {
    writer.flushSync();
}
