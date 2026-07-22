import * as path from "node:path";
function knipIssueFile(cwd, issue) {
    if (!issue.file)
        return cwd;
    return path.isAbsolute(issue.file)
        ? issue.file
        : path.resolve(cwd, issue.file);
}
function knipIssueMessage(issue) {
    if (issue.type === "unlisted") {
        return `Unlisted dependency ${issue.name}`;
    }
    if (issue.type === "bin") {
        return `Unlisted binary ${issue.name}`;
    }
    if (issue.type === "export") {
        return `Unused export ${issue.name}`;
    }
    if (issue.type === "enumMember") {
        return `Unused enum member ${issue.name}`;
    }
    if (issue.type === "file") {
        return `Unused file ${issue.name}`;
    }
    if (issue.type === "dependency" || issue.type === "devDependency") {
        return `Unused ${issue.type} ${issue.name}`;
    }
    return `${issue.type}: ${issue.name}`;
}
export function knipIssueToProjectDiagnostic(cwd, issue) {
    const blocking = issue.type === "unlisted" || issue.type === "bin";
    return {
        filePath: knipIssueFile(cwd, issue),
        line: issue.line,
        severity: blocking ? "error" : "warning",
        semantic: blocking ? "blocking" : "warning",
        tool: "knip",
        runner: "knip",
        rule: `knip:${issue.type}`,
        code: issue.package,
        message: knipIssueMessage(issue),
        source: "project-scan",
    };
}
export function knipIssuesToProjectDiagnostics(cwd, issues) {
    return issues.map((issue) => knipIssueToProjectDiagnostic(cwd, issue));
}
