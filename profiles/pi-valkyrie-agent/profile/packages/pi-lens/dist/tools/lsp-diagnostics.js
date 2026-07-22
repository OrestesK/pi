/**
 * lsp_diagnostics tool definition
 *
 * Proactive LSP diagnostics check — single files or directories.
 * Adopted from code-yeongyu/pi-lsp-client design.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { Type } from "../clients/deps/typebox.js";
import { getProjectIgnoreMatcher, isExcludedDirName, } from "../clients/file-utils.js";
import { getLSPService, groupFilesByPrimaryServer, runPerServerGroups, } from "../clients/lsp/index.js";
import { buildScopeKey, createWorkspaceDiagnosticsCacheContext, } from "../clients/lsp/workspace-diagnostics-cache.js";
import { primaryServerId } from "../clients/lsp/config.js";
import { combineAbortSignals } from "../clients/deadline-utils.js";
import { applyAuxiliarySuppressions, retagAuxiliaryDiagnostics, } from "../clients/dispatch/auxiliary-lsp.js";
import { detectFileRole } from "../clients/file-role.js";
import { classifyCascadeWaitTier } from "../clients/lsp/cascade-tier.js";
import { attemptTsserverSyncDiagnostics, } from "../clients/lsp/tsserver-sync.js";
import { convertLspDiagnostics } from "../clients/dispatch/utils/lsp-diagnostics.js";
import { reconcileScanDiagnostics } from "../clients/widget-state.js";
import { baseName, compactRenderResult } from "./render-compact.js";
import { makeProgressReporter, scanningSummaryLine } from "./scan-progress.js";
const LANG_EXTENSIONS = {
    ".ts": [".ts", ".tsx", ".mts", ".cts"],
    ".tsx": [".ts", ".tsx", ".mts", ".cts"],
    ".js": [".js", ".jsx", ".mjs", ".cjs"],
    ".py": [".py", ".pyi"],
    ".rs": [".rs"],
    ".go": [".go"],
    ".rb": [".rb", ".rake", ".gemspec"],
    ".java": [".java"],
    ".kt": [".kt", ".kts"],
    ".swift": [".swift"],
    ".cs": [".cs"],
    ".cpp": [".cpp", ".cc", ".cxx", ".hpp", ".hxx"],
    ".c": [".c", ".h"],
    ".zig": [".zig", ".zon"],
    ".hs": [".hs", ".lhs"],
    ".ex": [".ex", ".exs"],
    ".gleam": [".gleam"],
    ".tf": [".tf", ".tfvars"],
    ".nix": [".nix"],
    ".sh": [".sh", ".bash", ".zsh"],
    ".php": [".php"],
    ".lua": [".lua"],
    ".dart": [".dart"],
    ".vue": [".vue"],
    ".svelte": [".svelte"],
    ".css": [".css", ".scss", ".less"],
    ".html": [".html", ".htm"],
    ".json": [".json", ".jsonc"],
    ".yaml": [".yaml", ".yml"],
    ".toml": [".toml"],
    ".prisma": [".prisma"],
};
const MAX_FILES = 100;
const MAX_BATCH_FILES = 100;
const MAX_DIAGNOSTICS = 200;
const DEFAULT_BATCH_CONCURRENCY = 8;
const MAX_BATCH_CONCURRENCY = 16;
// LSP severities: 1=Error, 2=Warning, 3=Information, 4=Hint
const SEVERITY_NAMES = {
    1: "error",
    2: "warning",
    3: "information",
    4: "hint",
};
// #646: `primaryServerId` moved to clients/lsp/config.ts so this tool and
// tools/lens-diagnostics.ts's mode=full sweep share the exact same
// primary-vs-auxiliary classification instead of each keeping its own copy.
function lspUnavailableMessage(filePath, health) {
    if (!health || !String(health.health ?? "").startsWith("no_clients")) {
        return undefined;
    }
    const candidates = health.candidateServerIds?.length
        ? ` candidates=${health.candidateServerIds.join(",")}`
        : "";
    const reason = (health.serverCountAttempted ?? 0) === 0
        ? "no LSP server configured"
        : "no LSP client is currently ready";
    const stale = (health.mergedCount ?? 0) > 0
        ? " Showing stale last-known diagnostics below."
        : " No diagnostics were collected.";
    return `LSP unavailable for ${filePath}: ${reason}; ready=${health.serverCountReady ?? 0}/${health.serverCountAttempted ?? 0}.${candidates}.${stale}`;
}
function boundedPositiveInt(value, fallback, min, max) {
    const parsed = typeof value === "number" ? Math.floor(value) : Number.NaN;
    if (!Number.isFinite(parsed))
        return fallback;
    return Math.max(min, Math.min(max, parsed));
}
/**
 * #631: fan `mapper` out across `items` (a batch/directory file list) while
 * respecting per-LSP-server affinity — previously this was a flat,
 * server-oblivious bounded-concurrency pool (up to `concurrency` files
 * in flight at once, regardless of which server they belonged to). That let
 * a single-language batch (the common case) fire many concurrent touches at
 * the SAME shared, single-threaded LSP server — exactly the pattern #387
 * found doesn't parallelize (it queues server-side and cascades per-file
 * timeouts by queue position) and that `runWorkspaceDiagnostics` (the engine
 * behind `lens_diagnostics mode=full`) has been protected against since #387.
 *
 * Groups `items` by primary server via `groupFilesByPrimaryServer` (the same
 * grouping key `runWorkspaceDiagnostics` uses) and schedules them with
 * `runPerServerGroups` (both extracted from `clients/lsp/index.ts` so this
 * tool shares the real primitive instead of a second hand-copied
 * implementation): at most one in-flight `mapper` call per server group,
 * parallelized across distinct groups up to `concurrency`. A single-language
 * batch collapses to one group and runs effectively serially regardless of
 * `concurrency` — the CORRECT, intended #387 behavior, not a regression.
 *
 * Result order matches `items`' original order (not completion order),
 * matching the old flat pool's positional-assignment behavior — callers may
 * depend on `results[i]` corresponding to `items[i]`.
 *
 * #667: before a group's own per-file loop starts, calls the shared
 * `LSPService.ensureWarmForSweep` warm-check/ensure-warm step (the same one
 * `runWorkspaceDiagnostics` uses for `lens_diagnostics mode=full`) against
 * the group's first file — a no-op when that group's primary server already
 * demonstrated readiness earlier this session, one bounded warm-up round
 * trip otherwise. Fixes the first-few-files-eat-cold-start-timeouts pattern
 * for THIS tool's batch/directory sweep the same way #667 fixed it for the
 * workspace-diagnostics sweep.
 */
