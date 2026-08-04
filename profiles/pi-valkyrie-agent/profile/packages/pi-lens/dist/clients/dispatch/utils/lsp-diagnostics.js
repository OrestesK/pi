export function convertLspDiagnostics(diags, filePath, options = {}) {
    const tool = options.tool ?? "lsp";
    return diags
        .filter((d) => d.range?.start?.line !== undefined)
        .map((d, idx) => {
        const severityMap = { 1: "error", 2: "warning", 4: "hint" };
        const severity = severityMap[d.severity] ?? "info";
        const semantic = d.severity === 1 ? "blocking" : (d.severity === 2 ? "warning" : "none");
        const code = String(d.code ?? "unknown");
        // #692: identity ALWAYS derives from the diagnostic's own source — never
        // from a caller-supplied scan label (see `scanOrigin`'s doc comment above).
        const source = d.source ?? tool;
        const hasSuggestion = options.fixSuggestionByIndex?.has(idx) ?? false;
        return {
            id: `${tool}:${code}:${d.range.start.line}`,
            message: d.message,
            filePath,
            line: d.range.start.line + 1,
            column: d.range.start.character + 1,
            severity,
            semantic,
            tool,
            rule: `${source}:${code}`,
            fixable: hasSuggestion,
            autoFixAvailable: false,
            fixKind: hasSuggestion ? "suggestion" : undefined,
            fixSuggestion: options.fixSuggestionByIndex?.get(idx),
            scanOrigin: options.scanOrigin,
        };
    });
}
