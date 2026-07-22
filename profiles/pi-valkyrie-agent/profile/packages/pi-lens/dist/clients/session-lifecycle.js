/**
 * Concurrent-session guard (#473).
 *
 * In-process subagent extensions (tintinweb/pi-subagents-style: a fresh
 * `AgentSession` built and `bindExtensions()`-ed inside the SAME Node process
 * as the parent pi session) reuse pi's process-global extension-loader cache,
 * so the subagent's `session_start` re-invokes pi-lens's SAME module-scope
 * singletons the parent is still using. Left unguarded, `handleSessionStart`
 * destructively resets shared state (`resetLSPService({fast:true})` kills
 * every live LSP client; `runtime.resetForSession()` bumps the session
 * generation, silently orphaning the parent's in-flight continuations gated
 * on `isCurrentSession`) while the parent is mid-turn.
 *
 * pi's own SDK contract only invalidates a captured ctx for SEQUENTIAL
 * session replacement (`newSession`/`fork`/`switchSession`/`reload` —
 * `ExtensionRunner.invalidate()`, called from `core/agent-session.js` on
 * dispose). A concurrently-live sibling session's bind invalidates nothing.
 * That asymmetry — is the PRIOR ctx still active or not — is the reliable,
 * empirically-verified discriminator this module implements.
 *
 * Fail-safe direction is non-negotiable: whenever classification is
 * uncertain, this module falls back to today's behavior (treat as a
 * sequential replacement, i.e. run the full reset). It only suppresses the
 * reset on POSITIVE evidence that a live sibling primary session exists.
 *
 * Kill switch: `PI_LENS_CONCURRENT_SESSION_GUARD=0` disables the guard
 * entirely — every session_start classifies as if sequential (today's
 * behavior), matching the lazy-env-read house style (see
 * `subagent-mode.ts` / `runtime-config.ts`).
 */
/** Module-scope state — deliberately shared by construction. This module is
 * loaded once per process by pi's process-global extension cache, so a
 * concurrent in-process subagent session sees the SAME instance as the
 * parent, which is exactly the signal this guard relies on. */
let activeCtx;
let activeSessionId;
let secondarySessionCount = 0;
/**
 * PURE classifier — no I/O, no throws, fully unit-testable in isolation.
 *
 * Branches (fail-safe order matters):
 *  1. No prior primary registered → `primary` (first session_start this
 *     process has seen; zero behavior change for the single-session case).
 *  2. Prior exists, same stable session id → `sequential-replacement` (the
 *     same session re-announcing itself, e.g. resume/reload paths — must
 *     keep today's behavior, NOT be mistaken for a sibling).
 *  3. Prior exists, `priorCtxActive === false` (confirmed invalidated) →
 *     `sequential-replacement` (the prior really was replaced/disposed —
 *     this IS the sequential case pi's own contract covers).
 *  4. Prior exists, `priorCtxActive === true`, different session id →
 *     `concurrent-secondary` (positive evidence of a live sibling).
 *  5. Prior exists, `priorCtxActive === undefined` (probe inconclusive) →
 *     `sequential-replacement` (fail toward today's behavior).
 */
export function classifySessionStart(input) {
    const { hasPrior, priorCtxActive, sameSessionId } = input;
    if (!hasPrior)
        return "primary";
    if (sameSessionId)
        return "sequential-replacement";
    if (priorCtxActive === false)
        return "sequential-replacement";
    if (priorCtxActive === true)
        return "concurrent-secondary";
    // priorCtxActive === undefined: inconclusive probe — fail-safe.
    return "sequential-replacement";
}
/** Lazy env read (house style) — never memoized, so tests can flip it
 * mid-run via `process.env` without a reset hook. */
function guardEnabled() {
    return process.env.PI_LENS_CONCURRENT_SESSION_GUARD !== "0";
}
/**
 * Impure probe: exercises a cheap, side-effect-free ctx accessor that the
 * SDK's `ExtensionRunner.createContext()` wraps with `assertActive()`.
 *
 * Chosen accessor: `ctx.isIdle` (a bound method reading `runner.isIdleFn()`,
 * i.e. pure process/session state — no mutation, no I/O). It is wrapped the
 * same way every other guarded getter/method on the context is (`ui`,
 * `cwd`, `mode`, `signal`, `sessionManager`, ...): `assertActive()` runs
 * first and throws the SDK's stale-ctx error, matching the message fragment
 * `"stale after session replacement"`
 * (`ExtensionRunner.invalidate()`'s default message,
 * `core/extensions/runner.js` in the installed
 * `@earendil-works/pi-coding-agent` SDK dist). `isIdle` was picked over the
 * plain getters (`cwd`, `mode`, `hasUI`) only for readability at call sites
 * that already branch on idle state elsewhere in pi-lens; any of the other
 * assertActive()-wrapped accessors would work identically for this probe.
 *
 * Returns:
 *  - `true`  — the accessor call returned normally (ctx still active).
 *  - `false` — the accessor threw, and the message matches the known
 *    stale-ctx fragment (ctx confirmed invalidated by the SDK).
 *  - `undefined` — ctx has an unexpected shape (accessor missing / not a
 *    function), or the accessor threw something that does NOT look like the
 *    SDK's stale-ctx error (never assume — treat as inconclusive).
 *
 * Never throws out of this function; every branch is wrapped.
 */
export function probeCtxActive(ctx) {
    try {
        const candidate = ctx;
        if (candidate === null ||
            candidate === undefined ||
            typeof candidate.isIdle !== "function") {
            return undefined;
        }
        candidate.isIdle();
        return true;
    }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes("stale after session replacement")) {
            return false;
        }
        // Threw, but not the SDK's known stale-ctx error — don't guess.
        return undefined;
    }
}
/** Register the current session as the process's primary. Called for both
 * `primary` and `sequential-replacement` classifications — a sequential
 * replacement re-registers itself as the (new) primary, matching today's
 * one-active-session-at-a-time behavior. */