async function mapWithConcurrency(items, concurrency, mapper, lspService, signal, onProgress) {
    const results = [];
    let completed = 0;
    // Multiple original indices can map to the same file path (duplicate
    // entries in an explicit `paths` batch) — track them as a per-file queue
    // so each occurrence still lands in its own original slot.
    const pendingIndices = new Map();
    items.forEach((item, index) => {
        const queue = pendingIndices.get(item);
        if (queue)
            queue.push(index);
        else
            pendingIndices.set(item, [index]);
    });
    const groups = groupFilesByPrimaryServer(items);
    await runPerServerGroups(groups, concurrency, async (group) => {
        if (signal?.aborted)
            return;
        const first = group.files[0];
        if (first &&
            lspService &&
            typeof lspService.ensureWarmForSweep === "function") {
            await lspService.ensureWarmForSweep(first, { signal });
            if (signal?.aborted)
                return;
        }
        for (const item of group.files) {
            // Honor cancellation (Escape / turn abort): stop pulling new items
            // rather than grind the whole batch. Completed entries are returned.
            if (signal?.aborted)
                return;
            const index = pendingIndices.get(item).shift();
            results[index] = await mapper(item, index);
            completed += 1;
            onProgress?.(completed, items.length);
        }
    }, signal);
    return results;
}
/**
 * Project-ignore predicate rooted at `root`, fail-open. Lets a directory scan
 * honor the user's `.pi-lens.json` / `.gitignore` patterns — not just the
 * canonical dir-name list — so `lsp_diagnostics` stays consistent with the
 * workspace-diagnostics walk and every other scan surface (#243/#297/#298). A
 * config-probe error never blocks a scan (matches the walkers' behaviour).
 */
