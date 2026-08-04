function failureMessage(failure) {
    const firstLine = failure.message.split("\n")[0]?.slice(0, 300) ?? "";
    return firstLine ? `${failure.name}: ${firstLine}` : failure.name;
}
/**
 * One diagnostic per test failure, attributed to the test file that reported
 * it (not the source file the agent edited — that's `sourceFile` on
 * `TestResult`, but the failure itself lives in the test file). A result with
 * no individual failures listed (a parser that couldn't extract them, or a
 * runner error) still gets one diagnostic so the file isn't silently blank.
 */
export function testResultToProjectDiagnostics(result) {
    if (result.failed === 0 && !result.error)
        return [];
    if (result.failures.length > 0) {
        return result.failures.map((failure) => ({
            filePath: result.file,
            severity: "error",
            semantic: "blocking",
            tool: "test-runner",
            runner: result.runner,
            rule: `test:${result.runner}`,
            message: failureMessage(failure),
            source: "project-scan",
        }));
    }
    return [
        {
            filePath: result.file,
            severity: "error",
            semantic: "blocking",
            tool: "test-runner",
            runner: result.runner,
            rule: `test:${result.runner}`,
            message: result.error
                ? `Test run error: ${result.error}`
                : `${result.failed} test(s) failed`,
            source: "project-scan",
        },
    ];
}
export function testRunnerFindingsToProjectDiagnostics(cache) {
    if (!cache.results || cache.results.length === 0)
        return [];
    return cache.results.flatMap((r) => testResultToProjectDiagnostics(r));
}
