/**
 * Declarative Tool Dispatcher for pi-lens
 *
 * Redesigned to handle the full complexity of pi-lens's tool_result handler:
 * - Multiple tools with different semantics (blocking, warning, silent)
 * - Delta mode (baseline tracking)
 * - Autofix handling
 * - Output aggregation and formatting
 *
 * Key abstractions:
 * - RunnerDefinition: A tool that can be run
 * - Diagnostic: Structured issue representation
 * - OutputSemantic: How to display (blocking, warning, silent, etc.)
 * - BaselineStore: Track pre-existing issues for delta mode
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { recordRunner } from "../widget-state.js";
import { detectFileKind } from "../file-kinds.js";
import { detectFileRole } from "../file-role.js";
import { isTestFile } from "../file-utils.js";
import { getPrimaryDispatchGroup } from "../language-policy.js";
import { resolveLanguageRootForFile } from "../language-profile.js";
import { logLatency } from "../latency-logger.js";
import { normalizeMapKey } from "../path-utils.js";
import { loadPiLensProjectConfig } from "../project-lens-config.js";
import { RUNTIME_CONFIG, getRunnerTimeoutFloorMs } from "../runtime-config.js";
import { safeSpawnAsync } from "../safe-spawn.js";
import { classifyDiagnostic } from "./diagnostic-taxonomy.js";
import { applyDispositions } from "../diagnostic-dispositions.js";
import { applyInlineSuppressions } from "./inline-suppressions.js";
import { getToolPlan } from "./plan.js";
import { resolveRunnerPath } from "./runner-context.js";
import { getToolProfile } from "./tool-profile.js";
import { formatDiagnostics } from "./utils/format-utils.js";
// --- Runner Registry ---
export class RunnerRegistry {
    runners = new Map();
    register(runner) {
        if (this.runners.has(runner.id))
            return;
        this.runners.set(runner.id, runner);
    }
    get(id) {
        return this.runners.get(id);
    }
    getForKind(kind, filePath) {
        const matching = [];
        const isTest = filePath ? isTestFile(filePath) : false;
        for (const runner of this.runners.values()) {
            if (isTest && runner.skipTestFiles)
                continue;
            if (runner.appliesTo.includes(kind) || runner.appliesTo.length === 0) {
                matching.push(runner);
            }
        }
        return matching.sort((a, b) => a.priority - b.priority);
    }
    list() {
        return Array.from(this.runners.values());
    }
    clear() {
        this.runners.clear();
    }
}
// --- Tool Availability Cache ---
/**
 * Normalize a command name to a FactStore session key.
 * Strips .cmd/.exe suffixes (case-insensitive) and lowercases,
 * then prefixes with "session.toolCache.".
 */
export function normalizeCacheKey(cmd) {
    const normalized = cmd.replace(/\.(cmd|exe)$/i, "").toLowerCase();
    return `session.toolCache.${normalized}`;
}
async function checkToolAvailability(command, facts) {
    const key = normalizeCacheKey(command);
    const cached = facts.getSessionFact(key);
    if (cached !== undefined) {
        return cached;
    }
    try {
        const result = await safeSpawnAsync(command, ["--version"], {
            timeout: 5000,
        });
        const available = result.status === 0;
        facts.setSessionFact(key, available);
        return available;
    }
    catch {
        facts.setSessionFact(key, false);
        return false;
    }
}
// --- Dispatch Context Factory ---
function readFilePrefix(filePath, maxBytes = 4096) {
    let fd;
    try {
        fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(maxBytes);
        const bytesRead = fs.readSync(fd, buffer, 0, maxBytes, 0);
        return buffer.subarray(0, bytesRead).toString("utf8");
    }
    catch {
        return undefined;
    }
    finally {
        if (fd !== undefined) {
            try {
                fs.closeSync(fd);
            }
            catch {
                // ignore close errors
            }
        }
    }
}
export function createDispatchContext(filePath, cwd, pi, facts, blockingOnly, modifiedRanges) {
    const absoluteFilePath = resolveRunnerPath(cwd, filePath);
    const normalizedProjectRoot = normalizeMapKey(path.resolve(cwd));
    const normalizedCwd = normalizeMapKey(resolveLanguageRootForFile(absoluteFilePath, cwd));
    const normalizedFilePath = normalizeMapKey(absoluteFilePath);
    const kind = detectFileKind(normalizedFilePath);
    const fileRole = detectFileRole(normalizedFilePath, readFilePrefix(normalizedFilePath));
    const projectConfig = loadPiLensProjectConfig(normalizedCwd);
    return {
        filePath: normalizedFilePath,
        projectRoot: normalizedProjectRoot,
        cwd: normalizedCwd,
        kind,
        fileRole,
        pi,
        autofix: false,
        deltaMode: !pi.getFlag("no-delta"),
        facts,
        projectConfig,
        blockingOnly,
        modifiedRanges,
        async hasTool(command) {
            return checkToolAvailability(command, facts);
        },
        log(message) {
            console.error(`[dispatch] ${message}`);
        },
    };
}
// --- Delta Mode Logic ---
/**
 * Filter diagnostics to only show NEW issues (delta mode)
 */
