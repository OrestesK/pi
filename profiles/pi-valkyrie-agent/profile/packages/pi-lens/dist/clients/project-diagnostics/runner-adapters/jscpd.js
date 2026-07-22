import * as path from "node:path";
function resolveClonePath(cwd, file) {
    return path.isAbsolute(file) ? file : path.resolve(cwd, file);
}
/**
 * A jscpd clone is a *relationship* between two spans (`fileA:startA` ↔
 * `fileB:startB`), unlike a single-point knip finding. Emit a diagnostic on
 * BOTH ends so the duplication surfaces on whichever file the agent is looking
 * at, each one naming the other end.
 */
export function jscpdCloneToProjectDiagnostics(cwd, clone) {
    const a = resolveClonePath(cwd, clone.fileA);
    const b = resolveClonePath(cwd, clone.fileB);
    const make = (filePath, line, otherFile, otherLine) => ({
        filePath,
        line,
        severity: "warning",
        semantic: "warning",
        tool: "jscpd",
        runner: "jscpd",
        rule: "jscpd:duplicate",
        message: `Duplicate code (${clone.lines} lines) — also at ${path.relative(cwd, otherFile)}:${otherLine}`,
        source: "project-scan",
    });
    return [
        make(a, clone.startA, b, clone.startB),
        make(b, clone.startB, a, clone.startA),
    ];
}
/**
 * Map a whole jscpd scan into per-file `ProjectDiagnostic`s (two per clone).
 * Empty when the scan failed or found no duplication.
 */
export function jscpdResultToProjectDiagnostics(cwd, result) {
    if (!result.success || result.clones.length === 0)
        return [];
    return result.clones.flatMap((clone) => jscpdCloneToProjectDiagnostics(cwd, clone));
}