function projectIgnorePredicate(root) {
    try {
        const matcher = getProjectIgnoreMatcher(root);
        return (fullPath, isDir) => matcher.isIgnored(fullPath, isDir);
    }
    catch {
        return () => false;
    }
}
function collectFiles(dir, extensions, maxFiles, isIgnored = () => false) {
    const files = [];
    function walk(current) {
        if (files.length >= maxFiles)
            return;
        let entries;
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        }
        catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= maxFiles)
                return;
            if (entry.isSymbolicLink())
                continue;
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (!isExcludedDirName(entry.name) && !isIgnored(full, true))
                    walk(full);
            }
            else if (entry.isFile() && extensions.includes(path.extname(full))) {
                if (isIgnored(full, false))
                    continue;
                files.push(full);
            }
        }
    }
    walk(dir);
    return files;
}
export function createLspDiagnosticsTool(
// #571: same shared write-ordering token source `lens_diagnostics` mode=full
// uses (index.ts injects `() => runtime.nextWriteIndex()`) — a confirmed
// fresh result this tool reconciles into the footer draws a fresh token so
// `WriteOrderingGuard` can tell it apart from a concurrent, genuinely newer
// per-edit write for the same file. Optional/undefined in tests.
nextWriteIndex) {
    return {
        name: "lsp_diagnostics",
        label: "LSP Diagnostics",
        description: "Get errors, warnings, and hints from language servers for a file or directory. " +
            "Use BEFORE running builds to proactively check for issues. " +
            "Works on directories by auto-detecting file extensions and scanning all matching files.",
        promptSnippet: "Get LSP diagnostics for a file or directory (use before builds)",
        renderResult: compactRenderResult(({ details, args, isError, text }) => {
            // Streaming progress partials render the live bar (see scanningSummaryLine).
            const scanning = scanningSummaryLine(details, text);
            if (scanning)
                return scanning;
            if (isError) {
                return `lsp_diagnostics — ${text.split("\n")[0] ?? "error"}`;
            }
            const count = details?.totalDiagnostics ?? details?.diagnostics?.length ?? 0;
            const target = baseName(details?.filePath ?? args.path) || "workspace";
            const files = details?.filesChecked ?? details?.filesScanned;
            const scope = typeof files === "number" && files > 1
                ? ` across ${files} files`
                : target
                    ? ` ${target}`
                    : "";
            const noun = count === 1 ? "diagnostic" : "diagnostics";
            // #533: a batch/directory result with any unconfirmed files must NEVER
            // compact-render as a bare "N diagnostics" — that erases the fact some
            // files' clean status was never actually confirmed by the server.
            const unconfirmedFiles = details?.unconfirmedFiles ?? 0;
            if (unconfirmedFiles > 0) {
                const cleanFiles = details?.cleanFiles ?? 0;
                const timedOutFiles = details?.timedOutFiles ?? 0;
                const suffix = timedOutFiles > 0 ? ` (${timedOutFiles} timed out)` : "";
                return `lsp_diagnostics${scope} — ${count} ${noun} · ${cleanFiles} clean · ${unconfirmedFiles} unconfirmed${suffix}`;
            }
            // Single-file mode: 0 diagnostics from an unconfirmed result — either a
            // silent-on-clean server or (#570) a timed-out check — is not a clean
            // render either.
            if (count === 0 && details?.unconfirmed) {
                return details?.timedOut
                    ? `lsp_diagnostics${scope} — timed out (result may be incomplete)`
                    : `lsp_diagnostics${scope} — unconfirmed (server cannot confirm clean)`;
            }
            return `lsp_diagnostics${scope} — ${count} ${noun}`;
        }),
        parameters: Type.Object({
            path: Type.Optional(Type.String({
                description: "File or directory path to check. For directories, all matching source files are scanned.",
            })),
            paths: Type.Optional(Type.Array(Type.String(), {
                minItems: 1,
                maxItems: MAX_BATCH_FILES,
                description: "Explicit files to check as a bounded-concurrency batch. When provided, path is ignored.",
            })),
            severity: Type.Optional(Type.String({
                enum: ["error", "warning", "information", "hint", "all"],
                description: "Filter by severity level (default: all)",
            })),
            concurrency: Type.Optional(Type.Number({
                description: "Batch/directory concurrency, in distinct LSP server groups run in parallel " +
                    "(default 8, max 16) — not individual files. Files sharing one server " +
                    "(e.g. a same-language batch) are always processed one at a time against " +
                    "that server regardless of this value; this caps how many DIFFERENT " +
                    "servers run concurrently.",
            })),
            waitMs: Type.Optional(Type.Number({
                description: "Optional per-file LSP wait budget for batch diagnostics. Uses server defaults when omitted.",
            })),
            serverScope: Type.Optional(Type.String({
                enum: ["primary", "all"],
                description: "'primary' (fast, low-noise): only the file's actual language " +
                    "server (e.g. typescript) — for 'does this have real type " +
                    "errors'. 'all' (default): also touches cross-cutting auxiliary " +
                    "scanners (ast-grep, opengrep, zizmor, typos, marksman) attached " +
                    "to this file, including findings for files not yet dispatched " +
                    "this session. Primary confirmation is always reported " +
                    "separately from auxiliary findings regardless of this setting.",
            })),
        }),
        async execute(_toolCallId, params, _signal, onUpdate, ctx) {
            // Escape aborts the turn via ctx.signal; honor both it and the tool-call
            // signal so a batch/directory scan cancels rather than grinding on.
            const signal = combineAbortSignals(_signal, ctx.signal);
            // Stream a throttled progress bar for batch/directory scans (opaque for
            // seconds-to-minutes otherwise).
            const onProgress = makeProgressReporter(onUpdate, "Scanning LSP diagnostics");
            const typedParams = params;
            const severity = (typedParams.severity ?? "all");
            const cwd = ctx.cwd ?? process.cwd();
            const concurrency = boundedPositiveInt(typedParams.concurrency, DEFAULT_BATCH_CONCURRENCY, 1, MAX_BATCH_CONCURRENCY);
            const waitMs = typeof typedParams.waitMs === "number" && typedParams.waitMs >= 0
                ? Math.floor(typedParams.waitMs)
                : undefined;
            const serverScope = typedParams.serverScope === "primary" ? "primary" : "all";
            const lspService = getLSPService();
            if (!lspService) {
                return {
                    content: [
                        { type: "text", text: "LSP service not available." },
                    ],
                    isError: true,
                    details: {},
                };
            }
            if (Array.isArray(typedParams.paths) &&
                typedParams.paths.length > 0) {
                const absPaths = typedParams.paths
                    .filter((entry) => typeof entry === "string" && entry.trim().length > 0)
                    .slice(0, MAX_BATCH_FILES)
                    .map((entry) => path.isAbsolute(entry) ? entry : path.resolve(cwd, entry));
                return runBatchFileDiagnostics(absPaths, severity, lspService, {
                    concurrency,
                    waitMs,
                    signal,
                    onProgress,
                    nextWriteIndex,
                    serverScope,
                    cwd,
                });
            }
            const rawPath = typedParams.path;
            if (!rawPath || rawPath.trim().length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "path or paths is required.",
                        },
                    ],
                    isError: true,
                    details: {},
                };
            }
            const absPath = path.isAbsolute(rawPath)
                ? rawPath
                : path.resolve(cwd, rawPath);
            let stat;
            try {
                stat = fs.statSync(absPath);
            }
            catch {
                return {
                    content: [
                        { type: "text", text: `Path not found: ${absPath}` },
                    ],
                    isError: true,
                    details: {},
                };
            }
            if (stat.isDirectory()) {
                return runDirectoryDiagnostics(absPath, severity, lspService, {
                    concurrency,
                    waitMs,
                    signal,
                    onProgress,
                    nextWriteIndex,
                    serverScope,
                    cwd,
                });
            }
            return runFileDiagnostics(absPath, severity, lspService, waitMs, nextWriteIndex, serverScope, cwd);
        },
    };
}
async function collectDiagnosticsForFile(absPath, lspService, waitMs, serverScope = "all") {
    let timedOut = false;
    let content;
    // #629: `touched` (when defined) is ALREADY the correctly-scoped,
    // already-collected diagnostics array for this touch — `touchFile` below
    // is called with `collectDiagnostics: true` and `clientScope: serverScope`,
    // so its return value only contains diagnostics from the servers
    // `serverScope` asked for. Previously this function discarded `touched`
    // (reading only `.inconclusive` off it) and made a SECOND, unconditionally
    // -unscoped `getDiagnostics()` call for the actual content — meaning every
    // touchFile-branch call paid for two LSP round trips instead of one, and
    // `serverScope: "primary"` never actually skipped the auxiliary scanners
    // (getDiagnostics always queries every registered server for the file).
    // `touched` is only undefined when touchFile itself couldn't produce a
    // result (service destroyed, no clients resolved) — that's the one case
    // that still needs the getDiagnostics() fallback below.
    let touched;
    let usedTouch = false;
    try {
        content = fs.readFileSync(absPath, "utf-8");
        const serviceWithTouch = lspService;
        if ((waitMs !== undefined || serverScope === "primary") &&
            typeof serviceWithTouch.touchFile === "function") {
            usedTouch = true;
            touched = await serviceWithTouch.touchFile(absPath, content, {
                diagnostics: "document",
                collectDiagnostics: true,
                maxClientWaitMs: waitMs,
                source: "lsp_diagnostics",
                clientScope: serverScope,
            });
            timedOut = touched?.inconclusive === true;
        }
        else {
            await lspService.openFile(absPath, content, {
                preserveDiagnostics: false,
            });
        }
    }
    catch {
        // Non-fatal: getDiagnostics may still have stale/health information.
    }
    // Only fall through to the unscoped getDiagnostics() read when the touch
    // branch wasn't taken (openFile-only path, which never collected anything
    // and genuinely needs the follow-up call) or couldn't resolve any clients
    // at all (touched stays undefined despite usedTouch). When touched IS
    // defined it's already the answer — reusing it is what makes
    // serverScope:"primary" actually skip auxiliary scanners and drops the
    // common case back to a single LSP round trip instead of two.
    const diagnostics = usedTouch && touched !== undefined
        ? touched
        : await lspService.getDiagnostics(absPath, waitMs !== undefined ? "document" : "full");
    // #586: honor each auxiliary profile's native inline-suppression comment
    // (e.g. opengrep's `// nosemgrep`, #441) the same way the per-edit dispatch
    // runner does — previously this standalone query path ignored it entirely.
    // #692: also honor a profile's `skipTestFiles` gate (e.g. ast-grep, #687) —
    // this standalone-query path had no test-file gating of its own, so an
    // `lsp_diagnostics` check on a test file surfaced ast-grep findings the
    // per-edit dispatch runner would have suppressed. `content` is only unset
    // if the read itself failed above; fail-open (no filtering) rather than
    // lose diagnostics over an unrelated read error.
    const filtered = content !== undefined
        ? applyAuxiliarySuppressions(diagnostics, content, {
            fileRole: detectFileRole(absPath, content),
        })
        : diagnostics;
    return { diagnostics: filtered, timedOut, content };
}
function diagnosticsToFileDiags(file, diagnostics) {
    return diagnostics.map((d) => ({
        file,
        line: d.range?.start?.line,
        character: d.range?.start?.character,
        severity: d.severity,
        message: d.message,
        source: d.source,
        code: d.code,
    }));
}
/**
 * #533: classify an EMPTY diagnostic result as "clean" (the server actually
 * confirmed no issues) or "unconfirmed" (came from a push-only,
 * silent-on-clean server — classic typescript-language-server — that
 * publishes nothing on a clean→clean transition, so an empty result here is
 * indistinguishable from "still analyzing" or "never asked"). Reuses the same
 * capability-snapshot classifier the #458 cascade lane already trusts
 * (`classifyCascadeWaitTier`) so this tool's notion of "silent tier-3" stays
 * in lockstep with the rest of the LSP layer instead of drifting via a second
 * copy of the server-strategy table. Fail-safe: any error or missing snapshot
 * (server not alive, capability probe failure) reads as "clean" — the same
 * default this tool has always had — rather than manufacturing a new failure
 * mode from a best-effort classification.
 */
