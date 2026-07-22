/**
 * Renderer for the #484 turn-summary custom message
 * (`pilens:turn-summary`). Collapsed = one tool-grouped line (pi-lens brand
 * accent). Expanded = file-major: each touched file lists its
 * formats/autofixes/diagnostics with tool + rule id + line.
 *
 * `Component` construction is verified practical from an extension: it is
 * just `@earendil-works/pi-tui`'s `Component` interface —
 * `{ render(width: number): string[] }` — no framework object graph needed.
 * `pi-tui` is already a devDependency (package.json `@earendil-works/pi-tui`).
 */
import { fitLines } from "./tui-fit.js";
import { formatTurnSummaryLine, } from "./turn-summary.js";
function severityColor(theme, severity) {
    if (severity === "error")
        return (s) => theme.fg("error", s);
    if (severity === "warning")
        return (s) => theme.fg("warning", s);
    return (s) => theme.fg("dim", s);
}
function eventLine(theme, event) {
    const loc = event.line !== undefined ? `:${event.line}` : "";
    if (event.kind === "diagnostic") {
        const color = severityColor(theme, event.severity);
        const rule = event.ruleId ? ` ${event.ruleId}` : "";
        const desc = event.description ? ` — ${event.description}` : "";
        return `    ${color(`[${event.tool}${rule}]`)}${loc}${desc}`;
    }
    if (event.kind === "autofix") {
        const desc = event.description ? ` — ${event.description}` : "";
        return `    ${theme.fg("success", `[autofix:${event.tool}]`)}${loc}${desc}`;
    }
    return `    ${theme.fg("accent", `[format:${event.tool}]`)}`;
}
function buildExpandedLines(details, theme) {
    const lines = [];
    lines.push(theme.fg("accent", theme.bold("pi-lens turn summary")));
    const sortedFiles = [...details.files].sort((a, b) => a.displayPath.localeCompare(b.displayPath));
    for (const file of sortedFiles) {
        lines.push(`  ${theme.bold(file.displayPath)}`);
        // File-major: formats, then autofixes, then diagnostics — matches the
        // order things happen in the write pipeline (format → autofix → lint).
        const formats = file.events.filter((e) => e.kind === "format");
        const autofixes = file.events.filter((e) => e.kind === "autofix");
        const diagnostics = file.events.filter((e) => e.kind === "diagnostic");
        for (const event of [...formats, ...autofixes, ...diagnostics]) {
            lines.push(eventLine(theme, event));
        }
    }
    return lines;
}
export function renderTurnSummaryMessage(message, options, theme) {
    const details = message.details;
    if (!details)
        return undefined;
    // pi-tui HARD-CRASHES the host on any rendered line wider than the
    // terminal, so every line must be fitted to the width the TUI hands us
    // (#513 — an untruncated collapsed one-liner took down a live session).
    if (!options.expanded) {
        const line = formatTurnSummaryLine(details);
        const text = theme.fg("accent", line);
        return {
            render: (width) => fitLines([text], width),
            invalidate: () => { },
        };
    }
    const lines = buildExpandedLines(details, theme);
    return {
        render: (width) => fitLines(lines, width),
        invalidate: () => { },
    };
}
