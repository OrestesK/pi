import { performance } from "node:perf_hooks";
/**
 * Startup timing for pi-lens.
 *
 * `performance.now()` is measured relative to `performance.timeOrigin`, which
 * is the moment the host pi process started. Capturing it the instant pi-lens
 * has finished loading therefore yields the wall-clock cost of pi loading +
 * (under source mode) jiti-transpiling every pi-lens module before any of our
 * code runs. With the precompiled `dist/` (#182) that transpile cost is gone,
 * so this number is how we verify the startup win instead of guessing at it.
 */
/** "dist" when pi-lens loaded from compiled JS, "source" when jiti-transpiled. */
export const PI_LENS_LOADED_FROM = import.meta.url.endsWith(".js")
    ? "dist"
    : "source";
let loadMs;
/**
 * Record the load-complete time. Call once, as the first statement in the
 * extension entry's module body — by then every import has been evaluated, so
 * the full transpile/load cost has been paid. Idempotent: later calls return
 * the first captured value.
 */
export function markPiLensLoaded() {
    if (loadMs === undefined) {
        loadMs = Math.round(performance.now());
    }
    return loadMs;
}
/** ms from pi process start to pi-lens load-complete, or undefined if unmarked. */
export function getPiLensLoadMs() {
    return loadMs;
}
