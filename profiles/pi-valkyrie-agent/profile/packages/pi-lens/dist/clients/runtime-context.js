export function consumeTurnEndFindings(cacheManager, cwd) {
    const findings = cacheManager.readCache("turn-end-findings", cwd);
    if (!findings?.data?.content)
        return;
    cacheManager.writeCache("turn-end-findings", null, cwd);
    return {
        messages: [
            {
                role: "user",
                content: `[pi-lens automated check — not a user request] Address 🔴 blockers before continuing; ℹ️ advisories are informational only.\n\n${findings.data.content}`,
            },
        ],
    };
}
export function consumeTestFindings(cacheManager, cwd) {
    const findings = cacheManager.readCache("test-runner-findings", cwd);
    if (!findings?.data?.content)
        return;
    cacheManager.writeCache("test-runner-findings", null, cwd);
    return {
        messages: [
            {
                role: "user",
                content: `[pi-lens automated check — not a user request] Test failures detected last turn — fix before continuing:\n\n${findings.data.content}`,
            },
        ],
    };
}
export function consumeSessionStartGuidance(cacheManager, cwd) {
    const guidance = cacheManager.readCache("session-start-guidance", cwd);
    if (!guidance?.data?.content)
        return;
    cacheManager.writeCache("session-start-guidance", null, cwd);
    return {
        messages: [
            {
                role: "user",
                content: `[pi-lens automated context — not a user request]\n\n${guidance.data.content}`,
            },
        ],
    };
}
