import * as path from "node:path";
import { safeSpawnAsync } from "../../safe-spawn.js";
import { getLinterPolicyForCwd } from "../../tool-policy.js";
import { PRIORITY } from "../priorities.js";
import { createAvailabilityChecker, lspPrimaryCoversFile, resolveToolCommandWithInstallFallback, } from "./utils/runner-helpers.js";
const taplo = createAvailabilityChecker("taplo", ".exe");
function parseTaploOutput(raw, filePath) {
    try {
        const parsed = JSON.parse(raw);
        const errors = parsed.errors ?? [];
        return errors.map((err, idx) => ({
            id: `taplo-${err.kind}-${err.range?.start.line ?? idx}`,
            message: `[${err.kind}] ${err.message}`,
            filePath,
            line: (err.range?.start.line ?? 0) + 1,
            column: (err.range?.start.col ?? 0) + 1,
            severity: "error",
            semantic: "blocking",
            tool: "taplo",
            rule: err.kind,
            fixable: false,
        }));
    }
    catch {
        return [];
    }
}
const taploRunner = {
    id: "taplo",
    appliesTo: ["toml"],
    priority: PRIORITY.FORMAT_AND_LINT_PRIMARY,
    enabledByDefault: true,
    skipTestFiles: false,
    async run(ctx) {
        const cwd = ctx.cwd || process.cwd();
        const policy = getLinterPolicyForCwd(ctx.filePath, cwd);
        if (policy && !policy.preferredRunners.includes("taplo")) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        // #233: the `toml` LSP server IS `taplo lsp` (same binary). When that LSP
        // covers this file, the warm server already produces these diagnostics —
        // skip the redundant CLI scan to avoid double-reporting. Stays active when
        // the LSP is disabled/unavailable so TOML coverage never regresses.
        if (lspPrimaryCoversFile(ctx, "toml") && (await ctx.hasTool("taplo"))) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        let cmd = null;
        if (await (taplo.isAvailableAsync(cwd))) {
            cmd = taplo.getCommand(cwd);
        }
        else {
            cmd = await resolveToolCommandWithInstallFallback(cwd, "taplo");
        }
        if (!cmd)
            return { status: "skipped", diagnostics: [], semantic: "none" };
        const absPath = path.resolve(cwd, ctx.filePath);
        const result = await safeSpawnAsync(cmd, ["check", "--output=json", absPath], { cwd, timeout: 15000 });
        if (result.error && !result.stdout) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        const diagnostics = parseTaploOutput(result.stdout || "", ctx.filePath);
        if (diagnostics.length === 0) {
            return { status: "succeeded", diagnostics: [], semantic: "none" };
        }
        return { status: "failed", diagnostics, semantic: "blocking" };
    },
};
export default taploRunner;
