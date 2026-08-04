import * as path from "node:path";
import { ensureTool } from "../../installer/index.js";
import { safeSpawnAsync } from "../../safe-spawn.js";
import { createAvailabilityChecker } from "./utils/runner-helpers.js";
import { PRIORITY } from "../priorities.js";
const tflint = createAvailabilityChecker("tflint", ".exe");
function parseTflintOutput(raw, filePath) {
    try {
        const parsed = JSON.parse(raw);
        const issues = parsed.issues ?? [];
        return issues.map((issue) => {
            const severity = issue.rule.severity === "error" ? "error" : "warning";
            return {
                id: `tflint-${issue.rule.name}-${issue.range.start.line}`,
                message: `[${issue.rule.name}] ${issue.message}`,
                filePath,
                line: issue.range.start.line,
                column: issue.range.start.column,
                severity,
                semantic: severity === "error" ? "blocking" : "warning",
                tool: "tflint",
                rule: issue.rule.name,
                fixable: false,
            };
        });
    }
    catch {
        return [];
    }
}
const tflintRunner = {
    id: "tflint",
    appliesTo: ["terraform"],
    priority: PRIORITY.GENERAL_ANALYSIS,
    enabledByDefault: true,
    skipTestFiles: false,
    async run(ctx) {
        const cwd = ctx.cwd || process.cwd();
        let cmd = null;
        if (await (tflint.isAvailableAsync(cwd))) {
            cmd = tflint.getCommand(cwd);
        }
        else {
            const managed = await ensureTool("tflint");
            if (managed)
                cmd = managed;
        }
        if (!cmd)
            return { status: "skipped", diagnostics: [], semantic: "none" };
        const absPath = path.resolve(cwd, ctx.filePath);
        const fileDir = path.dirname(absPath);
        const result = await safeSpawnAsync(cmd, ["--format=json", "--no-color", `--filter=${path.basename(absPath)}`], { cwd: fileDir, timeout: 30000 });
        if (result.error && !result.stdout) {
            return { status: "skipped", diagnostics: [], semantic: "none" };
        }
        const diagnostics = parseTflintOutput(result.stdout || "", ctx.filePath);
        if (diagnostics.length === 0) {
            return { status: "succeeded", diagnostics: [], semantic: "none" };
        }
        const hasErrors = diagnostics.some((d) => d.severity === "error");
        return {
            status: hasErrors ? "failed" : "succeeded",
            diagnostics,
            semantic: hasErrors ? "blocking" : "warning",
        };
    },
};
export default tflintRunner;