async function classifyEmptyResult(file, lspService) {
    try {
        const snapshots = await lspService.getCapabilitySnapshots(file);
        const tier = classifyCascadeWaitTier(lspService, file, snapshots);
        return tier === "tier3-silent" ? "unconfirmed" : "clean";
    }
    catch {
        return "clean";
    }
}
// --- #611/#707: tier-3 silent escape hatch (typescript.tsserverRequest sync
// commands) — implementation extracted to clients/lsp/tsserver-sync.ts and
// re-used from there by the per-edit dispatch path (#707). ---
/**
 * #611: resolve an EMPTY diagnostic result for a Tier-3 silent server (see
 * `classifyCascadeWaitTier` — today only classic typescript-language-server,
 * native-ts7 is explicitly excluded there) with a definitive answer instead of
 * defaulting straight to "unconfirmed". `confirmed: true` with an empty
 * `diagnostics` array is a genuinely confirmed clean result; `confirmed: true`
 * with a non-empty array means the sync command surfaced real diagnostics the
 * server had computed but never published (silentOnClean) — these must be
 * surfaced to the caller, not discarded. `confirmed: false` is the existing
 * "unconfirmed" fallback (command unavailable, error, or the file isn't part
 * of any project). Fail-safe: any error in the tier classification itself
 * (missing snapshot, server not alive) reads as `confirmed: true` with no
 * diagnostics — the same "clean" default this tool has always had.
 */
async function resolveEmptyResult(file, lspService) {
    try {
        const snapshots = await lspService.getCapabilitySnapshots(file);
        const tier = classifyCascadeWaitTier(lspService, file, snapshots);
        if (tier !== "tier3-silent") {
            return { confirmed: true, diagnostics: [] };
        }
        const syncDiagnostics = await attemptTsserverSyncDiagnostics(file, lspService);
        if (syncDiagnostics === undefined) {
            return { confirmed: false, diagnostics: [] };
        }
        return { confirmed: true, diagnostics: syncDiagnostics };
    }
    catch {
        return { confirmed: true, diagnostics: [] };
    }
}
/**
 * #571: reconcile this tool's fresh LSP result into the footer cache
 * (`widget-state.ts`'s `allDiagnostics`) — same shared choke point
 * `lens_diagnostics` mode=full uses (`clients/widget-state.ts`'s
 * `reconcileScanDiagnostics`). A manual `lsp_diagnostics` check that proves a
 * stale footer error is actually gone (the real-world case that surfaced
 * #571) is exactly the kind of confirmed result that should correct it.
 *
 * `rawDiags` (pre-severity-filter) is what gets written — the footer records
 * the true known state, independent of this call's display-only severity
 * filter. A non-empty result is definitionally confirmed (the server DID
 * answer with real diagnostics); an empty result is only confirmed when
 * `classifyEmptyResult` (#533) says "clean", not "unconfirmed" (silent
 * push-only server — indistinguishable from still-analyzing/never-asked, so
 * must not overwrite a real prior footer entry).
 *
 * #692: `retagAuxiliaryDiagnostics` re-tags aux-sourced entries (ast-grep,
 * opengrep, zizmor, typos) with their real tool id + semantic policy before
 * they're written — the same treatment the per-edit dispatch runner gives
 * them — so a scan-reconciled entry no longer keeps tool `"lsp"`. `content`
 * is the file content `collectDiagnosticsForFile`/the cache already read (or
 * undefined for a cache-hit branch, whose `rawDiags` were already suppression-
 * /skipTestFiles-filtered at write time — an empty string here is then a safe
 * no-op re-check, not a behavior gap).
 */
