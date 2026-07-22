import { isTestFile } from "../../file-utils.js";
const ALIAS_COMMENT_RE = /\b(alias|backward\s*compat|backwards\s*compat|compatibility|shim|adapter)\b/i;
function hasAliasCommentNear(line, comments) {
    return comments.some((comment) => comment.line >= line - 2 && comment.line <= line && ALIAS_COMMENT_RE.test(comment.text));
}
export const passThroughWrappersRule = {
    id: "pass-through-wrappers",
    requires: ["file.functionSummaries", "file.comments"],
    appliesTo(ctx) {
        return /\.tsx?$/.test(ctx.filePath) && !isTestFile(ctx.filePath);
    },
    evaluate(ctx, store) {
        const summaries = store.getFileFact(ctx.filePath, "file.functionSummaries");
        const comments = store.getFileFact(ctx.filePath, "file.comments");
        if (!summaries || !comments)
            return [];
        const diagnostics = [];
        for (const fn of summaries) {
            if (!fn.isPassThroughWrapper || fn.statementCount !== 1 || fn.isBoundaryWrapper) {
                continue;
            }
            if (hasAliasCommentNear(fn.line, comments))
                continue;
            diagnostics.push({
                id: `pass-through-wrapper:${ctx.filePath}:${fn.line}:${fn.column}`,
                tool: "fact-rules",
                filePath: ctx.filePath,
                line: fn.line,
                column: fn.column,
                severity: "warning",
                semantic: "warning",
                rule: "pass-through-wrappers",
                message: `Function '${fn.name}' is a trivial pass-through wrapper`,
            });
        }
        return diagnostics;
    },
};
