import { logLatency } from "./latency-logger.js";
import { normalizeMapKey } from "./path-utils.js";
const BUS_FILES_TOUCHED_EVENT = "pilens:files:touched";
const MAX_NAMES_SHOWN = 5;
// Module-level accumulator: one process/session, so a plain map keyed via
// normalizeMapKey (house style — every map/set key in this module MUST go
// through it; a hand-rolled replace() is the exact trap that cost two red CI
// rounds on #458's reconcile tests, PR #491) is sufficient. Cleared ONLY
// inside consumeAgentNudge() (i.e. only at actual injection into a `context`
// call) — deliberately NOT tied to turn_start/agent_end/agent_settled, so
// entries accumulated during run A's turn_end survive until run B's first
// `context` call in the same session (the cross-run `git status` case).
const _touched = new Map();
// Count of bus-reported paths dropped by the relevance filter (file never
// read/edited this session) since the last consume — drained alongside the
// accumulator so the `agent_nudge` phase can report how much the filter
// actually suppresses, which is the metric that validates (or indicts) the
// "only nudge for files the session saw" rule.
let _relevanceFilteredCount = 0;
/** Test-only: clear accumulator state between test files/cases. */
export function _resetAgentNudgeForTests() {
    _touched.clear();
    _relevanceFilteredCount = 0;
    _enabledCache = undefined;
}
// --- Kill switch (lazy, memoized — house style per clients/quiet-window.ts) ---
let _enabledCache;
/** `PI_LENS_AGENT_NUDGE=0` disables accumulation and injection outright. */
export function isAgentNudgeEnabled() {
    if (_enabledCache === undefined) {
        _enabledCache = process.env.PI_LENS_AGENT_NUDGE !== "0";
    }
    return _enabledCache;
}
function isValidPayload(data) {
    if (!data || typeof data !== "object")
        return false;
    const p = data;
    return (p.v === 1 &&
        p.source === "pi-lens" &&
        (p.reason === "autofix" || p.reason === "format") &&
        Array.isArray(p.paths));
}
/**
 * Record a `pilens:files:touched` event into the accumulator, filtered to
 * files the session has actually read or edited (read-guard is the source of
 * truth — `getReadHistory`/`getEditHistory` both key internally via
 * `normalizeFilePath`, so either separator form on the incoming bus payload
 * or the guard's stored records resolves to the same record regardless of
 * which form was recorded first).
 */
function recordTouchedEvent(payload, getReadGuard) {
    const readGuard = getReadGuard();
    if (!readGuard)
        return;
    for (const rawPath of payload.paths) {
        const isRelevant = readGuard.getReadHistory(rawPath).length > 0 ||
            readGuard.getEditHistory(rawPath).length > 0;
        if (!isRelevant) {
            _relevanceFilteredCount++;
            continue;
        }
        const mapKey = normalizeMapKey(rawPath);
        const existing = _touched.get(mapKey);
        if (existing) {
            existing.reasons.add(payload.reason);
            // "local" is sticky — see AccumulatedFileOrigin doc. A file already
            // recorded via the cross-process feed, now also reported by this
            // session's own bus, upgrades to "local".
            existing.origin = "local";
        }
        else {
            _touched.set(mapKey, {
                displayPath: rawPath,
                reasons: new Set([payload.reason]),
                origin: "local",
            });
        }
    }
}
/**
 * Feed entries read from the cross-process `recent-touches.json` record
 * (#492, clients/recent-touches.ts) into the SAME accumulator #485 uses for
 * in-process bus events — one accumulator, one `consumeAgentNudge` call, one
 * batched context message regardless of how many files came from which
 * channel.
 *
 * Relevance filtering differs by call site (#492 point 6) and is therefore
 * the CALLER's responsibility, not this function's:
 *   - parent at turn_start: read-guard history FIRST (a parent usually has
 *     one), falling back to recency-only for files it hasn't read (a parent
 *     about to `git commit` needs attribution even for unread files);
 *   - child at session_start: recency + file-existence only (no read
 *     history exists yet this early).
 * `readCrossProcessTouchesForTurnStart` / `...ForSessionStart` in
 * recent-touches.ts already apply their own recency/existence/self-pid
 * filtering before entries reach here — this function does not re-derive
 * relevance, it only merges into the accumulator and marks provenance.
 *
 * Self-exclusion (an entry this process itself published never nudges
 * itself) and path+ts dedup across repeated reads of the record are both
 * handled upstream in recent-touches.ts (pid filter + last-consumed cursor),
 * so entries reaching this function are already the "new, foreign" set.
 */
export function recordCrossProcessTouches(entries) {
    if (!isAgentNudgeEnabled())
        return;
    for (const entry of entries) {
        const mapKey = normalizeMapKey(entry.path);
        const existing = _touched.get(mapKey);
        if (existing) {
            existing.reasons.add(entry.reason);
            // "local" is sticky (see AccumulatedFileOrigin) — never downgrade an
            // already-local entry back to cross-process.
        }
        else {
            _touched.set(mapKey, {
                displayPath: entry.path,
                reasons: new Set([entry.reason]),
                origin: "cross-process",
            });
        }
    }
}
/**
 * Subscribe to `pilens:files:touched` on pi's shared event bus. Called once
 * at extension factory time from index.ts, mirroring `wireBusEmitter`'s
 * placement (clients/bus-publish.ts). No-ops silently when `pi.events` or
 * `.on` is unavailable (older pi host) — never throws.
 */
