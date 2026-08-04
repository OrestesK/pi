/**
 * Project Report (#773) — the top of the discovery funnel: `project_report` →
 * `module_report` → `read_symbol`. Answers "orient me in this project" from
 * data the review graph already computes, so no line of output exists unless
 * it changes which file the calling agent opens next (no vanity metrics —
 * no file counts, LOC averages, language breakdowns as their own section).
 *
 * READ-ONLY over the cached review graph, mirroring module_report's #256
 * no-build contract: this tool's product IS the graph, so a cold cache kicks
 * off a single bounded background build (deduped per cwd, fire-and-forget)
 * and returns `available: false` with an actionable retry hint — the same
 * shape symbol_search's cold word-index path uses (clients/lens-engine.ts).
 * The call never blocks on a build.
 *
 * Six sections, each capped and ranked worst/most-important first:
 *  1. trust     — graph freshness + coverage + edge-resolution-quality mix.
 *  2. hubs      — top fan-in files (the repo's contract surface).
 *  3. entryPoints — near-zero fan-in, high fan-out files (activation/CLI/mains).
 *  4. subsystems — directory-level import graph: cycles + layering violations.
 *  5. riskHotspots — fan-in × max per-symbol cyclomatic complexity.
 *  6. deadWeight — zero-importer files that aren't entry points (low-confidence
 *     — shipped with an explicit disclaimer; dynamic imports/runtime
 *     registration/test-only reachability all produce false positives here).
 *
 * Non-goals (v1, refs #773): no per-symbol detail (module_report's job), no
 * delta/"since ref" mode (needs git integration — a follow-up), no prose
 * summarization (structural facts only; the calling agent composes its own
 * narrative). Middle-man detection is NOT surfaced here: the review graph
 * does not currently persist that signal on symbol nodes (module_report
 * computes it per-file, on demand, from raw file content — see
 * middle-man-analysis.ts) and re-deriving it project-wide would mean
 * re-reading and re-scanning every class-bearing file on this read-only,
 * never-blocks path. A follow-up could have the builder persist the signal
 * into symbol-node metadata so this path can read it for free.
 */
import * as path from "node:path";
import { normalizeMapKey } from "./path-utils.js";
import { loadProjectSnapshot } from "./project-snapshot.js";
const DEFAULT_LIMIT = 10;
const STALE_THRESHOLD_MS = 15 * 60_000; // 15 minutes
const LOW_COVERAGE_THRESHOLD = 0.8;
const DEAD_WEIGHT_DISCLAIMER = "Low confidence: dynamic imports, runtime registration, and test-only " +
    "reachability all produce false positives here — verify with a real " +
    "usage search (symbol_search/grep) before deleting anything listed.";