function reconcileWidgetFromLspResult(file, rawDiags, confirmation, nextWriteIndex, cwd, content) {
    const confirmed = rawDiags.length > 0 || confirmation !== "unconfirmed";
    if (!confirmed)
        return;
    try {
        // #692: provenance label ONLY — must never affect `rule`/identity (see
        // `ConvertLspDiagnosticsOptions.scanOrigin`'s doc comment).
        const diagnostics = convertLspDiagnostics(rawDiags, file, {
            scanOrigin: "lsp_diagnostics",
        });
        const retagged = retagAuxiliaryDiagnostics(diagnostics, rawDiags, content ?? "", { cwd, fileRole: detectFileRole(file, content) });
        reconcileScanDiagnostics(file, retagged, true, nextWriteIndex?.());
    }
    catch {
        // Never let a footer-reconciliation hiccup fail the diagnostics check.
    }
}
async function collectFileDiagnosticResult(file, severity, lspService, waitMs, nextWriteIndex, serverScope = "all", 
// #671: shared workspace-diagnostics cache (see `createWorkspaceDiagnostics
// CacheContext`'s doc) — optional so single-file callers of this function
// (there are none today, but keep it non-breaking) can omit it and simply
// always touch. Only `collectBatchDiagnostics` (the batch/directory sweep)
// passes these.
cacheCtx, scopeKey, 
// #692: threaded through so `reconcileWidgetFromLspResult` can compute
// `allowBlocking(cwd)` for a scan-reconciled aux finding — defaults to
// `process.cwd()` for any call site that predates this (there are none
// today besides the two below, both of which now pass it explicitly).
cwd = process.cwd()) {
    let stat;
    try {
        stat = fs.statSync(file);
        if (!stat.isFile()) {
            return { file, diagnostics: [], error: `${file}: not a file` };
        }
    }
    catch {
        return { file, diagnostics: [], error: `${file}: path not found` };
    }
    if (cacheCtx && scopeKey !== undefined) {
        const cached = cacheCtx.lookup(file, scopeKey);
        if (cached) {
            const filteredDiags = applySeverityFilter(cached.diagnostics, severity);
            const confirmation = cached.diagnostics.length === 0 ? "clean" : undefined;
            // #692: cached.diagnostics were already suppression-/skipTestFiles-
            // filtered at write time (this same code path); no file content was
            // cached alongside them, so `undefined` here is a safe re-check, not
            // a gap.
            reconcileWidgetFromLspResult(file, cached.diagnostics, confirmation, nextWriteIndex, cwd, undefined);
            return {
                file,
                diagnostics: diagnosticsToFileDiags(file, filteredDiags),
                confirmation,
                primaryServerId: primaryServerId(file),
            };
        }
    }
    const { diagnostics: rawDiags, timedOut, content: collectedContent, } = await collectDiagnosticsForFile(file, lspService, waitMs, serverScope);
    const health = lspService.getDiagnosticsHealth?.(file);
    // #570: a timed-out priming check is never a confirmed "clean" — treat it
    // as unconfirmed without consulting the (unrelated) silent-tier
    // classifier, and remember why so the rendered text is accurate.
    // #611: a genuinely empty (not just severity-filtered-away) push-based
    // result gets a shot at the tier-3 sync escape hatch before "unconfirmed"
    // — it may surface real diagnostics the server never published, which must
    // be merged in rather than discarded.
    let effectiveRawDiags = rawDiags;
    let confirmation;
    if (timedOut) {
        if (applySeverityFilter(rawDiags, severity).length === 0) {
            confirmation = "unconfirmed";
        }
    }
    else if (rawDiags.length === 0) {
        const resolved = await resolveEmptyResult(file, lspService);
        effectiveRawDiags = resolved.diagnostics;
        confirmation = resolved.confirmed
            ? resolved.diagnostics.length === 0
                ? "clean"
                : undefined
            : "unconfirmed";
    }
    else if (applySeverityFilter(rawDiags, severity).length === 0) {
        confirmation = await classifyEmptyResult(file, lspService);
    }
    const filteredDiags = applySeverityFilter(effectiveRawDiags, severity);
    reconcileWidgetFromLspResult(file, effectiveRawDiags, confirmation, nextWriteIndex, cwd, collectedContent);
    // #671: only a CONFIRMED outcome ("clean", or a non-empty result — either
    // is definitionally confirmed per this function's own doctrine above) is
    // safe to cache; "unconfirmed" (timeout OR a silent-tier server's
    // unescapable empty push) must never be persisted as a cacheable clean
    // result — same false-clean bug class `runWorkspaceDiagnostics`'s cache
    // wiring guards against.
    if (cacheCtx && scopeKey !== undefined && confirmation !== "unconfirmed") {
        cacheCtx.record(file, scopeKey, effectiveRawDiags, stat.mtimeMs);
    }
    return {
        file,
        diagnostics: diagnosticsToFileDiags(file, filteredDiags),
        unavailable: lspUnavailableMessage(file, health),
        confirmation,
        timedOut: confirmation === "unconfirmed" ? timedOut : undefined,
        primaryServerId: primaryServerId(file),
    };
}
async function runFileDiagnostics(absPath, severity, lspService, waitMs, nextWriteIndex, serverScope = "all", cwd = process.cwd()) {
    const { diagnostics: rawDiags, timedOut, content: collectedContent, } = await collectDiagnosticsForFile(absPath, lspService, waitMs, serverScope);
    const lspHealth = lspService.getDiagnosticsHealth?.(absPath);
    const unavailable = lspUnavailableMessage(absPath, lspHealth);
    // #533: an empty result needs a confirmed/unconfirmed verdict — a push-only,
    // silent-on-clean server (classic typescript) publishes nothing on a
    // clean→clean edit, so "0 diagnostics" from it is unverifiable, not clean.
    // #570: a timed-out priming check is a second, distinct reason a result
    // can be unconfirmed — checked first since it's a property of THIS check,
    // not a general server-capability classification.
    // #611: a genuinely empty (not just severity-filtered-away) result gets a
    // shot at the tier-3 sync escape hatch before "unconfirmed" — real
    // diagnostics it surfaces are merged in, not discarded.
    let effectiveRawDiags = rawDiags;
    let confirmation;
    if (timedOut) {
        if (applySeverityFilter(rawDiags, severity).length === 0) {
            confirmation = "unconfirmed";
        }
    }
    else if (rawDiags.length === 0) {
        const resolved = await resolveEmptyResult(absPath, lspService);
        effectiveRawDiags = resolved.diagnostics;
        confirmation = resolved.confirmed
            ? resolved.diagnostics.length === 0
                ? "clean"
                : undefined
            : "unconfirmed";
    }
    else if (applySeverityFilter(rawDiags, severity).length === 0) {
        confirmation = await classifyEmptyResult(absPath, lspService);
    }
    const filtered = applySeverityFilter(effectiveRawDiags, severity);
    const total = filtered.length;
    const truncated = total > MAX_DIAGNOSTICS;
    const limited = truncated ? filtered.slice(0, MAX_DIAGNOSTICS) : filtered;
    const unconfirmed = confirmation === "unconfirmed";
    reconcileWidgetFromLspResult(absPath, effectiveRawDiags, confirmation, nextWriteIndex, cwd, collectedContent);
    const primaryId = primaryServerId(absPath);
    const primaryDiags = limited.filter((d) => d.source === primaryId);
    const auxiliaryDiags = limited.filter((d) => d.source !== primaryId);
    // Primary confirmation is always its own line, independent of how many
    // auxiliary findings exist — a wall of ast-grep/opengrep noise must never
    // bury whether the actual language server confirmed the file clean.
    const primaryLine = (() => {
        if (timedOut) {
            return ("Primary LSP: check timed out — NOT the same as 0 diagnostics; the " +
                "file may still have errors that just hadn't been reported yet. " +
                "Re-check after the server settles, or increase waitMs.");
        }
        if (unconfirmed) {
            return (`Primary LSP${primaryId ? ` (${primaryId})` : ""}: unconfirmed — ` +
                "cannot confirm clean (push-only, silent-on-clean, e.g. classic " +
                "typescript-language-server never publishes on a clean re-check). " +
                "NOT the same as 0 diagnostics; re-check after an edit, or use " +
                "waitMs to wait longer.");
        }
        if (primaryDiags.length === 0) {
            return `Primary LSP${primaryId ? ` (${primaryId})` : ""}: confirmed clean.`;
        }
        return `Primary LSP${primaryId ? ` (${primaryId})` : ""}: ${primaryDiags.length} diagnostic${primaryDiags.length === 1 ? "" : "s"}.`;
    })();
    let text;
    if (total === 0) {
        text = [primaryLine, "", unavailable ?? "No auxiliary findings."].join("\n");
    }
    else {
        const lines = [primaryLine, ""];
        if (primaryDiags.length > 0) {
            lines.push(...primaryDiags.map(formatDiag), "");
        }
        if (auxiliaryDiags.length > 0) {
            lines.push(`Auxiliary findings (${auxiliaryDiags.length}):`);
            lines.push(...auxiliaryDiags.map(formatDiag));
        }
        if (unavailable)
            lines.unshift(unavailable, "");
        if (truncated) {
            lines.unshift(`Found ${total} diagnostics (showing first ${MAX_DIAGNOSTICS}):`);
        }
        text = lines.join("\n");
    }
    return {
        content: [{ type: "text", text }],
        details: {
            filePath: absPath,
            mode: "file",
            severity,
            serverScope,
            primaryServerId: primaryId,
            primaryDiagnosticsCount: primaryDiags.length,
            auxiliaryDiagnosticsCount: auxiliaryDiags.length,
            diagnostics: limited.map((d) => ({
                line: d.range?.start?.line,
                character: d.range?.start?.character,
                severity: d.severity,
                message: d.message,
                source: d.source,
                code: d.code,
            })),
            totalDiagnostics: total,
            truncated,
            unconfirmed,
            timedOut: unconfirmed ? timedOut : undefined,
            lspHealth,
            waitMs,
        },
    };
}
/**
 * #533: tally the per-file discriminated outcome across a batch/directory
 * result set. `unconfirmed` files are those whose diagnostics collapsed to an
 * empty array from a push-only, silent-on-clean server (see
 * `classifyEmptyResult`) — they must never be folded into "clean" in the
 * aggregate render, or a majority-unconfirmed result reads as a false "0
 * diagnostics across N files".
 */
