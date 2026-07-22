#!/usr/bin/env node
/**
 * pi-lens MCP `fresh`-mode worker.
 *
 * The review-loop honesty guarantee: the MCP server is long-lived, so after a
 * commit + rebuild it still holds the OLD code in memory. This worker is a
 * short-lived child the server forks per `fresh` analysis — a brand-new `node`
 * process loads the *freshly built* `analyze.js` (and its dispatch graph) from
 * disk, so the measurement reflects the latest commit, not the server's stale
 * image. stdout carries exactly one JSON `McpAnalyzeResult`; diagnostics go to
 * stderr.
 */
import { analyzeFile } from "../clients/mcp/analyze.js";
function arg(name) {
    const prefix = `--${name}=`;
    const found = process.argv.find((value) => value.startsWith(prefix));
    return found ? found.slice(prefix.length) : undefined;
}
async function main() {
    const file = arg("file");
    const cwd = arg("cwd") ?? process.cwd();
    if (!file) {
        process.stderr.write("worker: --file is required\n");
        process.exit(2);
    }
    let flags;
    const flagsRaw = arg("flags");
    if (flagsRaw) {
        try {
            flags = JSON.parse(flagsRaw);
        }
        catch {
            process.stderr.write("worker: --flags must be valid JSON\n");
            process.exit(2);
        }
    }
    const result = await analyzeFile(file, cwd, { flags });
    // Flush before exiting — a bare process.exit can truncate a piped write. The
    // explicit exit is needed because spawned LSP/runner handles would otherwise
    // keep the event loop alive.
    process.stdout.write(JSON.stringify(result), () => process.exit(0));
}
main().catch((err) => {
    process.stderr.write(`worker failed: ${err.message}\n`);
    process.exit(1);
});
