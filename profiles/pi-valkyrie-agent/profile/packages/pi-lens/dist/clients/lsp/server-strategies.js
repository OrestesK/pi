/**
 * Per-Server Diagnostic Strategies for pi-lens LSP
 *
 * Codifies known server behavior so timing decisions (debounce, retry budget,
 * first-push seeding) are automatic rather than one-size-fits-all.
 *
 * Env var overrides (PI_LENS_LSP_*) always take precedence over strategy values.
 */
import { createRequire } from "node:module";
const _require = createRequire(import.meta.url);
/**
 * Platform/arch → `@ast-grep/cli-<platform>-<arch>[-msvc|-gnu]` native
 * package name, mirroring @ast-grep/cli's own `optionalDependencies` matrix
 * (checked directly against node_modules/@ast-grep/cli/package.json). Each
 * package ships the native `ast-grep`/`ast-grep.exe` binary at its package
 * root (no `bin/` subdir) — see node_modules/@ast-grep/cli-win32-x64-msvc/.
 */
function astGrepNativePackageName(platform, arch) {
    switch (platform) {
        case "win32":
            if (arch === "x64")
                return "@ast-grep/cli-win32-x64-msvc";
            if (arch === "arm64")
                return "@ast-grep/cli-win32-arm64-msvc";
            if (arch === "ia32")
                return "@ast-grep/cli-win32-ia32-msvc";
            return undefined;
        case "darwin":
            if (arch === "arm64")
                return "@ast-grep/cli-darwin-arm64";
            if (arch === "x64")
                return "@ast-grep/cli-darwin-x64";
            return undefined;
        case "linux":
            if (arch === "x64")
                return "@ast-grep/cli-linux-x64-gnu";
            if (arch === "arm64")
                return "@ast-grep/cli-linux-arm64-gnu";
            return undefined;
        default:
            return undefined;
    }
}
/**
 * Resolve ast-grep's platform-native exe DIRECTLY, skipping the node-bin
 * wrapper (`ast-grep.cmd`/shim → node → cli.js → spawn native exe). One less
 * orphanable process layer (#472): a wrapper's direct child is the node/cmd
 * process, so on abnormal exit the actual ast-grep binary is a grandchild the
 * #234 teardown path never reaches — resolving straight to the native exe
 * means the LSP's direct child IS the real server.
 *
 * `require.resolve` is wrapped in try/catch (ESM-safe via createRequire, same
 * pattern as clients/deps/ast-grep-napi.ts) — returns undefined so the caller
 * falls back to the existing wrapper-based resolution when the platform
 * package isn't installed (it's an optionalDependency; native builds can be
 * absent on unsupported platforms/arches or a partial install).
 */
