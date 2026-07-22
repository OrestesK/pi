/**
 * Diagnostic Tracker — in-memory tracking for session-level feedback
 *
 * Links diagnostics to resolutions, tracks violation patterns.
 */
// Module-level singleton — persists across all writes
let _tracker = null;
export function getDiagnosticTracker() {
    if (!_tracker) {
        _tracker = createDiagnosticTracker();
    }
    return _tracker;
}
export function createDiagnosticTracker() {
    const shown = new Map();
    const occurrenceCounts = new Map();
    let totalShown = 0;
    let totalAutoFixed = 0;
    let totalAgentFixed = 0;
    const key = (filePath, ruleId, line) => `${filePath}:${ruleId}:${line}`;
    return {
        trackShown(diagnostics) {
            for (const d of diagnostics) {
                const ruleId = d.rule || d.id || "unknown";
                const line = d.line || 1;
                const k = key(d.filePath, ruleId, line);
                occurrenceCounts.set(k, (occurrenceCounts.get(k) ?? 0) + 1);
                // Don't double-count if already tracked
                if (!shown.has(k)) {
                    shown.set(k, {
                        ruleId,
                        filePath: d.filePath,
                        line,
                        shownAt: new Date(),
                        autoFixed: false,
                        agentFixed: false,
                    });
                    totalShown++;
                }
            }
        },
        trackAutoFixed(count) {
            if (count > 0) {
                totalAutoFixed += count;
            }
        },
        trackAgentFixed(count) {
            if (count > 0) {
                totalAgentFixed += count;
            }
        },
        getStats() {
            const ruleCounts = new Map();
            const rulePaths = new Map();
            for (const entry of shown.values()) {
                ruleCounts.set(entry.ruleId, (ruleCounts.get(entry.ruleId) || 0) + 1);
                if (!rulePaths.has(entry.ruleId))
                    rulePaths.set(entry.ruleId, new Set());
                rulePaths.get(entry.ruleId)?.add(entry.filePath);
            }
            const topViolations = [...ruleCounts.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([ruleId, count]) => ({
                ruleId,
                count,
                samplePaths: [...(rulePaths.get(ruleId) ?? new Set())]
                    .sort((a, b) => a.localeCompare(b))
                    .slice(0, 3),
            }));
            const repeatOffenders = [...occurrenceCounts.entries()]
                .filter(([, count]) => count >= 2)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([k, count]) => {
                const parts = k.split(":");
                const lineStr = parts.pop() ?? "1";
                const ruleId = parts.pop() ?? "unknown";
                const filePath = parts.join(":");
                return {
                    key: k,
                    ruleId,
                    filePath,
                    line: Number.parseInt(lineStr, 10) || 1,
                    count,
                };
            });
            return {
                totalShown,
                totalAutoFixed,
                totalAgentFixed,
                totalUnresolved: totalShown - totalAutoFixed - totalAgentFixed,
                topViolations,
                repeatOffenders,
            };
        },
        reset() {
            shown.clear();
            occurrenceCounts.clear();
            totalShown = 0;
            totalAutoFixed = 0;
            totalAgentFixed = 0;
        },
    };
}
