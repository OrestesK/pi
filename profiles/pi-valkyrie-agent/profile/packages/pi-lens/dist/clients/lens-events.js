export const LENS_EVENT_VERSION = 1;
export const LENS_EVENT_NAMES = {
    analysisComplete: "pi-lens/analysis-complete",
    findings: "pi-lens/findings",
    turnFindings: "pi-lens/turn-findings",
};
let lensEventBus;
export function initLensEvents(pi) {
    lensEventBus = pi.events;
}
function truncateText(value, maxChars) {
    if (value === undefined)
        return undefined;
    if (value.length <= maxChars)
        return value;
    return `${value.slice(0, maxChars)}…`;
}
function normalizeDiagnostic(diagnostic) {
    return {
        ...diagnostic,
        message: truncateText(diagnostic.message, 1_000) ?? "",
        matchedText: truncateText(diagnostic.matchedText, 500),
        fixSuggestion: truncateText(diagnostic.fixSuggestion, 500),
    };
}
function normalizeDiagnostics(diagnostics) {
    return diagnostics.map(normalizeDiagnostic);
}
function emitLensEvent(eventName, payload) {
    const emit = lensEventBus?.emit;
    if (!emit)
        return;
    setImmediate(() => {
        try {
            emit.call(lensEventBus, eventName, payload);
        }
        catch {
            // Inter-extension events are observational. A listener must never break
            // the pi-lens hook path or delay agent progress with error handling noise.
        }
    });
}
export function emitLensAnalysisComplete(payload) {
    const normalized = {
        version: LENS_EVENT_VERSION,
        source: "pi-lens",
        timestamp: new Date().toISOString(),
        ...payload,
        diagnostics: normalizeDiagnostics(payload.diagnostics),
        blockers: normalizeDiagnostics(payload.blockers),
        warnings: normalizeDiagnostics(payload.warnings),
        fixed: normalizeDiagnostics(payload.fixed),
    };
    emitLensEvent(LENS_EVENT_NAMES.analysisComplete, normalized);
    if (normalized.diagnostics.length > 0 ||
        normalized.blockers.length > 0 ||
        normalized.warnings.length > 0 ||
        normalized.fixed.length > 0) {
        emitLensEvent(LENS_EVENT_NAMES.findings, normalized);
    }
}
export function emitLensTurnFindings(payload) {
    emitLensEvent(LENS_EVENT_NAMES.turnFindings, {
        version: LENS_EVENT_VERSION,
        source: "pi-lens",
        timestamp: new Date().toISOString(),
        ...payload,
        content: truncateText(payload.content, 8_000) ?? "",
    });
}