export function resolveAstGrepNativeExe(platform = process.platform, arch = process.arch) {
    const pkgName = astGrepNativePackageName(platform, arch);
    if (!pkgName)
        return undefined;
    const binaryName = platform === "win32" ? "ast-grep.exe" : "ast-grep";
    try {
        return _require.resolve(`${pkgName}/${binaryName}`);
    }
    catch {
        return undefined;
    }
}
export const SERVER_DIAGNOSTIC_STRATEGIES = {
    typescript: {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 50,
        aggregateWaitMs: 1000,
        expectSemanticSecondPush: false,
        // Tier 3 (#458): typescript-language-server publishes nothing on a
        // clean→clean edit (docs/lsp-capability-matrix.md, re-confirmed
        // 2026-07-12). It's the lone core-set tier-3 server, which is exactly
        // why the cascade lane's in-lane wait is worth skipping for it
        // specifically. Applies to the CLASSIC server only (#524/#529/#558)
        // — TS7's native `tsc --lsp --stdio` variant shares this
        // "typescript" server id but the 2026-07-12 dual-environment
        // re-measurement found it now publishes on clean (a drift from the
        // #541 measurement); cascade-tier.ts's classifier checks the live
        // snapshot's launchVariant and never applies this flag to a
        // native-ts7 instance.
        silentOnClean: true,
    },
    "rust-analyzer": {
        seedFirstPush: false,
        pullRetryBudgetMs: 500,
        debounceMs: 150,
        aggregateWaitMs: 3000,
        expectSemanticSecondPush: true,
    },
    // PythonServer (pyright / basedpyright) — openFilesOnly mode: lazy per-file
    // analysis, startup similar to jedi. seedFirstPush: true because pyright's
    // first publishDiagnostics after didOpen is the complete result for that file.
    python: {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 100,
        aggregateWaitMs: 1500,
        expectSemanticSecondPush: false,
    },
    // jedi-language-server is push-only (no pull diagnostics) and its FIRST
    // publishDiagnostics is the complete result (seedFirstPush). But that first
    // push lands just after didOpen+~1s on cold start (Python/parso import) —
    // measured ~1011ms — so a 1000ms aggregate budget misses it by a hair and
    // returns zero. 3000ms gives cold-start headroom without stalling the warm path.
    "python-jedi": {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 100,
        aggregateWaitMs: 3000,
        expectSemanticSecondPush: false,
    },
    eslint: {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 200,
        aggregateWaitMs: 2000,
        expectSemanticSecondPush: false,
    },
    // Opengrep security scanner (cross-language LSP). It pushes an EMPTY result
    // during the one-time rule-load window at startup, then the real scan after
    // `semgrep/rulesRefreshed` — so never seed the first push. Push-only (no pull
    // diagnostics). Warm per-file scan ~1.3s; the first touch in a session may
    // also pay rule-load (~3.5s cold). aggregateWaitMs is 3500: it's this
    // server's OWN deadline, bounded by the per-edit caller cap as a ceiling
    // (#242), so on a 2500ms-capped edit opengrep waits min(2500, 3500)=2500
    // and on uncapped paths it gets its full 3500. 3500 covers warm and most
    // cold; a cold scan that overruns isn't lost — late diagnostics are cached
    // and surface on the next edit.
    opengrep: {
        seedFirstPush: false,
        pullRetryBudgetMs: 0,
        debounceMs: 250,
        aggregateWaitMs: 3500,
        expectSemanticSecondPush: false,
        // Opengrep re-scans only on a fresh didOpen — didChange is a no-op for it.
        reopenOnResync: true,
    },
    // ast-grep structural linter (sgconfig-gated auxiliary LSP). Push-only,
    // compiles the project rules on the first scan of a session, and — like
    // Opengrep — is re-synced via didClose+didOpen so edits trigger a re-scan.
    // Conservative budget until measured against real projects (#239).
    // ast-grep re-scans on didChange (verified: toggling the violation count
    // 3→1→4→2 returns the correct fresh count each touch, with matching doc
    // versions), so reopen isn't needed and didChange is the lighter path.
    // aggregateWaitMs is 1800: its warm scan is ~1.3s, so 1000 was under-budgeted
    // (only masked before because the old with-auxiliary deadline was a global
    // max() floor; now each server has its own caller-cap-bounded deadline, #242,
    // so the budget must actually cover the scan).
    "ast-grep": {
        seedFirstPush: false,
        pullRetryBudgetMs: 0,
        debounceMs: 150,
        aggregateWaitMs: 1800,
        expectSemanticSecondPush: false,
        reopenOnResync: false,
    },
    // zizmor (GitHub Actions security scanner, auxiliary LSP #272). Push-only
    // (no pull diagnostics). Its audit set is compiled-in — there's no rule-load
    // window like Opengrep — so the FIRST publishDiagnostics after didOpen IS the
    // complete result: seedFirstPush. It re-scans on didChange (FULL sync), so no
    // reopen-on-resync. A native single-workflow audit is sub-second offline;
    // online mode may add a GitHub-API round-trip, so 2000ms gives headroom
    // (bounded by the per-edit caller cap as a ceiling, #242), and any late online
    // finding is cached and surfaces on the next edit.
    zizmor: {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 150,
        aggregateWaitMs: 2000,
        expectSemanticSecondPush: false,
        reopenOnResync: false,
    },
    // typos (source-code spell checker, auxiliary LSP #283). Push-only (no pull
    // diagnostics). Its dictionary is compiled in — there's NO rule-load window
    // like Opengrep — so the FIRST publishDiagnostics after didOpen IS the
    // complete result: seedFirstPush. It re-scans on didChange (FULL sync), so no
    // reopen-on-resync. A native single-file spell scan is sub-100ms, so the seed
    // arrives near-instantly; aggregateWaitMs is a generous ceiling (bounded by
    // the per-edit caller cap, #242) that the early seed resolves well under.
    typos: {
        seedFirstPush: true,
        pullRetryBudgetMs: 0,
        debounceMs: 150,
        aggregateWaitMs: 1500,
        expectSemanticSecondPush: false,
        reopenOnResync: false,
    },
    // marksman (Markdown LSP, #274). Push-based; native binary so the per-file
    // parse is fast, but its value is CROSS-file (broken intra-repo links,
    // missing anchors/heading refs) which needs the workspace index — so the
    // first push after didOpen can be empty before indexing completes. Don't
    // seed it (like opengrep/rust-analyzer); a modest 1500ms aggregate covers
    // warm edits, and any late cross-file finding surfaces on the next touch.
    marksman: {
        seedFirstPush: false,
        pullRetryBudgetMs: 0,
        debounceMs: 150,
        aggregateWaitMs: 1500,
        expectSemanticSecondPush: false,
        // #645: a full-tree sweep opens every markdown file, all racing the
        // SAME one-time workspace index build — pay the 1500ms budget once
        // per sweep (the first markdown file touched), not once per file.
        // 250ms covers a warm per-file publish (native binary, fast parse)
        // once the index has already had a full aggregateWaitMs window.
        workspaceIndexing: true,
        workspaceIndexingWarmWaitMs: 250,
    },
};
/** Fallback for unknown servers. Conservative defaults. */
export const DEFAULT_STRATEGY = {
    seedFirstPush: false,
    pullRetryBudgetMs: 250,
    debounceMs: 150,
    aggregateWaitMs: 1500,
    expectSemanticSecondPush: false,
};
export function getStrategy(serverId) {
    return SERVER_DIAGNOSTIC_STRATEGIES[serverId] ?? DEFAULT_STRATEGY;
}
