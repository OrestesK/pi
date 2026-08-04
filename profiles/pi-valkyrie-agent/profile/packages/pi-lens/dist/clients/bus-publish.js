/**
 * Publishes `pilens:files:touched` on pi's shared `pi.events` bus (#482).
 *
 * This is pi-lens's FIRST `pi.events` broadcast surface: it exists so other
 * extensions in the same session can observe files pi-lens writes
 * autonomously (autofix/format runners) without reverse-engineering us —
 * writes the agent makes itself via its own tool calls are NOT ours to
 * broadcast; the host already knows about those (see the seam audit in
 * AGENTS.md / issue #482).
 *
 * Versioning policy: the payload is frozen-additive. New optional fields may
 * be added under the same `v: 1`; a breaking/incompatible change to an
 * existing field's meaning must bump `v`.
 *
 * Fire-and-forget: publishing must never affect the write path's success or
 * latency. Any failure (bus unavailable, emit throws) is swallowed; a `dbg`
 * callback is invoked at most once on first failure so a wired caller can log
 * it without spamming.
 */
import { logBusEvent } from "./bus-events-logger.js";
import { normalizeFilePath } from "./path-utils.js";
import { appendRecentTouches } from "./recent-touches.js";
export const BUS_FILES_TOUCHED_EVENT = "pilens:files:touched";
export const BUS_FILES_TOUCHED_VERSION = 1;
let busEmit;
let hasLoggedFailure = false;
// Log-once-per-process guards for the two structural-no-op outcomes below
// (see bus-events-logger.ts's module doc for why these aren't logged on
// every call — both are static, session-lifetime facts, not transient
// per-event failures).
let hasLoggedUnwired = false;
let hasLoggedDisabled = false;
/**
 * Wire the emit function from pi's `pi.events` bus. Called once at extension
 * factory time from index.ts (module-level singleton, same pattern as
 * `initLensEvents`). Never called ⇒ `publishFilesTouched` no-ops, which is
 * exactly the state unit tests and the MCP server path run in (no pi host,
 * no `pi.events`).
 */
export function wireBusEmitter(emitFn) {
    busEmit = emitFn;
}
/** Test-only: reset module state between test files. */
export function _resetForTests() {
    busEmit = undefined;
    hasLoggedFailure = false;
    hasLoggedUnwired = false;
    hasLoggedDisabled = false;
    _envCache = undefined;
}
let _envCache;
/**
 * Lazy env read (house style) so tests can flip `PI_LENS_BUS_PUBLISH` at
 * runtime via `_resetForTests` + re-set the env var. Kill switch: set to `0`
 * to disable publishing outright.
 */
export function isBusPublishEnabled() {
    if (_envCache === undefined) {
        _envCache = process.env.PI_LENS_BUS_PUBLISH !== "0";
    }
    return _envCache;
}
/**
 * Publish one `pilens:files:touched` event for a logical write batch (one
 * event per call site invocation, not per file). Fire-and-forget: never
 * throws, never awaited by the caller's write path.
 *
 * #492: this is also the producer seam for the cross-process
 * `recent-touches.json` record (clients/recent-touches.ts) — parent and
 * child pi processes run this exact function, so appending here (rather
 * than at each of the several `publishFilesTouched` call sites) guarantees
 * every future call site gets cross-process propagation for free. The
 * append is independent of `busEmit` being wired (a bare/MCP/test host with
 * no `pi.events` still gets a cross-process record — the in-process bus and
 * the on-disk record are two separate deliveries of the same payload, and
 * the record is the ONLY one of the two that survives a process boundary).
 * Fire-and-forget, same as the bus emit: never awaited, failures swallowed
 * and dbg-logged (never break the publish path).
 */
export function publishFilesTouched(args) {
    if (args.origin === "bus")
        return;
    if (args.paths.length === 0)
        return;
    if (!isBusPublishEnabled()) {
        if (!hasLoggedDisabled) {
            hasLoggedDisabled = true;
            logBusEvent({
                event: BUS_FILES_TOUCHED_EVENT,
                outcome: "skipped_disabled",
                cwd: normalizeFilePath(args.cwd),
                reason: args.reason,
            });
        }
        return;
    }
    void appendRecentTouches({
        cwd: args.cwd,
        reason: args.reason,
        paths: args.paths,
        sessionId: args.sessionId,
    }).catch((err) => {
        args.dbg?.(`bus-publish: recent-touches append failed: ${err}`);
    });
    if (!busEmit) {
        if (!hasLoggedUnwired) {
            hasLoggedUnwired = true;
            logBusEvent({
                event: BUS_FILES_TOUCHED_EVENT,
                outcome: "skipped_unwired",
                cwd: normalizeFilePath(args.cwd),
                reason: args.reason,
            });
        }
        return;
    }
    try {
        const payload = {
            v: BUS_FILES_TOUCHED_VERSION,
            source: "pi-lens",
            reason: args.reason,
            paths: args.paths.map((p) => normalizeFilePath(p)),
            cwd: normalizeFilePath(args.cwd),
        };
        if (args.fixes && args.fixes.length > 0) {
            payload.fixes = args.fixes.map((f) => ({
                ...f,
                path: normalizeFilePath(f.path),
            }));
        }
        busEmit(BUS_FILES_TOUCHED_EVENT, payload);
        logBusEvent({
            event: BUS_FILES_TOUCHED_EVENT,
            outcome: "emitted",
            cwd: payload.cwd,
            reason: args.reason,
            fileCount: payload.paths.length,
        });
    }
    catch (err) {
        logBusEvent({
            event: BUS_FILES_TOUCHED_EVENT,
            outcome: "emit_failed",
            cwd: normalizeFilePath(args.cwd),
            reason: args.reason,
            error: String(err),
        });
        if (!hasLoggedFailure) {
            hasLoggedFailure = true;
            args.dbg?.(`bus-publish: pilens:files:touched emit failed (further failures suppressed): ${err}`);
        }
    }
}