function clampLimit(limit) {
    return Math.max(1, Math.floor(limit ?? DEFAULT_LIMIT));
}
// Same display-path convention as module-report.ts's toDisplayPath: cwd-relative
// + forward-slashed under the project root, else the absolute (slash-normalized)
// path.
function toDisplayPath(p, projectRoot) {
    if (!path.isAbsolute(p))
        return p.replace(/\\/g, "/");
    const rel = path.relative(projectRoot, p);
    return rel && !rel.startsWith("..")
        ? rel.replace(/\\/g, "/")
        : p.replace(/\\/g, "/");
}
function suggestedNext(displayPath) {
    return { tool: "module_report", path: displayPath };
}
// --- focus re-ranking (module_report's normalizeFocus/focusScore pattern) ----
// Duplicated rather than imported: module-report.ts doesn't export these, and
// the two token sets are scored slightly differently downstream (whole
// section rankings here vs per-symbol/per-callback there), so a shared export
// would be a false abstraction for two call sites.
function normalizeFocus(focus) {
    return (focus ?? "")
        .toLowerCase()
        .split(/[^a-z0-9_.]+/)
        .map((part) => part.trim())
        .filter((part) => part.length >= 3)
        .slice(0, 8);
}
function focusScore(text, terms) {
    if (terms.length === 0)
        return 0;
    const haystack = text.toLowerCase();
    return terms.reduce((score, term) => score + (haystack.includes(term) ? 6 : 0), 0);
}
function buildFileDegrees(graph) {
    const fanIn = new Map();
    const fanOut = new Map();
    for (const edge of graph.edges) {
        if (edge.kind !== "imports")
            continue;
        if (edge.from === edge.to)
            continue;
        const fromNode = graph.nodes.get(edge.from);
        const toNode = graph.nodes.get(edge.to);
        if (!fromNode || fromNode.kind !== "file")
            continue;
        if (!toNode || toNode.kind !== "file")
            continue; // internal files only
        let outSet = fanOut.get(edge.from);
        if (!outSet) {
            outSet = new Set();
            fanOut.set(edge.from, outSet);
        }
        outSet.add(edge.to);
        let inSet = fanIn.get(edge.to);
        if (!inSet) {
            inSet = new Set();
            fanIn.set(edge.to, inSet);
        }
        inSet.add(edge.from);
    }
    return { fanIn, fanOut };
}
// --- section 1: trust header --------------------------------------------------
function computeTrust(graph, cwd) {
    const filesCovered = graph.fileNodes.size;
    const snapshot = loadProjectSnapshot(cwd);
    const snapshotFileCount = snapshot ? Object.keys(snapshot.files).length : 0;
    const filesTotal = Math.max(filesCovered, snapshotFileCount);
    const coverage = filesTotal > 0 ? filesCovered / filesTotal : 1;
    let exact = 0;
    let imp = 0;
    let receiverType = 0;
    let nameOnly = 0;
    for (const edge of graph.edges) {
        if (edge.kind !== "calls" && edge.kind !== "references")
            continue;
        switch (edge.resolution) {
            case "exact":
                exact += 1;
                break;
            case "import":
                imp += 1;
                break;
            case "receiver-type":
                receiverType += 1;
                break;
            case "name-only":
                nameOnly += 1;
                break;
            default:
                break;
        }
    }
    const sampleSize = exact + imp + receiverType + nameOnly;
    const frac = (n) => (sampleSize > 0 ? n / sampleSize : 0);
    const ageMs = Date.now() - Date.parse(graph.builtAt);
    const stale = Number.isFinite(ageMs) && ageMs > STALE_THRESHOLD_MS;
    const lowCoverage = coverage < LOW_COVERAGE_THRESHOLD;
    const notes = [];
    if (stale) {
        const ageMin = Math.round(ageMs / 60_000);
        notes.push(`Graph is stale: built ${ageMin}m ago. Sections below may miss recent edits — run pilens_rebuild or re-analyze to refresh.`);
    }
    if (lowCoverage) {
        notes.push(`Low coverage: only ${filesCovered}/${filesTotal} project files (${Math.round(coverage * 100)}%) are in the graph — whole subsystems may be invisible below.`);
    }
    return {
        graphBuiltAt: graph.builtAt,
        filesCovered,
        filesTotal,
        coverage,
        resolution: {
            exact: frac(exact),
            import: frac(imp),
            receiverType: frac(receiverType),
            nameOnly: frac(nameOnly),
            sampleSize,
        },
        stale,
        lowCoverage,
        notes,
    };
}
// --- section 2: hubs -----------------------------------------------------------
function roleFor(graph, filePath) {
    const symbolIds = graph.symbolNodesByFile.get(filePath) ?? [];
    const scored = [];
    for (const symbolId of symbolIds) {
        const node = graph.nodes.get(symbolId);
        if (!node || !node.exported || !node.symbolName)
            continue;
        const refs = (graph.edgesByTo.get(symbolId) ?? []).filter((e) => e.kind === "calls" || e.kind === "references").length;
        scored.push({ name: node.qualifiedName ?? node.symbolName, refs });
    }
    scored.sort((a, b) => b.refs - a.refs);
    const top = scored.slice(0, 3).filter((s) => s.refs > 0);
    return top.length > 0 ? top.map((s) => s.name).join(", ") : undefined;
}
async function computeHubs(graph, degrees, cwd, limit, focusTerms) {
    const { computeTransitiveImpact } = await import("./review-graph/query.js");
    const ranked = [...graph.fileNodes.entries()]
        .map(([filePath, fileNodeId]) => ({
        filePath,
        fileNodeId,
        fanIn: degrees.fanIn.get(fileNodeId)?.size ?? 0,
    }))
        .filter((f) => f.fanIn > 0)
        .sort((a, b) => {
        const focusDelta = focusScore(a.filePath, focusTerms) - focusScore(b.filePath, focusTerms);
        if (focusDelta !== 0)
            return -focusDelta;
        return b.fanIn - a.fanIn || a.filePath.localeCompare(b.filePath);
    })
        .slice(0, limit);
    return ranked.map((f) => {
        const impact = computeTransitiveImpact(graph, f.filePath, { maxDepth: 3 });
        const display = toDisplayPath(f.filePath, cwd);
        return {
            file: display,
            fanIn: f.fanIn,
            blastRadius: impact.hits.length,
            role: roleFor(graph, f.filePath),
            suggestedNext: suggestedNext(display),
        };
    });
}
// --- section 3: entry points ---------------------------------------------------
function computeEntryPoints(graph, degrees, cwd, limit, focusTerms) {
    const candidates = [...graph.fileNodes.entries()]
        .map(([filePath, fileNodeId]) => ({
        filePath,
        fanIn: degrees.fanIn.get(fileNodeId)?.size ?? 0,
        fanOut: degrees.fanOut.get(fileNodeId)?.size ?? 0,
    }))
        .filter((f) => f.fanIn === 0 && f.fanOut > 0)
        .sort((a, b) => {
        const focusDelta = focusScore(a.filePath, focusTerms) - focusScore(b.filePath, focusTerms);
        if (focusDelta !== 0)
            return -focusDelta;
        return b.fanOut - a.fanOut || a.filePath.localeCompare(b.filePath);
    });
    // The exclusion set for dead weight is UNCAPPED (#773: "zero-importer files
    // that aren't entry points") — an entry-point-like file past the display
    // cap must not be reclassified as suspected dead weight.
    const entryPointFiles = new Set(candidates.map((c) => c.filePath));
    const entryPoints = candidates.slice(0, limit).map((f) => {
        const display = toDisplayPath(f.filePath, cwd);
        return {
            file: display,
            fanIn: f.fanIn,
            fanOut: f.fanOut,
            suggestedNext: suggestedNext(display),
        };
    });
    return { entryPoints, entryPointFiles };
}
// --- section 4: subsystem map (directory-level aggregation) -------------------
// Depth heuristic (#773): first path segment under the project root by
// default; collapse to a deeper (two-segment) cluster only for files under a
// segment that dominates the covered file set (so a monorepo's one giant
// top-level dir still gets useful sub-clustering instead of one blob node).
const DOMINANCE_THRESHOLD = 0.4;
function directoryClusters(filePaths, cwd) {
    const segmentsOf = (filePath) => toDisplayPath(filePath, cwd).split("/").filter(Boolean);
    const topCounts = new Map();
    const perFileSegments = new Map();
    for (const filePath of filePaths) {
        const segments = segmentsOf(filePath);
        perFileSegments.set(filePath, segments);
        const top = segments.length > 1 ? segments[0] : "(root)";
        topCounts.set(top, (topCounts.get(top) ?? 0) + 1);
    }
    const total = filePaths.length || 1;
    const dominant = new Set([...topCounts.entries()]
        .filter(([, count]) => count / total >= DOMINANCE_THRESHOLD)
        .map(([seg]) => seg));
    const clusterOf = new Map();
    for (const filePath of filePaths) {
        const segments = perFileSegments.get(filePath) ?? [];
        if (segments.length <= 1) {
            clusterOf.set(filePath, "(root)");
            continue;
        }
        const top = segments[0];
        if (dominant.has(top) && segments.length > 2) {
            clusterOf.set(filePath, `${segments[0]}/${segments[1]}`);
        }
        else {
            clusterOf.set(filePath, top);
        }
    }
    return clusterOf;
}
// Tarjan SCC over the (small, directory-granularity) cluster graph — finds
// every strongly-connected component, i.e. every directory-level import cycle.
function tarjanSCCs(nodes, adjacency) {
    let index = 0;
    const indices = new Map();
    const lowlink = new Map();
    const onStack = new Set();
    const stack = [];
    const sccs = [];
    function strongConnect(v) {
        indices.set(v, index);
        lowlink.set(v, index);
        index += 1;
        stack.push(v);
        onStack.add(v);
        for (const w of adjacency.get(v) ?? []) {
            if (!indices.has(w)) {
                strongConnect(w);
                lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
            }
            else if (onStack.has(w)) {
                lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
            }
        }
        if (lowlink.get(v) === indices.get(v)) {
            const scc = [];
            let w;
            do {
                w = stack.pop();
                onStack.delete(w);
                scc.push(w);
            } while (w !== v);
            sccs.push(scc);
        }
    }
    for (const v of nodes) {
        if (!indices.has(v))
            strongConnect(v);
    }
    return sccs;
}
function computeSubsystems(graph, cwd, limit) {
    const filePaths = [...graph.fileNodes.keys()];
    const clusterOf = directoryClusters(filePaths, cwd);
    const fileNodeIdToCluster = new Map();
    for (const [filePath, nodeId] of graph.fileNodes) {
        const cluster = clusterOf.get(filePath);
        if (cluster)
            fileNodeIdToCluster.set(nodeId, cluster);
    }
    const edgeCounts = new Map(); // "from|to" -> count
    for (const edge of graph.edges) {
        if (edge.kind !== "imports")
            continue;
        const fromCluster = fileNodeIdToCluster.get(edge.from);
        const toCluster = fileNodeIdToCluster.get(edge.to);
        if (!fromCluster || !toCluster || fromCluster === toCluster)
            continue;
        const key = `${fromCluster}|${toCluster}`;
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
    const directories = [...new Set(clusterOf.values())].sort((a, b) => a.localeCompare(b));
    const edges = [...edgeCounts.entries()]
        .map(([key, count]) => {
        const [from, to] = key.split("|");
        return { from, to, count };
    })
        .sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
    // Layering violations: for each unordered pair with edges both ways, the
    // minority direction is the violation candidate (#773). Ties (equal counts,
    // genuinely ambiguous "dominant direction") are skipped rather than guessed.
    const seenPairs = new Set();
    const violations = [];
    for (const edge of edges) {
        const pairKey = [edge.from, edge.to]
            .sort((a, b) => a.localeCompare(b))
            .join("|");
        if (seenPairs.has(pairKey))
            continue;
        const reverseKey = `${edge.to}|${edge.from}`;
        const reverseCount = edgeCounts.get(reverseKey);
        if (reverseCount === undefined || reverseCount === edge.count)
            continue;
        seenPairs.add(pairKey);
        if (edge.count < reverseCount) {
            violations.push({
                from: edge.from,
                to: edge.to,
                count: edge.count,
                dominantCount: reverseCount,
            });
        }
        else {
            violations.push({
                from: edge.to,
                to: edge.from,
                count: reverseCount,
                dominantCount: edge.count,
            });
        }
    }
    violations.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
    const adjacency = new Map();
    for (const dir of directories)
        adjacency.set(dir, new Set());
    for (const edge of edges) {
        adjacency.get(edge.from)?.add(edge.to);
    }
    const sccs = tarjanSCCs(directories, adjacency).filter((scc) => scc.length > 1);
    const cycles = sccs
        .map((scc) => {
        const members = new Set(scc);
        let edgeCount = 0;
        for (const edge of edges) {
            if (members.has(edge.from) && members.has(edge.to))
                edgeCount += edge.count;
        }
        return { dirs: [...scc].sort((a, b) => a.localeCompare(b)), edgeCount };
    })
        .sort((a, b) => b.edgeCount - a.edgeCount);
    return {
        directories,
        edges: edges.slice(0, limit),
        cycles: cycles.slice(0, limit),
        violations: violations.slice(0, limit),
    };
}
// --- section 5: risk hotspots ---------------------------------------------------
function computeRiskHotspots(graph, degrees, cwd, limit, focusTerms) {
    const ranked = [...graph.fileNodes.entries()]
        .map(([filePath, fileNodeId]) => {
        const symbolIds = graph.symbolNodesByFile.get(filePath) ?? [];
        let maxComplexity = 0;
        for (const symbolId of symbolIds) {
            const complexity = graph.nodes.get(symbolId)?.metadata?.cyclomaticComplexity;
            if (typeof complexity === "number" && complexity > maxComplexity) {
                maxComplexity = complexity;
            }
        }
        const fanIn = degrees.fanIn.get(fileNodeId)?.size ?? 0;
        return { filePath, fanIn, maxComplexity, score: fanIn * maxComplexity };
    })
        .filter((f) => f.score > 0)
        .sort((a, b) => {
        const focusDelta = focusScore(a.filePath, focusTerms) - focusScore(b.filePath, focusTerms);
        if (focusDelta !== 0)
            return -focusDelta;
        return b.score - a.score || a.filePath.localeCompare(b.filePath);
    })
        .slice(0, limit);
    return ranked.map((f) => {
        const display = toDisplayPath(f.filePath, cwd);
        return {
            file: display,
            fanIn: f.fanIn,
            maxComplexity: f.maxComplexity,
            score: f.score,
            suggestedNext: suggestedNext(display),
        };
    });
}
// --- section 6: suspected dead weight --------------------------------------------
function computeDeadWeight(graph, degrees, entryPointFiles, cwd, limit) {
    const candidates = [...graph.fileNodes.entries()]
        .filter(([filePath, nodeId]) => {
        if (entryPointFiles.has(filePath))
            return false;
        const fanIn = degrees.fanIn.get(nodeId)?.size ?? 0;
        return fanIn === 0;
    })
        .map(([filePath, fileNodeId]) => ({
        filePath,
        fanOut: degrees.fanOut.get(fileNodeId)?.size ?? 0,
    }))
        // Truly-isolated files (zero fan-in AND zero fan-out) first — the
        // highest-confidence dead weight — then rising fan-out.
        .sort((a, b) => a.fanOut - b.fanOut || a.filePath.localeCompare(b.filePath))
        .slice(0, limit);
    return {
        files: candidates.map((f) => {
            const display = toDisplayPath(f.filePath, cwd);
            return { file: display, suggestedNext: suggestedNext(display) };
        }),
        disclaimer: DEAD_WEIGHT_DISCLAIMER,
    };
}
// --- cold-path background build (mirrors word-index.ts's #348 pattern) --------
const inFlightGraphBuilds = new Set();
/** Test-only: reset the in-flight-build guard between test files/cases. */
export function _resetProjectReportBuildGuardForTests() {
    inFlightGraphBuilds.clear();
}
function triggerBackgroundGraphBuild(cwd) {
    const key = normalizeMapKey(path.resolve(cwd));
    if (inFlightGraphBuilds.has(key))
        return false;
    inFlightGraphBuilds.add(key);
    void (async () => {
        try {
            const { buildOrUpdateGraph } = await import("./review-graph/builder.js");
            const { FactStore } = await import("./dispatch/fact-store.js");
            await buildOrUpdateGraph(key, [], new FactStore());
        }
        catch {
            // buildOrUpdateGraph records the durable failure and surfaced status.
        }
        finally {
            inFlightGraphBuilds.delete(key);
        }
    })();
    return true;
}
// --- entry point ---------------------------------------------------------------
/**
 * Project-level orientation report (#773), read-only over the cached review
 * graph. Returns `available: false` on a cold cache and kicks off a background
 * build (never blocking this call) — see module-level doc comment.
 */
export async function projectReport(cwd, options) {
    const limit = clampLimit(options?.limit);
    const focusTerms = normalizeFocus(options?.focus);
    const view = options?.view;
    const { getCachedReviewGraph, getReviewGraphSizeSkipVerdict, getLastReviewGraphBuildAttempt, } = await import("./review-graph/builder.js");
    let graph;
    try {
        graph = getCachedReviewGraph(cwd);
    }
    catch {
        graph = undefined;
    }
    if (!graph) {
        // #782: a fresh size-skip verdict means the graph will never build at the
        // CURRENT cap — retrying "shortly" is actively wrong guidance here, so
        // this branches before the generic cold-cache hint (and skips kicking off
        // another background build that would just re-hit the same cap).
        let sizeSkip;
        try {
            sizeSkip = getReviewGraphSizeSkipVerdict(cwd);
        }
        catch {
            sizeSkip = undefined;
        }
        if (sizeSkip) {
            const lastBuildAttempt = getLastReviewGraphBuildAttempt(cwd);
            return {
                available: false,
                hint: `review graph disabled: project has more than ${sizeSkip.maxFileCount} files ` +
                    `(cap ${sizeSkip.maxFileCount}) — raise maxProjectFiles in .pi-lens.json ` +
                    "or set PI_LENS_REVIEW_GRAPH_MAX_FILES; for CI/cron, run " +
                    "npx pi-lens build-graph after configuring the cap",
                ...(lastBuildAttempt ? { lastBuildAttempt } : {}),
                ...(view ? { view } : {}),
            };
        }
        const previousAttempt = getLastReviewGraphBuildAttempt(cwd);
        const kickedOff = triggerBackgroundGraphBuild(cwd);
        const lastBuildAttempt = previousAttempt ?? getLastReviewGraphBuildAttempt(cwd);
        return {
            available: false,
            hint: lastBuildAttempt?.outcome === "failed" ||
                lastBuildAttempt?.outcome === "skipped"
                ? `Review graph unavailable: ${lastBuildAttempt.reason ?? lastBuildAttempt.outcome}. A retry was ${kickedOff ? "started" : "not started"}.`
                : kickedOff
                    ? "No review graph cached for this workspace yet — a build was kicked off in the background; retry this call shortly."
                    : "No review graph cached for this workspace yet — the background build is still running; retry this call shortly.",
            ...(lastBuildAttempt ? { lastBuildAttempt } : {}),
            ...(view ? { view } : {}),
        };
    }
    const degrees = buildFileDegrees(graph);
    const trust = computeTrust(graph, cwd);
    const hubs = await computeHubs(graph, degrees, cwd, limit, focusTerms);
    const { entryPoints, entryPointFiles } = computeEntryPoints(graph, degrees, cwd, limit, focusTerms);
    const subsystems = computeSubsystems(graph, cwd, limit);
    const riskHotspots = computeRiskHotspots(graph, degrees, cwd, limit, focusTerms);
    const deadWeight = computeDeadWeight(graph, degrees, entryPointFiles, cwd, limit);
    const lastBuildAttempt = getLastReviewGraphBuildAttempt(cwd);
    return {
        available: true,
        ...(lastBuildAttempt ? { lastBuildAttempt } : {}),
        ...(view ? { view } : {}),
        trust,
        hubs,
        entryPoints,
        subsystems,
        riskHotspots,
        deadWeight,
    };
}
// --- compact (line-oriented text) rendering -------------------------------------
function fmtPct(n) {
    return `${Math.round(n * 100)}%`;
}
/**
 * Render a ProjectReport as line-oriented text (mirrors
 * renderCompactModuleReport's convention) — cheapest option, one line per
 * ranked item instead of a repeated-keys JSON object.
 */
export function renderCompactProjectReport(report) {
    if (!report.available) {
        return `project_report — unavailable${report.hint ? `: ${report.hint}` : ""}`;
    }
    const lines = [];
    // #919: an available graph whose persist failed serves this process fine
    // but leaves the NEXT session cold — compact view must say so, not only
    // the JSON view.
    if (report.lastBuildAttempt?.reason) {
        lines.push(`! build: ${report.lastBuildAttempt.reason}`);
    }
    const t = report.trust;
    if (t) {
        lines.push(`TRUST: built ${t.graphBuiltAt} — ${t.filesCovered}/${t.filesTotal} files (${fmtPct(t.coverage)} coverage)` +
            (t.resolution.sampleSize > 0
                ? ` — resolution: exact ${fmtPct(t.resolution.exact)}, import ${fmtPct(t.resolution.import)}, receiver-type ${fmtPct(t.resolution.receiverType)}, name-only ${fmtPct(t.resolution.nameOnly)}`
                : " — no resolution-tagged edges yet"));
        for (const note of t.notes)
            lines.push(`  ! ${note}`);
    }
    if (report.hubs?.length) {
        lines.push("HUBS:");
        for (const h of report.hubs) {
            const role = h.role ? ` — ${h.role}` : "";
            lines.push(`  ${h.file}${role}; ${h.fanIn} importer(s), blastRadius ${h.blastRadius}`);
        }
    }
    if (report.entryPoints?.length) {
        lines.push("ENTRY POINTS:");
        for (const e of report.entryPoints) {
            lines.push(`  ${e.file}; fan-out ${e.fanOut}`);
        }
    }
    if (report.subsystems) {
        const s = report.subsystems;
        lines.push(`SUBSYSTEMS: ${s.directories.length} directories, ${s.edges.length} cross-dir edge group(s)`);
        if (s.cycles.length > 0) {
            lines.push("  CYCLES:");
            for (const c of s.cycles) {
                lines.push(`    ${c.dirs.join(" <-> ")} (${c.edgeCount} edges)`);
            }
        }
        if (s.violations.length > 0) {
            lines.push("  LAYERING VIOLATIONS:");
            for (const v of s.violations) {
                lines.push(`    ${v.from} -> ${v.to} (${v.count} edge(s), against the dominant ${v.to} -> ${v.from} direction, ${v.dominantCount} edge(s))`);
            }
        }
    }
    if (report.riskHotspots?.length) {
        lines.push("RISK HOTSPOTS:");
        for (const r of report.riskHotspots) {
            lines.push(`  ${r.file}; fan-in ${r.fanIn} × max complexity ${r.maxComplexity} = ${r.score}`);
        }
    }
    if (report.deadWeight) {
        lines.push(`DEAD WEIGHT (${report.deadWeight.disclaimer}):`);
        for (const d of report.deadWeight.files) {
            lines.push(`  ${d.file}`);
        }
        if (report.deadWeight.files.length === 0)
            lines.push("  (none found)");
    }
    return lines.join("\n");
}