function filterDelta(after, before, keyFn) {
    const beforeSet = new Set((before ?? []).map(keyFn));
    const afterSet = new Set(after.map(keyFn));
    const fixed = (before ?? []).filter((d) => !afterSet.has(keyFn(d)));
    const newItems = after.filter((d) => !beforeSet.has(keyFn(d)));
    return { new: newItems, fixed };
}
function semanticRank(semantic) {
    if (semantic === "blocking")
        return 4;
    if (semantic === "warning")
        return 3;
    if (semantic === "fixed")
        return 2;
    if (semantic === "silent")
        return 1;
    return 0;
}
function toolPriority(tool, defectClass) {
    return getToolProfile(tool, defectClass).dedupPriority;
}
function dedupeOverlappingDiagnostics(diagnostics) {
    const byKey = new Map();
    for (const d of diagnostics) {
        const defectClass = d.defectClass ?? classifyDiagnostic(d);
        const line = d.line ?? 1;
        const column = d.column ?? 1;
        const ruleKey = d.rule || d.id || "unknown";
        const key = `${d.filePath}:${line}:${column}:${defectClass}:${ruleKey}`;
        const current = byKey.get(key);
        if (!current) {
            byKey.set(key, { ...d, defectClass });
            continue;
        }
        const currScore = semanticRank(current.semantic) * 100 +
            toolPriority(current.tool, defectClass);
        const nextScore = semanticRank(d.semantic) * 100 + toolPriority(d.tool, defectClass);
        if (nextScore > currScore) {
            byKey.set(key, { ...d, defectClass });
        }
    }
    return [...byKey.values()];
}
function suppressLintOverlapsWithLsp(diagnostics) {
    const lspBySpanClass = new Set();
    const lspByLine = new Set();
    const isLintTool = (tool) => {
        return getToolProfile(tool).lintLike;
    };
    for (const d of diagnostics) {
        if (d.tool !== "lsp")
            continue;
        const line = d.line ?? 1;
        const defectClass = d.defectClass ?? classifyDiagnostic(d);
        lspBySpanClass.add(`${d.filePath}:${line}:${defectClass}`);
        lspByLine.add(`${d.filePath}:${line}`);
    }
    if (lspByLine.size === 0)
        return diagnostics;
    return diagnostics.filter((d) => {
        if (d.tool === "lsp")
            return true;
        if (!isLintTool(d.tool))
            return true;
        if (d.semantic === "blocking" || d.severity === "error")
            return true;
        const line = d.line ?? 1;
        const defectClass = d.defectClass ?? classifyDiagnostic(d);
        const key = `${d.filePath}:${line}:${defectClass}`;
        if (lspBySpanClass.has(key))
            return false;
        // Conservative fallback for unclassified overlap at same line.
        if (defectClass === "unknown") {
            return !lspByLine.has(`${d.filePath}:${line}`);
        }
        return true;
    });
}
/**
 * Dockerfile overlap dedup (#131 Mode 2): hadolint and `trivy config` both flag
 * a few of the same Dockerfile issues (e.g. `:latest`, running as root) with
 * different rule ids, which the rule-keyed `dedupeOverlappingDiagnostics` can't
 * collapse. Keep hadolint authoritative on the lines it covers and drop the
 * trivy-config finding there — trivy still contributes the security checks
 * hadolint lacks (on other lines), and all Kubernetes findings (no hadolint
 * diagnostics exist for YAML, so none are suppressed). Exported for unit tests.
 */
