import * as path from "node:path";
/**
 * A trivy finding is a CVE in a dependency — a *dependency-level* finding, not a
 * source location. Anchor it at the manifest/lockfile it was found in (`target`),
 * with no line. Advisory (warning); the CVE severity is carried in the message.
 */
export function trivyFindingToProjectDiagnostic(cwd, finding) {
    const filePath = finding.target
        ? path.isAbsolute(finding.target)
            ? finding.target
            : path.resolve(cwd, finding.target)
        : cwd;
    const version = finding.installedVersion ? `@${finding.installedVersion}` : "";
    const fix = finding.fixedVersion ? ` (fixed in ${finding.fixedVersion})` : "";
    return {
        filePath,
        severity: "warning",
        semantic: "warning",
        tool: "trivy",
        runner: "trivy",
        rule: `trivy:${finding.vulnerabilityId}`,
        code: finding.pkgName,
        message: `${finding.severity} vulnerability ${finding.vulnerabilityId} in ${finding.pkgName}${version}${fix}`,
        source: "project-scan",
    };
}
export function trivyResultToProjectDiagnostics(cwd, result) {
    if (!result.success || result.findings.length === 0)
        return [];
    return result.findings.map((finding) => trivyFindingToProjectDiagnostic(cwd, finding));
}
