export const errorSwallowingRule = {
    id: "error-swallowing",
    requires: ["file.tryCatchSummaries"],
    appliesTo(ctx) {
        return /\.tsx?$/.test(ctx.filePath);
    },
    evaluate(ctx, store) {
        const summaries = store.getFileFact(ctx.filePath, "file.tryCatchSummaries");
        if (!summaries)
            return [];
        const diagnostics = [];
        for (const s of summaries) {
            if (s.isEmpty && !s.isDocumentedLocalFallback && s.boundaryCategory !== "fs") {
                diagnostics.push({
                    id: `error-swallowing:${ctx.filePath}:${s.line}:${s.column}`,
                    tool: "fact-rules",
                    rule: "error-swallowing",
                    filePath: ctx.filePath,
                    line: s.line,
                    column: s.column,
                    severity: "error",
                    semantic: "blocking",
                    message: `Empty catch block silently swallows errors`,
                });
            }
        }
        return diagnostics;
    },
};