function tallyConfirmation(results) {
    let clean = 0;
    let unconfirmed = 0;
    let timedOut = 0;
    for (const result of results) {
        if (result.diagnostics.length > 0)
            continue;
        if (result.confirmation === "unconfirmed") {
            unconfirmed += 1;
            // #570: timed-out checks are a subset of "unconfirmed" — tallied
            // separately so the aggregate text can say WHY, not just THAT.
            if (result.timedOut)
                timedOut += 1;
        }
        else {
            clean += 1;
        }
    }
    return { clean, unconfirmed, timedOut };
}
/**
 * #570: build the explanatory clause for a batch/directory result that has
 * unconfirmed files, distinguishing timed-out checks from the pre-existing
 * #533 silent-on-clean-server bucket — both are "unconfirmed" for counting,
 * but the reason differs and misreporting a timeout as "server can't confirm
 * clean" would itself be misleading.
 */
function unconfirmedReasonClause(unconfirmed, timedOut) {
    const silent = unconfirmed - timedOut;
    if (timedOut > 0 && silent > 0) {
        return (`${timedOut} timed out (check didn't complete within budget) and ` +
            `${silent} from a server that cannot confirm clean (push-only, ` +
            "silent-on-clean).");
    }
    if (timedOut > 0) {
        return `${timedOut} timed out (check didn't complete within the wait budget).`;
    }
    return ("from a server that cannot confirm clean (push-only, silent-on-clean; " +
        "e.g. classic typescript-language-server does not publish on a clean " +
        "re-check).");
}
/**
 * Fan out `collectFileDiagnosticResult` across a file list at bounded
 * concurrency and reduce the results into the shape both batch-style callers
 * (`runBatchFileDiagnostics`/`runDirectoryDiagnostics`) render from —
 * previously duplicated identically between them (SonarCloud
 * `new_duplicated_lines_density` gate, surfaced when #571 added the
 * `nextWriteIndex` threading to both call sites). Purely mechanical
 * extraction: no behavior change, and does NOT touch the confirmed/
 * unconfirmed semantics `collectFileDiagnosticResult`/`tallyConfirmation`
 * already encode — those, and `lens_diagnostics` mode=full's separate,
 * deliberately different confirmation gate in `tools/lens-diagnostics.ts`,
 * are unrelated to this file's internal duplication and are left exactly
 * as they were.
 */
