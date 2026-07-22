/**
 * Fix Worklog for pi-lens
 *
 * Appends auto-fixed and fixable diagnostics to the project data worklog
 * so repair history is preserved across sessions.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
// --- Paths ---
export function getWorklogPath(cwd) {
    return path.join(getProjectDataDir(cwd), "worklog.jsonl");
}
// --- Write ---
/**
 * Append diagnostics to the worklog. Pass `autoFixed: true` for
 * diagnostics that were already fixed by the tool, `false` for
 * diagnostics that are fixable but require agent action.
 */
export function appendToWorklog(cwd, diagnostics, autoFixed) {
    if (diagnostics.length === 0)
        return;
    const worklogPath = getWorklogPath(cwd);
    try {
        fs.mkdirSync(path.dirname(worklogPath), { recursive: true });
        const timestamp = new Date().toISOString();
        const lines = diagnostics
            .map((d) => {
            const entry = {
                timestamp,
                filePath: d.filePath,
                rule: d.rule ?? d.id ?? "unknown",
                tool: d.tool,
                message: d.message,
                line: d.line ?? 1,
                column: d.column,
                fixable: d.fixable ?? false,
                fixSuggestion: d.fixSuggestion,
                autoFixed,
            };
            return JSON.stringify(entry);
        })
            .join("\n") + "\n";
        fs.appendFileSync(worklogPath, lines, "utf8");
    }
    catch {
        // Non-fatal — worklog write failure should never surface to the agent
    }
}
// --- Read ---
export function readWorklog(cwd) {
    const worklogPath = getWorklogPath(cwd);
    try {
        const raw = fs.readFileSync(worklogPath, "utf8");
        return raw
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    }
    catch {
        return [];
    }
}
export function summarizeWorklog(cwd) {
    const entries = readWorklog(cwd);
    const byRule = new Map();
    let totalAutoFixed = 0;
    let totalFixable = 0;
    for (const e of entries) {
        const r = byRule.get(e.rule) ?? { count: 0, autoFixed: 0 };
        r.count++;
        if (e.autoFixed) {
            r.autoFixed++;
            totalAutoFixed++;
        }
        if (e.fixable)
            totalFixable++;
        byRule.set(e.rule, r);
    }
    return {
        totalAutoFixed,
        totalFixable,
        byRule: [...byRule.entries()]
            .map(([rule, v]) => ({ rule, ...v }))
            .sort((a, b) => b.count - a.count),
    };
}
