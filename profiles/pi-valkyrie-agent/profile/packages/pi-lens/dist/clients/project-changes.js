import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "./file-utils.js";
import { normalizeMapKey } from "./path-utils.js";
export function getProjectChangeLogPath(cwd) {
    return path.join(getProjectDataDir(cwd), "change-log.jsonl");
}
function parseChangeLine(line) {
    try {
        const parsed = JSON.parse(line);
        if (typeof parsed.seq !== "number" ||
            typeof parsed.fileSeq !== "number" ||
            typeof parsed.filePath !== "string" ||
            typeof parsed.source !== "string") {
            return undefined;
        }
        return {
            seq: parsed.seq,
            timestamp: parsed.timestamp ?? new Date(0).toISOString(),
            sessionId: parsed.sessionId ?? "unknown",
            turnIndex: parsed.turnIndex ?? 0,
            source: parsed.source,
            filePath: parsed.filePath,
            fileSeq: parsed.fileSeq,
            changedRange: parsed.changedRange,
        };
    }
    catch {
        return undefined;
    }
}
export function readProjectChanges(cwd) {
    const logPath = getProjectChangeLogPath(cwd);
    try {
        const content = fs.readFileSync(logPath, "utf-8");
        return content
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean)
            .map(parseChangeLine)
            .filter((entry) => Boolean(entry));
    }
    catch {
        return [];
    }
}
export function readChangesSince(cwd, seq, maxEntries = 200) {
    const limit = Math.max(1, maxEntries);
    return readProjectChanges(cwd)
        .filter((entry) => entry.seq > seq)
        .sort((a, b) => a.seq - b.seq)
        .slice(-limit);
}
export function readLatestProjectSequence(cwd) {
    let projectSeq = 0;
    const fileSeqByPath = new Map();
    for (const entry of readProjectChanges(cwd)) {
        projectSeq = Math.max(projectSeq, entry.seq);
        const key = normalizeMapKey(path.resolve(entry.filePath));
        fileSeqByPath.set(key, Math.max(fileSeqByPath.get(key) ?? 0, entry.fileSeq));
    }
    return { projectSeq, fileSeqByPath };
}
export function appendProjectChange(cwd, entry) {
    const logPath = getProjectChangeLogPath(cwd);
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}
