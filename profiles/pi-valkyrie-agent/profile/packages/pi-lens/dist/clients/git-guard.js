function getShellCommand(input) {
    if (!input || typeof input !== "object")
        return "";
    const raw = input;
    if (typeof raw.command === "string")
        return raw.command;
    if (typeof raw.cmd === "string")
        return raw.cmd;
    return "";
}
export function isGitCommitOrPushAttempt(toolName, input) {
    if (toolName !== "bash")
        return false;
    const cmd = getShellCommand(input).toLowerCase();
    if (!cmd)
        return false;
    return /(^|\s|&&|;|\|)git\s+(commit|push)(\s|$)/.test(cmd);
}
export function evaluateGitGuard(runtime, cacheManager, cwd) {
    const pending = cacheManager.readCache("turn-end-findings", cwd);
    const turnEndHasBlockers = !!pending?.data?.content;
    if (!runtime.gitGuardHasBlockers && !turnEndHasBlockers) {
        return { block: false };
    }
    const details = runtime.gitGuardSummary
        ? `\n${runtime.gitGuardSummary}`
        : "";
    return {
        block: true,
        reason: `🔴 COMMIT BLOCKED (--lens-guard): unresolved blockers must be fixed before commit/push.${details}\nRun lens_diagnostics mode=all for full details, then commit again.`,
    };
}