export function suppressTrivyConfigDockerOverlap(diagnostics) {
    const hadolintLines = new Set();
    for (const d of diagnostics) {
        if (d.tool === "hadolint") {
            hadolintLines.add(`${d.filePath}:${d.line ?? 1}`);
        }
    }
    if (hadolintLines.size === 0)
        return diagnostics;
    return diagnostics.filter((d) => d.tool !== "trivy-config" ||
        !hadolintLines.has(`${d.filePath}:${d.line ?? 1}`));
}
function isUnusedValueDiagnostic(d) {
    const raw = `${d.id ?? ""} ${d.rule ?? ""} ${d.message ?? ""}`.toLowerCase();
    if (raw.includes("no-unused"))
        return true;
    if (/\b(6133|6192|6196)\b/.test(raw))
        return true;
    const rule = String(d.rule ?? "").toLowerCase();
    if (rule.includes("unused"))
        return true;
    const message = d.message.toLowerCase();
    return (message.includes("is declared but its value is never read") ||
        message.includes("is assigned a value but never used") ||
        message.includes("declared but never used") ||
        message.includes("unused"));
}
function promoteDeltaUnusedToBlockers(diagnostics) {
    return diagnostics.map((d) => {
        if (!isUnusedValueDiagnostic(d))
            return d;
        if (d.semantic === "blocking" || d.severity === "error")
            return d;
        return {
            ...d,
            severity: "error",
            semantic: "blocking",
            fixSuggestion: d.fixSuggestion ??
                "Remove the unused declaration or rename with '_' prefix if intentionally unused.",
        };
    });
}
function buildCoverageNotice(ctx, runnerLatencies) {
    if (!ctx.kind)
        return undefined;
    const lspEnabled = !ctx.pi.getFlag("no-lsp");
    const primary = getPrimaryDispatchGroup(ctx.kind, lspEnabled);
    if (!primary || primary.runnerIds.length === 0)
        return undefined;
    const relevant = runnerLatencies.filter((r) => primary.runnerIds.includes(r.runnerId));
    if (relevant.length === 0)
        return undefined;
    // Check primary runners first
    const primaryHasCoverage = relevant.some((r) => r.status === "succeeded" || r.status === "failed");
    if (primaryHasCoverage)
        return undefined;
    const allPrimarySkipped = relevant.every((r) => r.status === "skipped" || r.status === "when_skipped");
    if (!allPrimarySkipped)
        return undefined;
    const plan = getToolPlan(ctx.kind);
    const fallbackRunnerIds = new Set((plan?.groups ?? [])
        .filter((group) => !group.runnerIds.every((runnerId) => primary.runnerIds.includes(runnerId)))
        .flatMap((group) => group.runnerIds)
        .filter((runnerId) => !primary.runnerIds.includes(runnerId)));
    // Structural-only runners (tree-sitter, ast-grep) are not substitutes
    // for real linters — don't suppress the notice if only they ran.
    const STRUCTURAL_RUNNERS = new Set([
        "tree-sitter",
        "ast-grep-napi",
        "spellcheck",
        "fact-rules",
        "opengrep",
    ]);
    const anyLinterHasCoverage = runnerLatencies.some((r) => fallbackRunnerIds.has(r.runnerId) &&
        !STRUCTURAL_RUNNERS.has(r.runnerId) &&
        (r.status === "succeeded" || r.status === "failed"));
    if (anyLinterHasCoverage)
        return undefined;
    const onceKey = `${ctx.kind}:${normalizeMapKey(ctx.filePath)}`;
    if (coverageNoticeSeen.has(onceKey))
        return undefined;
    coverageNoticeSeen.add(onceKey);
    return {
        id: `coverage-unavailable:${ctx.kind}:${path.basename(ctx.filePath)}`,
        message: `Pi-lens ${ctx.kind} analysis unavailable — language tools are missing or the LSP server isn't ready yet, so this file was not fully checked (not a clean result).`,
        filePath: ctx.filePath,
        severity: "warning",
        semantic: "warning",
        tool: "pi-lens",
    };
}
const latencyReports = [];
const coverageNoticeSeen = new Set();
export function getLatencyReports() {
    return [...latencyReports];
}
export function clearLatencyReports() {
    latencyReports.length = 0;
}
export function clearCoverageNoticeState() {
    coverageNoticeSeen.clear();
}
export function formatLatencyReport(report) {
    const lines = [];
    lines.push(`\n═══════════════════════════════════════════════════════════════`);
    lines.push(`📊 DISPATCH LATENCY REPORT: ${report.filePath.split("/").pop()}`);
    lines.push(`   Kind: ${report.fileKind || "unknown"} | Total: ${report.totalDurationMs}ms`);
    lines.push(`───────────────────────────────────────────────────────────────`);
    lines.push(`Runner                          Duration  Status    Issues  Semantic`);
    lines.push(`───────────────────────────────────────────────────────────────`);
    for (const r of report.runners) {
        const name = r.runnerId.padEnd(30);
        const dur = `${r.durationMs}ms`.padStart(8);
        const status = r.status.padStart(9);
        const issues = String(r.diagnosticCount).padStart(6);
        const sem = r.semantic.padStart(8);
        const slowMarker = r.durationMs > 500 ? " 🔥" : r.durationMs > 100 ? " ⚡" : "";
        lines.push(`${name}${dur}${status}${issues}${sem}${slowMarker}`);
    }
    lines.push(`───────────────────────────────────────────────────────────────`);
    lines.push(`Total: ${report.runners.length} runners | Stopped early: ${report.stoppedEarly}`);
    lines.push(`Diagnostics: ${report.totalDiagnostics} (${report.blockers} blockers, ${report.warnings} warnings)`);
    // Show top 3 slowest
    const sorted = [...report.runners].sort((a, b) => b.durationMs - a.durationMs);
    if (sorted.length > 0 && sorted[0].durationMs > 100) {
        lines.push(`\n🐌 Slowest runners:`);
        for (const r of sorted.slice(0, 3)) {
            if (r.durationMs > 50) {
                lines.push(`   ${r.runnerId}: ${r.durationMs}ms (${r.status})`);
            }
        }
    }
    lines.push(`═══════════════════════════════════════════════════════════════`);
    return lines.join("\n");
}
/**
 * Execute all runners in a single group.
 *
 * - mode "fallback": run runners sequentially and stop at the first
 *   one that succeeds (returns status !== "skipped").
 * - mode "all" (default): run all runners in the group sequentially
 *   and collect every diagnostic.
 *
 * Groups themselves are run in parallel by dispatchForFile, so this
 * function must NOT mutate shared state.
 */
