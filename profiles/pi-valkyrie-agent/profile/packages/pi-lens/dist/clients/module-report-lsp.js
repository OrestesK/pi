/**
 * On-demand, file-scoped live-LSP enrichment for module_report (#256).
 *
 * Split out from clients/module-report.ts because LSP is the risky/optional tier:
 * it can touch heavyweight language-server state while the base report must stay a
 * predictable tree-sitter + review-graph read substitute. Invariants that keep
 * the #256 OOM impossible:
 *   - SCOPED: only ever query `references`/`implementation` on the REQUESTED file's
 *     own symbols. Reference *targets* are recorded as locations, never re-queried,
 *     so the blast radius is one server + this file (a sweep amortizes to one
 *     spawn per project root — clients are keyed by root and reused).
 *   - BOUNDED: a process-local queue serializes module_report LSP sweeps, then a
 *     worker pool caps per-sweep concurrency (2) and a symbol cap (20) so parallel
 *     report fan-out cannot flood the server; each probe is clipped to the
 *     remaining wall-clock budget.
 *   - OPT-IN: disabled by default (budget 0) until validated in a real pi session;
 *     enable with PI_LENS_MODULE_REPORT_LSP_BUDGET_MS.
 */
import { withinRemaining } from "./deadline-utils.js";
import { uriToPath } from "./path-utils.js";
let _lspBudgetMs;
let lspEnrichmentTail = Promise.resolve();
/** Test seam: clear memoized config/queue state so env overrides take effect. */
export function _resetModuleReportConfigForTests() {
    _lspBudgetMs = undefined;
    lspEnrichmentTail = Promise.resolve();
}
function getLspBudgetMs() {
    if (_lspBudgetMs === undefined) {
        const raw = Number(process.env.PI_LENS_MODULE_REPORT_LSP_BUDGET_MS);
        // Default OFF (0) after the #256 OOM: the live-LSP tier is opt-in until the
        // bounded/file-scoped path is validated in a real pi session. A finite >=0
        // value is honored verbatim (set 3000 to enable); anything else → 0.
        _lspBudgetMs = Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
    }
    return _lspBudgetMs;
}
// Keep defaults conservative: module_report is a read substitute, not a bulk
// references tool. These caps bound concurrent/in-flight language-server work
// inside the wall-clock budget. The process-level queue prevents N parallel
// reports from multiplying this per-report worker pool into a reference storm.
const MAX_LSP_SYMBOLS = 20;
const LSP_SYMBOL_CONCURRENCY = 2;
// Kinds whose implementers are worth an LSP `implementation` probe.
const INTERFACE_LIKE_KINDS = new Set(["interface", "class", "type"]);
const NO_LSP = {
    source: "none",
    references: false,
    implementations: false,
    byName: new Map(),
};
/**
 * LSP positions are 0-based and must land on the symbol's *identifier*. The
 * extractor records `column` at the declaration start (e.g. `export`/`function`),
 * so search the start line for the name from there to find the identifier column.
 */
function lspPosition(sym, lines) {
    const lineIdx = Math.max(0, sym.line - 1);
    const text = lines[lineIdx] ?? "";
    const fromCol = Math.max(0, (sym.column ?? 1) - 1);
    let character = text.indexOf(sym.name, fromCol);
    if (character < 0)
        character = text.indexOf(sym.name);
    if (character < 0)
        character = fromCol;
    return { line: lineIdx, character };
}
function lspLocationsToUsedBy(locs, cap) {
    const out = [];
    const seen = new Set();
    for (const loc of locs) {
        const file = loc.uri ? uriToPath(loc.uri) : "";
        if (!file)
            continue;
        const line = (loc.range?.start?.line ?? 0) + 1;
        const key = `${file}:${line}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        out.push({ file, symbol: "", line, relation: "references", provenance: "lsp" });
        if (out.length >= cap)
            break;
    }
    return out;
}
async function runWithExclusiveLspSweep(work) {
    const previous = lspEnrichmentTail.catch(() => undefined);
    let release;
    lspEnrichmentTail = previous.then(() => new Promise((resolve) => {
        release = resolve;
    }));
    await previous;
    try {
        return await work();
    }
    finally {
        release();
    }
}
/**
 * Best-effort live-LSP enrichment for the requested file's exported symbols.
 * On-demand: the first `references` call spawns/reuses the language server for
 * this file's root (clients are keyed by root, so repeated calls amortize to one
 * server). All queries target `absPath` only — never the reference targets — so
 * the work is bounded to this one file. Returns the base report's data untouched
 * if the tier is disabled, no server is configured, or nothing resolves in budget.
 */
export async function enrichModuleReportWithLsp(absPath, lines, targets, maxRefs, budgetMs = getLspBudgetMs()) {
    if (targets.length === 0 || budgetMs <= 0)
        return NO_LSP;
    return runWithExclusiveLspSweep(() => enrichModuleReportWithLspNow(absPath, lines, targets, maxRefs, budgetMs));
}
async function enrichModuleReportWithLspNow(absPath, lines, targets, maxRefs, budgetMs) {
    let getServersForFileWithConfig;
    let getLSPService;
    try {
        ({ getServersForFileWithConfig } = await import("./lsp/config.js"));
        ({ getLSPService } = await import("./lsp/index.js"));
    }
    catch {
        return NO_LSP;
    }
    // Gate: no configured server for THIS file's language → never spawn anything.
    try {
        if (getServersForFileWithConfig(absPath).length === 0)
            return NO_LSP;
    }
    catch {
        return NO_LSP;
    }
    const lsp = getLSPService();
    const deadlineAt = Date.now() + budgetMs;
    const byName = new Map();
    let sawReferences = false;
    let sawImpl = false;
    let next = 0;
    const cappedTargets = targets.slice(0, MAX_LSP_SYMBOLS);
    async function enrichOne(sym) {
        if (Date.now() >= deadlineAt)
            return;
        const { line, character } = lspPosition(sym, lines);
        const refsPromise = withinRemaining(lsp.references(absPath, line, character, false), deadlineAt).then((locs) => {
            if (!locs || Date.now() > deadlineAt)
                return;
            const usedBy = lspLocationsToUsedBy(locs, maxRefs);
            if (usedBy.length === 0)
                return;
            byName.set(sym.name, { ...byName.get(sym.name), usedBy });
            sawReferences = true;
        });
        const implPromise = INTERFACE_LIKE_KINDS.has(sym.kind)
            ? withinRemaining(lsp.implementation(absPath, line, character), deadlineAt).then((locs) => {
                if (!locs || locs.length === 0 || Date.now() > deadlineAt)
                    return;
                byName.set(sym.name, { ...byName.get(sym.name), hasImpl: true });
                sawImpl = true;
            })
            : Promise.resolve();
        await Promise.allSettled([refsPromise, implPromise]);
    }
    async function worker() {
        while (Date.now() < deadlineAt) {
            const index = next++;
            const sym = cappedTargets[index];
            if (!sym)
                return;
            await enrichOne(sym);
        }
    }
    const workers = Array.from({ length: Math.min(LSP_SYMBOL_CONCURRENCY, cappedTargets.length) }, () => worker());
    await Promise.allSettled(workers);
    return {
        source: sawReferences || sawImpl ? "live-lsp" : "none",
        references: sawReferences,
        implementations: sawImpl,
        byName,
    };
}
