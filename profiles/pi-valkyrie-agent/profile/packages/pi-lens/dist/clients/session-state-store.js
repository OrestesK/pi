/**
 * Per-session diagnostic state persistence (#190 Phase 1).
 *
 * pi-lens's widget/diagnostic state was in-memory only, so quitting and resuming
 * a session (`pi --session <id>`) started "fresh" — `lens_diagnostics` returned
 * nothing. This store persists the widget snapshot to disk keyed by pi's STABLE
 * session id (`ctx.sessionManager.getSessionId()`), so a resumed session can
 * rehydrate its prior findings. Best-effort: every read/write swallows errors
 * (a missing or corrupt file just means "start clean").
 */
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
import { readJsonCacheAsync } from "./json-cache-read.js";
const STATE_VERSION = 1;
export function sessionStartMode(reason, hasPendingForkSnapshot) {
    if (reason === "fork" && hasPendingForkSnapshot)
        return "fork";
    if (reason === "reload")
        return "keep";
    if (reason === "new")
        return "clean";
    return "maybe-rehydrate";
}
function sessionsDir(cwd) {
    return path.join(getProjectDataDir(cwd), "sessions");
}
/** Session ids are pi uuids, but sanitize defensively before using as a filename. */
function sessionFilePath(cwd, sessionId) {
    const safe = sessionId.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 200);
    return path.join(sessionsDir(cwd), `${safe}.json`);
}
/**
 * Persist the widget snapshot for `sessionId` (atomic write via tmp+rename).
 * No-op on a missing id or any I/O error — persistence must never break a turn.
 */
export async function saveSessionState(cwd, sessionId, widget) {
    if (!sessionId || !sessionId.trim())
        return;
    try {
        const dir = sessionsDir(cwd);
        await fs.mkdir(dir, { recursive: true });
        const payload = {
            version: STATE_VERSION,
            sessionId,
            savedAt: Date.now(),
            widget,
        };
        const file = sessionFilePath(cwd, sessionId);
        const tmp = `${file}.${process.pid}.tmp`;
        await fs.writeFile(tmp, JSON.stringify(payload), "utf8");
        await fs.rename(tmp, file);
    }
    catch {
        /* best-effort */
    }
}
/**
 * Reconcile a rehydrated snapshot with the current filesystem (#190 / #180):
 * drop files whose on-disk mtime is newer than `savedAt` (changed since the
 * snapshot) or that no longer exist, so a resume never shows stale diagnostics
 * for files edited between sessions. Dropped files simply re-scan on their next
 * edit. Existence/mtime are probed concurrently (off the event loop).
 */
export async function dropStaleFiles(widget, savedAt) {
    const checked = await Promise.all(widget.files.map(async (file) => {
        try {
            const st = await fs.stat(file.filePath);
            // mtime within a small skew of savedAt counts as unchanged.
            return st.mtimeMs <= savedAt + 1 ? file : undefined;
        }
        catch {
            return undefined; // gone → drop
        }
    }));
    return {
        ...widget,
        files: checked.filter((f) => f !== undefined),
    };
}
/**
 * Load the persisted widget snapshot for `sessionId`, or undefined if none /
 * unreadable / version mismatch.
 */
export async function loadSessionState(cwd, sessionId) {
    if (!sessionId || !sessionId.trim())
        return undefined;
    return readJsonCacheAsync(sessionFilePath(cwd, sessionId), (parsed) => {
        const state = parsed;
        if (state?.version !== STATE_VERSION || !state.widget)
            return undefined;
        return state;
    });
}
