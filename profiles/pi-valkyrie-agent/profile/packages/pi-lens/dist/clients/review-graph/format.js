import * as path from "node:path";
const MAX_SYMBOLS = 5;
function displayList(items, maxFiles, map) {
    return items.slice(0, maxFiles).map((item) => (map ? map(item) : item));
}
export function formatImpactCascade(result, maxFiles = 4) {
    if (result.changedSymbols.length === 0 &&
        result.neighborFiles.length === 0 &&
        result.riskFlags.length === 0) {
        return undefined;
    }
    const lines = ["🕸️ Impact cascade from edited file:"];
    if (result.changedSymbols.length > 0) {
        const shown = result.changedSymbols.slice(0, MAX_SYMBOLS);
        const suffix = result.changedSymbols.length > shown.length
            ? ` (+${result.changedSymbols.length - shown.length} more)`
            : "";
        lines.push(`Changed symbols: ${shown.join(", ")}${suffix}`);
    }
    if (result.directImporters.length > 0) {
        lines.push(`Direct importers: ${displayList(result.directImporters, maxFiles, (item) => path.basename(item)).join(", ")}`);
    }
    if (result.directCallers.length > 0) {
        lines.push(`Direct callers: ${displayList(result.directCallers, maxFiles, (item) => path.basename(item)).join(", ")}`);
    }
    if (result.neighborFiles.length > 0) {
        lines.push(`Check next: ${displayList(result.neighborFiles, maxFiles, (item) => path.basename(item)).join(", ")}`);
    }
    if (result.riskFlags.length > 0) {
        lines.push(`Risk: ${result.riskFlags.join(", ")}`);
    }
    return lines.join("\n");
}
