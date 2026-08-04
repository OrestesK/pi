import * as path from "node:path";
import { safeSpawnAsync } from "../../safe-spawn.js";
import { getLinterPolicyForCwd, hasPhpstanConfig } from "../../tool-policy.js";
import { PRIORITY } from "../priorities.js";
import { createAvailabilityChecker, resolveVendorToolCommand, } from "./utils/runner-helpers.js";
const phpstan = createAvailabilityChecker("phpstan", ".phar");
// phpstan analyses the target file PLUS its dependency closure and keys errors
// by the real file in `output.files`. Attribute each diagnostic to that key
// (resolved against cwd) rather than blanket-stamping ctx.filePath — otherwise a
// cross-file regression is mis-located onto the edited file (#265 A3). We do NOT
// filter to the edited file: surfacing the cross-file impact is the point.
export function parsePhpstanJson(raw, fallbackPath, cwd) {
    try {
        const output = JSON.parse(raw);
        const diagnostics = [];
        for (const [file, fileErrors] of Object.entries(output.files ?? {})) {
            const filePath = file && file.trim()
                ? path.isAbsolute(file)
                    ? file
                    : path.resolve(cwd, file)
                : fallbackPath;
            for (const err of fileErrors.errors ?? []) {
                diagnostics.push({
                    id: `phpstan:${err.line ?? 1}:${err.message.slice(0, 40)}`,
                    message: err.message,
                    filePath,
                    line: err.line ?? 1,
                    column: 1,
                    severity: "error",
                    semantic: "blocking",
                    tool: "phpstan",
                    rule: "phpstan",
                    fixable: false,
                });
            }
        }
        return diagnostics;
    }
    catch {
        return [];
    }
}
async function resolvePhpstan(cwd) {
    if (await (phpstan.isAvailableAsync(cwd)))
        return phpstan.getCommand(cwd);
    return resolveVendorToolCommand(cwd, "phpstan", ".bat");
}
const phpstanRunner = {
    id: "phpstan",
    appliesTo: ["php"],
    priority: PRIORITY.GENERAL_ANALYSIS,
    enabledByDefault: true,
    skipTestFiles: false,
    async run(ctx) {
        const cwd = ctx.cwd || process.cwd();
        const policy = getLinterPolicyForCwd(ctx.filePath, cwd);
        if (policy && !policy.preferredRunners.includes("phpstan")) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        // Only run if phpstan config present — avoids noisy defaults on unconfigured projects
        if (!hasPhpstanConfig(cwd)) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        const cmd = await resolvePhpstan(cwd);
        if (!cmd)
            return { status: "skipped", diagnostics: [], semantic: "none" };
        const absPath = path.resolve(cwd, ctx.filePath);
        const result = await safeSpawnAsync(cmd, ["analyse", "--error-format=json", "--no-progress", absPath], { timeout: 30000, cwd });
        // phpstan exits 0 = no errors, 1 = errors found, 2 = fatal
        if (result.status === 2 || result.error) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        if (result.status === 0) {
            return { status: "succeeded", diagnostics: [], semantic: "none" };
        }
        const diagnostics = parsePhpstanJson(result.stdout ?? "", ctx.filePath, cwd);
        if (diagnostics.length === 0) {
            return { status: "succeeded", diagnostics: [], semantic: "none" };
        }
        return { status: "failed", diagnostics, semantic: "blocking" };
    },
};
export default phpstanRunner;