async function runGroup(ctx, group, registry, onRunnerResult) {
    const diagnostics = [];
    const latencies = [];
    let hadBlocker = false;
    // Filter runners by kind if specified
    const runnerIds = group.filterKinds
        ? group.runnerIds.filter((id) => {
            const runner = registry.get(id);
            return runner && ctx.kind && group.filterKinds?.includes(ctx.kind);
        })
        : group.runnerIds;
    const semantic = group.semantic ?? "warning";
    for (const runnerId of runnerIds) {
        const runnerStart = Date.now();
        const runner = registry.get(runnerId);
        if (!runner) {
            latencies.push({
                runnerId,
                startTime: runnerStart,
                endTime: Date.now(),
                durationMs: 0,
                status: "skipped",
                diagnosticCount: 0,
                semantic: "unknown",
            });
            logLatency({
                type: "runner",
                filePath: ctx.filePath,
                runnerId,
                durationMs: 0,
                status: "not_registered",
                diagnosticCount: 0,
                semantic: "unknown",
            });
            continue;
        }
        // Check preconditions
        let shouldRun = true;
        if (runner.when) {
            try {
                shouldRun = await runner.when(ctx);
            }
            catch (error) {
                ctx.log(`Runner ${runner.id} precondition failed: ${error}`);
                shouldRun = false;
            }
        }
        if (!shouldRun) {
            latencies.push({
                runnerId,
                startTime: runnerStart,
                endTime: Date.now(),
                durationMs: Date.now() - runnerStart,
                status: "when_skipped",
                diagnosticCount: 0,
                semantic: runner.id,
            });
            logLatency({
                type: "runner",
                filePath: ctx.filePath,
                runnerId,
                durationMs: 0,
                status: "when_skipped",
                diagnosticCount: 0,
                semantic: "when_condition",
            });
            continue;
        }
        const result = await runRunner(ctx, runner, semantic);
        onRunnerResult?.(runnerId, result);
        const runnerEnd = Date.now();
        const duration = runnerEnd - runnerStart;
        latencies.push({
            runnerId,
            startTime: runnerStart,
            endTime: runnerEnd,
            durationMs: duration,
            status: result.status,
            diagnosticCount: result.diagnostics.length,
            semantic: result.semantic ?? semantic,
        });
        logLatency({
            type: "runner",
            filePath: ctx.filePath,
            runnerId,
            startedAt: new Date(runnerStart).toISOString(),
            durationMs: duration,
            status: result.status,
            diagnosticCount: result.diagnostics.length,
            semantic: result.semantic ?? semantic,
            diagnostics: result.diagnostics.length > 0
                ? result.diagnostics.map((d) => ({
                    rule: d.rule,
                    message: d.message.slice(0, 120),
                    line: d.line,
                    semantic: d.semantic,
                }))
                : undefined,
            metadata: result.status === "failed" && result.failureKind
                ? {
                    failureKind: result.failureKind,
                    failureMessage: result.failureMessage,
                }
                : undefined,
        });
        recordRunner(ctx.filePath, runnerId, result.status, result.diagnostics.length, duration);
        diagnostics.push(...result.diagnostics);
        const resultSemantic = result.semantic ?? semantic;
        if ((resultSemantic === "blocking" && result.diagnostics.length > 0) ||
            result.diagnostics.some((d) => d.semantic === "blocking")) {
            hadBlocker = true;
        }
        // mode:"fallback" — stop at first successful runner
        if (group.mode === "fallback" && result.status === "succeeded") {
            break;
        }
    }
    return { diagnostics, latencies, hadBlocker };
}
// --- Main Dispatch Function ---
export async function dispatchForFile(ctx, groups, registry, onRunnerResult) {
    const _overallStart = Date.now();
    if (ctx.fileRole === "generated") {
        return {
            diagnostics: [],
            blockers: [],
            warnings: [],
            baselineWarningCount: 0,
            fixed: [],
            resolvedCount: 0,
            output: "",
            blockerOutput: "",
            hasBlockers: false,
        };
    }
    const allDiagnostics = [];
    let stopped = false;
    const runnerLatencies = [];
    // Debug logging goes to latency log only (not console - avoid noise)
    const allRunnerIds = groups.flatMap((g) => g.runnerIds);
    logLatency({
        type: "phase",
        filePath: ctx.filePath,
        phase: "dispatch_start",
        durationMs: 0,
        metadata: {
            groupCount: groups.length,
            kind: ctx.kind,
            runners: allRunnerIds.join(","),
        },
    });
    // Run all groups in parallel — they are independent and don't depend on
    // each other's results. Within each group, mode:"fallback" semantics are
    // preserved (sequential first-success). Results are merged in original
    // group order so output is deterministic.
    const groupResults = await Promise.all(groups.map((group) => runGroup(ctx, group, registry, onRunnerResult)));
    // Count baseline warnings before filtering (for delta count display)
    const relativeKey = path.relative(ctx.cwd, ctx.filePath).replace(/\\/g, "/");
    const baselineAbsKey = `session.baseline.${normalizeMapKey(ctx.filePath)}`;
    const baselineRelKey = `session.baseline.${normalizeMapKey(relativeKey)}`;
    const previousBaseline = ctx.deltaMode
        ? (ctx.facts.getSessionFact(baselineAbsKey) ??
            ctx.facts.getSessionFact(baselineRelKey))
        : undefined;
    const baselineWarnings = previousBaseline?.filter((d) => d.semantic === "warning" || d.semantic === "none");
    const baselineWarningCount = baselineWarnings?.length ?? 0;
    for (const { diagnostics: groupDiags, latencies, hadBlocker, } of groupResults) {
        runnerLatencies.push(...latencies);
        allDiagnostics.push(...groupDiags);
        if (hadBlocker)
            stopped = true;
    }
    // Apply delta mode ONCE across the full diagnostic set.
    // This avoids partial-baseline corruption when processing multiple groups.
    const dedupedDiagnostics = dedupeOverlappingDiagnostics(allDiagnostics);
    const dockerOverlapSuppressed = suppressTrivyConfigDockerOverlap(dedupedDiagnostics);
    const overlapSuppressed = suppressLintOverlapsWithLsp(dockerOverlapSuppressed);
    const fileContent = ctx.facts.getFileFact(ctx.filePath, "file.content") ?? "";
    const inlineSuppressed = applyInlineSuppressions(overlapSuppressed, fileContent);
    // #690: agent/user disposition layer — drop false-positive/suppress marks
    // and anything deferred this session. flagged marks are left in place;
    // lens_diagnostics tags them at render time via the same anchor.
    const dispositionFiltered = applyDispositions(inlineSuppressed, ctx.cwd, ctx.filePath, fileContent);
    let visibleDiagnostics = dispositionFiltered;
    let resolvedCount = 0;
    if (ctx.deltaMode && previousBaseline) {
        const filtered = filterDelta(visibleDiagnostics, previousBaseline, (d) => d.id);
        visibleDiagnostics = promoteDeltaUnusedToBlockers(filtered.new);
        resolvedCount = filtered.fixed.length;
    }
    // Persist full current snapshot for next run (not delta-filtered subset).
    if (ctx.deltaMode) {
        ctx.facts.setSessionFact(baselineAbsKey, [...dedupedDiagnostics]);
        ctx.facts.setSessionFact(baselineRelKey, [...dedupedDiagnostics]);
    }
    // Categorize results
    const blockers = visibleDiagnostics.filter((d) => d.semantic === "blocking");
    const warnings = visibleDiagnostics.filter((d) => d.semantic === "warning" || d.semantic === "none");
    const fixedItems = visibleDiagnostics.filter((d) => d.semantic === "fixed");
    // Append fixed and fixable diagnostics to the persistent worklog
    if (fixedItems.length > 0) {
        import("../fix-worklog.js")
            .then(({ appendToWorklog }) => {
            appendToWorklog(ctx.cwd, fixedItems, true);
        })
            .catch(() => { });
    }
    const fixableWarnings = warnings.filter((d) => d.fixable);
    if (fixableWarnings.length > 0) {
        import("../fix-worklog.js")
            .then(({ appendToWorklog }) => {
            appendToWorklog(ctx.cwd, fixableWarnings, false);
        })
            .catch(() => { });
    }
    const inlineBlockers = blockers;
    const inlineFixed = fixedItems;
    const coverageNotice = buildCoverageNotice(ctx, runnerLatencies);
    // Format output — only blocking issues shown inline
    // Warnings tracked but not shown (noise) — surfaced via lens_diagnostics
    const blockerOutput = formatDiagnostics(inlineBlockers, "blocking");
    let output = blockerOutput;
    output += formatDiagnostics(inlineFixed, "fixed");
    if (coverageNotice) {
        output += formatDiagnostics([coverageNotice], "warning", 1);
        warnings.push(coverageNotice);
    }
    // Generate and store latency report
    const overallEnd = Date.now();
    const latencyReport = {
        filePath: ctx.filePath,
        fileKind: ctx.kind,
        overallStartMs: _overallStart,
        overallEndMs: overallEnd,
        totalDurationMs: overallEnd - _overallStart,
        runners: runnerLatencies,
        stoppedEarly: stopped,
        totalDiagnostics: visibleDiagnostics.length,
        blockers: blockers.length,
        warnings: warnings.length,
    };
    // Store for later analysis
    latencyReports.push(latencyReport);
    // Keep only last 100 reports to prevent memory bloat
    if (latencyReports.length > 100) {
        latencyReports.shift();
    }
    // Runner latencies already logged immediately after execution (line ~329)
    // The runnerLatencies array is stored in latencyReport for aggregate analysis
    // No need to log again here - would create duplicates in the log
    // Log summary to latency log only (not console - avoid noise)
    const sumMs = runnerLatencies.reduce((s, r) => s + r.durationMs, 0);
    const wallClockMs = latencyReport.totalDurationMs;
    logLatency({
        type: "tool_result",
        filePath: ctx.filePath,
        durationMs: wallClockMs,
        wallClockMs,
        sumMs,
        parallelGainMs: Math.max(0, sumMs - wallClockMs),
        result: "dispatch_complete",
        metadata: {
            runners: runnerLatencies.map((r) => ({
                id: r.runnerId,
                startedAt: new Date(r.startTime).toISOString(),
                duration: r.durationMs,
                status: r.status,
            })),
            totalDiagnostics: visibleDiagnostics.length,
            blockers: blockers.length,
        },
    });
    return {
        diagnostics: visibleDiagnostics,
        blockers,
        warnings,
        baselineWarningCount,
        fixed: fixedItems,
        resolvedCount,
        output,
        blockerOutput,
        hasBlockers: blockers.length > 0,
    };
}
// --- Run Single Runner ---
/** Maximum wall-clock time a single runner may take before we abort it. */
const RUNNER_TIMEOUT_MS = RUNTIME_CONFIG.dispatch.runnerTimeoutMs;
function looksLikeDiagnosticCodePath(value) {
    if (!value)
        return false;
    const text = value.trim();
    if (!text)
        return false;
    const base = path.basename(text.replace(/\\/g, "/"));
    if (/^lsp:\d+(?::\d+)?$/i.test(text) || /^lsp:\d+(?::\d+)?$/i.test(base)) {
        return true;
    }
    if (/^similarity[-:]/i.test(text) || /^similarity[-:]/i.test(base)) {
        return true;
    }
    if (/^[a-z-]+:\d+(?::\d+)?$/i.test(text) ||
        /^[a-z-]+:\d+(?::\d+)?$/i.test(base)) {
        return true;
    }
    return false;
}
function normalizeDiagnosticFilePath(ctx, rawPath) {
    if (typeof rawPath === "string" && looksLikeDiagnosticCodePath(rawPath)) {
        ctx.log(`runner path normalization: ignored diagnostic code-like path '${rawPath}', using current file`);
        return resolveRunnerPath(ctx.cwd, ctx.filePath);
    }
    return resolveRunnerPath(ctx.cwd, rawPath || ctx.filePath);
}
async function runRunner(ctx, runner, defaultSemantic) {
    const timeoutMs = Math.max(runner.timeoutMs ?? RUNNER_TIMEOUT_MS, getRunnerTimeoutFloorMs());
    let timer;
    try {
        const result = await Promise.race([
            runner.run(ctx).finally(() => clearTimeout(timer)),
            new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error(`Runner ${runner.id} timed out after ${timeoutMs}ms`)), timeoutMs);
            }),
        ]);
        const diagnostics = result.diagnostics.map((d) => ({
            ...d,
            filePath: normalizeDiagnosticFilePath(ctx, d.filePath),
        }));
        return {
            ...result,
            diagnostics,
            semantic: result.semantic ?? defaultSemantic,
        };
    }
    catch (error) {
        clearTimeout(timer);
        ctx.log(`Runner ${runner.id} failed: ${error}`);
        const message = error instanceof Error ? error.message : String(error);
        return {
            status: "failed",
            diagnostics: [],
            semantic: defaultSemantic,
            failureKind: message.includes("timed out") ? "timeout" : "exception",
            failureMessage: message.slice(0, 200),
        };
    }
}
// --- Simple Integration Helper ---
/**
 * @internal
 * Low-level dispatch entry point. Use `dispatchLint` from `./integration.js` instead —
 * that version provides session-persistent baselines and FactStore.
 * This function creates an ephemeral FactStore per call; facts do not persist across calls.
 */
export async function dispatchLint(filePath, cwd, pi, facts, registry) {
    // By default, only run BLOCKING rules for fast feedback on file write
    const ctx = createDispatchContext(filePath, cwd, pi, facts, true);
    // Get runners for this file kind
    if (!ctx.kind)
        return "";
    const runners = registry.getForKind(ctx.kind, ctx.filePath);
    if (runners.length === 0) {
        return "";
    }
    // Create groups from registered runners (all in fallback mode)
    const groups = [
        {
            mode: "fallback",
            runnerIds: runners.map((r) => r.id),
        },
    ];
    const result = await dispatchForFile(ctx, groups, registry);
    return result.output;
}
