import * as path from "node:path";
import { safeSpawnAsync } from "../../safe-spawn.js";
import { getAutofixCapability, getLinterPolicyForCwd, } from "../../tool-policy.js";
import { PRIORITY } from "../priorities.js";
import { createAvailabilityChecker, resolveToolCommandWithInstallFallback, } from "./utils/runner-helpers.js";
const ktlint = createAvailabilityChecker("ktlint", ".exe");
function normalizeKtlintResults(parsed) {
    if (Array.isArray(parsed)) {
        return parsed;
    }
    if (parsed &&
        typeof parsed === "object" &&
        Array.isArray(parsed.errors)) {
        return [parsed];
    }
    return null;
}
function parseKtlintOutput(raw, filePath) {
    try {
        const parsed = normalizeKtlintResults(JSON.parse(raw));
        if (!parsed)
            return null;
        const autofix = getAutofixCapability("ktlint");
        const diagnostics = [];
        for (const result of parsed) {
            for (const err of result.errors ?? []) {
                diagnostics.push({
                    id: `ktlint-${err.ruleId}-${err.line}-${err.col}`,
                    message: `[${err.ruleId}] ${err.detail}`,
                    filePath,
                    line: err.line,
                    column: err.col,
                    severity: "warning",
                    semantic: "warning",
                    tool: "ktlint",
                    rule: err.ruleId,
                    fixable: true,
                    autoFixAvailable: autofix?.safePipelineAutofix ?? false,
                    fixKind: autofix?.fixKind === "none" ? undefined : autofix?.fixKind,
                });
            }
        }
        return diagnostics;
    }
    catch {
        return null;
    }
}
function firstOutputLine(result) {
    return (result.stderr || result.stdout || "")
        .trim()
        .split(/\r?\n/, 1)[0]
        .slice(0, 200);
}
const ktlintRunner = {
    id: "ktlint",
    appliesTo: ["kotlin"],
    priority: PRIORITY.FORMAT_AND_LINT_PRIMARY,
    enabledByDefault: true,
    skipTestFiles: false,
    async run(ctx) {
        const cwd = ctx.cwd || process.cwd();
        const policy = getLinterPolicyForCwd(ctx.filePath, cwd);
        if (policy && !policy.preferredRunners.includes("ktlint")) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        let cmd = null;
        if (await (ktlint.isAvailableAsync(cwd))) {
            cmd = ktlint.getCommand(cwd);
        }
        else {
            cmd = await resolveToolCommandWithInstallFallback(cwd, "ktlint");
        }
        if (!cmd)
            return { status: "skipped", diagnostics: [], semantic: "none" };
        const absPath = path.resolve(cwd, ctx.filePath);
        const result = await safeSpawnAsync(cmd, ["--reporter=json", absPath], {
            cwd,
            timeout: 30000,
        });
        // Ktlint exits non-zero when issues are found, so only treat a total lack
        // of output as a hard skip. Any non-empty but unparseable output should
        // surface as runner failure instead of a false clean result.
        if (result.error && !result.stdout) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        const diagnostics = parseKtlintOutput(result.stdout || "", ctx.filePath);
        if (diagnostics === null) {
            const detail = firstOutputLine(result) || "Unknown ktlint output";
            return {
                status: "failed",
                diagnostics: [
                    {
                        id: "ktlint-output-unparseable",
                        message: `Unable to parse ktlint output: ${detail}`,
                        filePath: ctx.filePath,
                        severity: "warning",
                        semantic: "warning",
                        tool: "ktlint",
                        fixable: false,
                        autoFixAvailable: false,
                    },
                ],
                semantic: "warning",
            };
        }
        if (diagnostics.length === 0) {
            if (result.status && result.status !== 0) {
                return {
                    status: "failed",
                    diagnostics: [
                        {
                            id: "ktlint-nonzero-no-diagnostics",
                            message: firstOutputLine(result) ||
                                "ktlint exited non-zero without JSON diagnostics",
                            filePath: ctx.filePath,
                            severity: "warning",
                            semantic: "warning",
                            tool: "ktlint",
                            fixable: false,
                            autoFixAvailable: false,
                        },
                    ],
                    semantic: "warning",
                };
            }
            return { status: "succeeded", diagnostics: [], semantic: "none" };
        }
        return {
            status: result.status && result.status !== 0 ? "failed" : "succeeded",
            diagnostics,
            semantic: "warning",
        };
    },
};
export default ktlintRunner;