async function collectBatchDiagnostics(files, severity, lspService, options) {
    // #671: one cache context for this whole batch/directory sweep — loaded
    // once, written back once after every file has been processed (see the
    // `persist()` call below), rather than round-tripping the on-disk cache
    // file per-file. Shared store with `runWorkspaceDiagnostics` (`lens_
    // diagnostics mode=full`'s engine); `scopeKey` keeps the two tools'
    // differently-scoped touches (this tool never excludes any server, that
    // one excludes opengrep — see `buildScopeKey`'s doc) from cross-serving
    // entries that wouldn't actually match what each asked for.
    const resolvedCwd = options.cwd ?? process.cwd();
    const cacheCtx = createWorkspaceDiagnosticsCacheContext(resolvedCwd);
    const scopeKey = buildScopeKey(options.serverScope ?? "all");
    const results = await mapWithConcurrency(files, options.concurrency, (file) => collectFileDiagnosticResult(file, severity, lspService, options.waitMs, options.nextWriteIndex, options.serverScope, cacheCtx, scopeKey, resolvedCwd), lspService, options.signal, options.onProgress);
    // Persist whatever was recorded, including a partial/aborted sweep's
    // already-completed files — same "don't throw away confirmed work"
    // posture as `runWorkspaceDiagnostics`.
    cacheCtx.persist();
    const fileErrors = results.flatMap((result) => result.error ? [result.error] : []);
    const lspHealthWarnings = results.flatMap((result) => result.unavailable ? [result.unavailable] : []);
    const allDiags = results.flatMap((result) => result.diagnostics);
    const total = allDiags.length;
    const truncated = total > MAX_DIAGNOSTICS;
    const display = truncated ? allDiags.slice(0, MAX_DIAGNOSTICS) : allDiags;
    const { clean, unconfirmed, timedOut } = tallyConfirmation(results);
    // Per-file primary-server lookup so a flattened multi-file `display` list
    // can still be split into "primary findings" vs "auxiliary findings" —
    // `clean`/`unconfirmed` above already reflect ONLY the primary server's
    // confirmation; this split does the same job for the listed diagnostics.
    const primaryIdByFile = new Map(results.map((r) => [r.file, r.primaryServerId]));
    const primaryDisplay = display.filter((d) => d.source === primaryIdByFile.get(d.file));
    const auxiliaryDisplay = display.filter((d) => d.source !== primaryIdByFile.get(d.file));
    return {
        results,
        fileErrors,
        lspHealthWarnings,
        total,
        truncated,
        display,
        primaryDisplay,
        auxiliaryDisplay,
        clean,
        unconfirmed,
        timedOut,
    };
}
async function runBatchFileDiagnostics(absPaths, severity, lspService, options) {
    if (absPaths.length === 0) {
        return {
            content: [{ type: "text", text: "No file paths provided." }],
            isError: true,
            details: { mode: "batch", severity, filesChecked: 0 },
        };
    }
    const { results, fileErrors, lspHealthWarnings, total, truncated, display, primaryDisplay, auxiliaryDisplay, clean, unconfirmed, timedOut, } = await collectBatchDiagnostics(absPaths, severity, lspService, options);
    const lines = [
        `Files checked: ${results.length}`,
        `Total diagnostics: ${total}`,
        `Concurrency: ${options.concurrency}`,
    ];
    if (options.waitMs !== undefined)
        lines.push(`Wait budget: ${options.waitMs}ms`);
    if (fileErrors.length > 0)
        lines.push("", "File errors:", ...fileErrors);
    if (lspHealthWarnings.length > 0) {
        lines.push("", "LSP health warnings:", ...lspHealthWarnings.slice(0, 10));
    }
    // #533/#570: surface unconfirmed files regardless of whether OTHER files in
    // the batch found real diagnostics — a mixed found/unconfirmed result must
    // not let the unconfirmed files silently pass as clean just because the
    // batch as a whole isn't "0 diagnostics". This tally is primary-server-only
    // (see collectFileDiagnosticResult) — it's the batch-level equivalent of
    // the single-file "Primary LSP: ..." line, always reported on its own.
    if (unconfirmed > 0) {
        lines.push("", `${clean} file${clean === 1 ? "" : "s"} confirmed clean, ${unconfirmed} unconfirmed: ` +
            `${unconfirmedReasonClause(unconfirmed, timedOut)} NOT the same as 0 diagnostics.`);
    }
    if (display.length === 0) {
        if (unconfirmed === 0) {
            lines.push("", "No diagnostics found.");
        }
    }
    else {
        if (primaryDisplay.length > 0) {
            lines.push("", `Primary findings (${primaryDisplay.length}):`);
            lines.push(...primaryDisplay.map(formatDisplayDiag));
        }
        if (auxiliaryDisplay.length > 0) {
            lines.push("", `Auxiliary findings (${auxiliaryDisplay.length}):`);
            lines.push(...auxiliaryDisplay.map(formatDisplayDiag));
        }
        if (truncated) {
            lines.push("", `... (${total - MAX_DIAGNOSTICS} more diagnostics not shown)`);
        }
    }
    return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: {
            mode: "batch",
            severity,
            serverScope: options.serverScope ?? "all",
            filesChecked: results.length,
            concurrency: options.concurrency,
            waitMs: options.waitMs,
            diagnostics: display,
            primaryDiagnosticsCount: primaryDisplay.length,
            auxiliaryDiagnosticsCount: auxiliaryDisplay.length,
            totalDiagnostics: total,
            truncated,
            cleanFiles: clean,
            unconfirmedFiles: unconfirmed,
            timedOutFiles: timedOut > 0 ? timedOut : undefined,
            fileErrors: fileErrors.length > 0 ? fileErrors : undefined,
            lspHealthWarnings: lspHealthWarnings.length > 0 ? lspHealthWarnings : undefined,
        },
    };
}
async function runDirectoryDiagnostics(absPath, severity, lspService, options) {
    let extension;
    let collectedFiles = [];
    const isIgnored = projectIgnorePredicate(absPath);
    for (const [ext, exts] of Object.entries(LANG_EXTENSIONS)) {
        collectedFiles = collectFiles(absPath, exts, MAX_FILES + 1, isIgnored);
        if (collectedFiles.length > 0) {
            extension = ext;
            break;
        }
    }
    if (!extension || collectedFiles.length === 0) {
        return {
            content: [
                {
                    type: "text",
                    text: `No supported source files found in: ${absPath}`,
                },
            ],
            details: {
                filePath: absPath,
                mode: "directory",
                severity,
                filesScanned: 0,
            },
        };
    }
    const wasCapped = collectedFiles.length > MAX_FILES;
    const filesToProcess = collectedFiles.slice(0, MAX_FILES);
    const { fileErrors, lspHealthWarnings, total, truncated, display, primaryDisplay, auxiliaryDisplay, clean, unconfirmed, timedOut, } = await collectBatchDiagnostics(filesToProcess, severity, lspService, options);
    let text;
    if (total === 0) {
        // #533/#570: an unconfirmed-containing directory result must never
        // render as a bare "no diagnostics" — that reads as an affirmative
        // clean scan the server never actually gave for those files.
        const cleanLine = unconfirmed > 0
            ? `${clean} clean · ${unconfirmed} unconfirmed: ` +
                `${unconfirmedReasonClause(unconfirmed, timedOut)} NOT the same as 0 diagnostics.`
            : "No diagnostics found.";
        text = [
            `Directory: ${absPath}`,
            `Files scanned: ${filesToProcess.length}${wasCapped ? ` (capped at ${MAX_FILES})` : ""}`,
            ...(lspHealthWarnings.length > 0
                ? [
                    "LSP unavailable for one or more files:",
                    ...lspHealthWarnings.slice(0, 10),
                ]
                : [cleanLine]),
        ].join("\n");
    }
    else {
        const lines = [
            `Directory: ${absPath}`,
            `Files scanned: ${filesToProcess.length}${wasCapped ? ` (capped at ${MAX_FILES})` : ""}`,
            `Files with errors: ${new Set(display.map((d) => d.file)).size}`,
            `Total diagnostics: ${total}`,
            ...(lspHealthWarnings.length > 0
                ? ["", "LSP health warnings:", ...lspHealthWarnings.slice(0, 10)]
                : []),
            // #533/#570: the remaining clean-looking files in a mixed scan may
            // still be unconfirmed — say so even though the directory as a
            // whole found diagnostics elsewhere.
            ...(unconfirmed > 0
                ? [
                    "",
                    `${clean} other file${clean === 1 ? "" : "s"} confirmed clean, ${unconfirmed} unconfirmed: ` +
                        unconfirmedReasonClause(unconfirmed, timedOut),
                ]
                : []),
            "",
        ];
        const toRelative = (d) => ({
            ...d,
            file: path.relative(absPath, d.file),
        });
        if (primaryDisplay.length > 0) {
            lines.push(`Primary findings (${primaryDisplay.length}):`);
            lines.push(...primaryDisplay.map(toRelative).map(formatDisplayDiag));
            lines.push("");
        }
        if (auxiliaryDisplay.length > 0) {
            lines.push(`Auxiliary findings (${auxiliaryDisplay.length}):`);
            lines.push(...auxiliaryDisplay.map(toRelative).map(formatDisplayDiag));
        }
        if (truncated) {
            lines.push("", `... (${total - MAX_DIAGNOSTICS} more diagnostics not shown)`);
        }
        text = lines.join("\n");
    }
    return {
        content: [{ type: "text", text }],
        details: {
            filePath: absPath,
            mode: "directory",
            severity,
            serverScope: options.serverScope ?? "all",
            filesScanned: filesToProcess.length,
            capped: wasCapped,
            diagnostics: display.map((d) => ({
                file: path.relative(absPath, d.file),
                line: d.line,
                character: d.character,
                severity: d.severity,
                message: d.message,
                source: d.source,
                code: d.code,
            })),
            primaryDiagnosticsCount: primaryDisplay.length,
            auxiliaryDiagnosticsCount: auxiliaryDisplay.length,
            totalDiagnostics: total,
            truncated,
            cleanFiles: clean,
            unconfirmedFiles: unconfirmed,
            timedOutFiles: timedOut > 0 ? timedOut : undefined,
            fileErrors: fileErrors.length > 0 ? fileErrors : undefined,
            lspHealthWarnings: lspHealthWarnings.length > 0 ? lspHealthWarnings : undefined,
            concurrency: options.concurrency,
            waitMs: options.waitMs,
        },
    };
}
// ── helpers ─────────────────────────────────────────────────────────────
function applySeverityFilter(diags, severity) {
    if (severity === "all")
        return diags;
    const maxLevel = {
        error: 1,
        warning: 2,
        information: 3,
        hint: 4,
    };
    const max = maxLevel[severity] ?? 0;
    if (max === 0)
        return diags;
    return diags.filter((d) => (d.severity ?? 3) <= max);
}
function formatDisplayDiag(d) {
    const sevName = SEVERITY_NAMES[d.severity] ?? "unknown";
    const loc = d.line !== undefined
        ? `${d.file}:${d.line + 1}:${(d.character ?? 0) + 1}`
        : d.file;
    const src = d.source ? `[${d.source}]` : "";
    const code = d.code ? ` (${d.code})` : "";
    return `${loc}: ${sevName}${src}${code}: ${d.message}`;
}
function formatDiag(diag) {
    const loc = diag.range?.start?.line !== undefined
        ? `L${diag.range.start.line + 1}:${(diag.range.start.character ?? 0) + 1}`
        : "";
    const src = diag.source ? `[${diag.source}]` : "";
    const code = diag.code ? ` (${diag.code})` : "";
    const sevName = SEVERITY_NAMES[diag.severity] ?? "unknown";
    return `${loc}: ${sevName}${src}${code}: ${diag.message}`;
}