export function registerPrimarySession(ctx, sessionId) {
    activeCtx = ctx;
    activeSessionId = sessionId;
    secondarySessionCount = 0;
}
/** Register a concurrently-bound secondary (subagent) session. Does not
 * touch the primary's ctx/session id. */
export function registerSecondarySession() {
    secondarySessionCount += 1;
}
/**
 * Classifies a `session_shutdown` firing the same fail-safe way as
 * `classifySessionStart`: it is `secondary` ONLY when a DIFFERENT primary is
 * registered (positively identified — ctx identity differs AND session ids
 * are both known and differ) and that primary's ctx still probes active
 * (positive evidence the shutting-down session is a live sibling, not the
 * real parent exiting). Any inconclusive signal — no primary registered,
 * same ctx object, same session id, EITHER session id unknown, or the
 * primary's ctx probe returning `undefined`/`false` — classifies as
 * `primary` so today's full-teardown behavior is preserved.
 *
 * The id-unknown guard matters: without it, a single ordinary session whose
 * `sessionManager.getSessionId()` is unavailable (SDK drift) would register
 * with `sessionId === undefined`, then at its OWN shutdown the same-id check
 * couldn't fire, the probe of its own (still-live — pi invalidates on
 * replacement, not shutdown) ctx would return true, and its teardown would
 * be skipped on EVERY clean exit — leaking the LSP fleet (the #472 orphan
 * class). Trade-off accepted: a REAL secondary that also has unknown ids
 * now classifies `primary` (conservative miss — its teardown runs and hurts
 * the parent, same as pre-#473 behavior), because uncertainty must never
 * classify `secondary`.
 */
export function noteSessionShutdown(
// Load-bearing: ctx OBJECT IDENTITY is the definitive discriminator when
// available — if the shutting-down handler's ctx IS the registered
// primary's ctx, this is the primary regardless of session-id reads.
// (Note: pi's ExtensionRunner.emit() builds a FRESH ctx object per emit,
// so identity match is not expected with today's SDK — this check is
// defense-in-depth for SDK versions/paths that reuse a ctx.)
ctx, sessionId) {
    if (ctx !== undefined && ctx === activeCtx) {
        return "primary";
    }
    if (activeCtx === undefined && activeSessionId === undefined) {
        return "primary";
    }
    if (sessionId !== undefined && sessionId === activeSessionId) {
        return "primary";
    }
    // Uncertainty guard: if EITHER side's session id is unknown we cannot
    // positively establish "different session", so never classify secondary.
    if (sessionId === undefined || activeSessionId === undefined) {
        return "primary";
    }
    const primaryStillActive = probeCtxActive(activeCtx);
    if (primaryStillActive === true) {
        return "secondary";
    }
    // primaryStillActive is false or undefined: fail-safe to primary.
    return "primary";
}
export function getSecondarySessionCount() {
    return secondarySessionCount;
}
export function decrementSecondarySessionCount() {
    if (secondarySessionCount > 0)
        secondarySessionCount -= 1;
}
/**
 * Guard-aware wrapper used by callers (index.ts) so the kill switch lives in
 * one place: when disabled, always report `sequential-replacement` (i.e.
 * behave exactly as if this module didn't exist).
 */
export function classifySessionStartGuarded(input) {
    if (!guardEnabled())
        return input.hasPrior ? "sequential-replacement" : "primary";
    return classifySessionStart(input);
}
/** Test-only: clears all module-scope state (house style — see
 * `_resetSubagentModeForTests` / `slow-fs.ts`). */
export function _resetSessionLifecycleForTests() {
    activeCtx = undefined;
    activeSessionId = undefined;
    secondarySessionCount = 0;
}
/**
 * Single entry point `index.ts`'s `session_start` handler delegates to, so
 * the classify → probe → register decision is unit-testable independent of
 * the SDK's `pi.on("session_start", ...)` wiring (which cannot be invoked
 * directly in tests).
 *
 * `ctx` is whatever the SDK handed the handler (only ever probed via
 * {@link probeCtxActive}, never dereferenced otherwise, so passing a plain
 * fake object in tests is safe). `sessionId` is the STABLE session id
 * (`ctx.sessionManager.getSessionId()`), which may be `undefined`.
 */
export function decideSessionStart(ctx, sessionId) {
    const hasPrior = activeCtx !== undefined || activeSessionId !== undefined;
    const priorCtxActive = hasPrior ? probeCtxActive(activeCtx) : undefined;
    // ctx OBJECT IDENTITY: if the SDK ever hands the SAME ctx object to a
    // repeated session_start, that is by definition the same session
    // re-announcing itself — sequential, never concurrent. (Not expected with
    // today's SDK — ExtensionRunner.emit() builds a fresh ctx per emit — but
    // identity is the one signal that can't false-positive, so honor it.)
    const sameCtx = hasPrior && ctx !== undefined && ctx === activeCtx;
    const sameSessionId = sameCtx ||
        (hasPrior && sessionId !== undefined && sessionId === activeSessionId);
    const classification = classifySessionStartGuarded({
        hasPrior,
        priorCtxActive,
        sameSessionId,
    });
    if (classification === "concurrent-secondary") {
        registerSecondarySession();
        return {
            classification,
            runFullSessionStart: false,
            secondaryCount: secondarySessionCount,
        };
    }
    // "primary" or "sequential-replacement": register as the (new) primary
    // and proceed exactly as today.
    registerPrimarySession(ctx, sessionId);
    return {
        classification,
        runFullSessionStart: true,
        secondaryCount: secondarySessionCount,
    };
}