export function wireAgentNudgeSubscriber(args) {
    const { events, getReadGuard, dbg } = args;
    if (!events?.on)
        return;
    try {
        events.on(BUS_FILES_TOUCHED_EVENT, (data) => {
            if (!isAgentNudgeEnabled())
                return;
            if (!isValidPayload(data))
                return;
            try {
                recordTouchedEvent(data, getReadGuard);
            }
            catch (err) {
                dbg?.(`agent-nudge: failed to record touched event: ${err}`);
            }
        });
    }
    catch (err) {
        dbg?.(`agent-nudge: subscribe failed (older pi host?): ${err}`);
    }
}
/**
 * Consume the accumulated touched-file set and produce (at most) one context
 * message, e.g.:
 *   "pi-lens: 2 file(s) were autoformatted after your last turn: a.ts, b.ts —
 *    working-tree changes to these are expected; re-read before editing."
 * The provenance framing ("pi-lens ... expected") matters: the primary pain
 * case is an agent running `git status` (often at the START of a brand-new
 * run/session, not just mid-run) and burning turns investigating diffs it
 * did not knowingly make. Naming pi-lens as the source lets the agent act
 * (re-read, proceed) instead of investigating.
 *
 * #492: attribution is three-way by the batch's origin mix (see
 * AccumulatedFileOrigin) — still ONE message total (never split local vs.
 * cross-process into two separate injections; the agent gets one coherent
 * picture of everything unexplained in the working tree), but the wording
 * must never assign a LOCAL file to another instance:
 *   - all local         → "after your last turn" (the original #485 wording,
 *                         unchanged — verified by the pre-existing #485
 *                         tests);
 *   - all cross-process → "by another pi-lens instance (e.g. a subagent's)";
 *   - mixed             → "after your last turn (N of them by another
 *                         pi-lens instance)" — the base framing stays local
 *                         and the cross-process portion is counted out
 *                         precisely, so no local file is ever misattributed
 *                         to another instance.
 *
 * Clears the accumulator ONLY here, on actual injection — never on
 * agent_end/agent_settled/turn_start. Files formatted at the last turn_end of
 * a PREVIOUS run must still nudge at the first turn of the NEXT run in the
 * same session: this function is invoked from the `context` extension event
 * (index.ts), which fires before every provider/LLM call — including the
 * very first call of a fresh `agent_start` — so the accumulator surviving
 * across run boundaries is exactly what makes that cross-run delivery work.
 * Empty accumulator ⇒ returns undefined ⇒ zero bytes injected.
 */
export function consumeAgentNudge(dbg) {
    const entries = Array.from(_touched.values());
    _touched.clear();
    const filesFiltered = _relevanceFilteredCount;
    _relevanceFilteredCount = 0;
    if (!isAgentNudgeEnabled())
        return undefined;
    if (entries.length === 0)
        return undefined;
    try {
        const filesTotal = entries.length;
        const shown = entries.slice(0, MAX_NAMES_SHOWN);
        const remaining = filesTotal - shown.length;
        // Determine a single verb covering every reason seen across all
        // accumulated files (not just the shown subset) — most turns will have
        // a single uniform reason, so keep that common case terse; a mix of
        // autofix + format across the batch falls back to a combined verb.
        const allReasons = new Set();
        for (const e of entries) {
            for (const r of e.reasons)
                allReasons.add(r);
        }
        const verbLabel = allReasons.size > 1
            ? "autofixed/reformatted"
            : allReasons.has("format")
                ? "reformatted"
                : "autofixed";
        const names = shown.map((e) => e.displayPath);
        const nameList = remaining > 0
            ? `${names.join(", ")}, and ${remaining} more`
            : names.join(", ");
        const crossProcessCount = entries.filter((e) => e.origin === "cross-process").length;
        const localCount = filesTotal - crossProcessCount;
        // Three-way attribution (see the function doc): never assign a local
        // file to another instance — a mixed batch keeps the local base framing
        // and calls out the cross-process portion by exact count.
        const attribution = localCount === 0
            ? "by another pi-lens instance (e.g. a subagent's)"
            : crossProcessCount === 0
                ? "after your last turn"
                : `after your last turn (${crossProcessCount} of them by another pi-lens instance)`;
        const message = `pi-lens: ${filesTotal} file(s) were ${verbLabel} ${attribution}: ${nameList} — working-tree changes to these are expected; re-read before editing.`;
        logLatency({
            type: "phase",
            filePath: "<pi-lens>",
            phase: "agent_nudge",
            durationMs: 0,
            metadata: {
                filesTotal,
                filesShown: shown.length,
                // Relevance-filter drops since the last consume (files the session
                // never read/edited) — NOT the display overflow, which is
                // filesTotal - filesShown.
                filesFiltered,
                reasonMix: Array.from(allReasons),
                // #492: origin mix so cross-process pickup rate is observable
                // alongside the existing relevance-filter metric.
                originLocal: localCount,
                originCrossProcess: crossProcessCount,
            },
        });
        return {
            messages: [
                {
                    role: "user",
                    content: `[pi-lens automated context — not a user request] ${message}`,
                },
            ],
        };
    }
    catch (err) {
        dbg?.(`agent-nudge: consume failed: ${err}`);
        return undefined;
    }
}
