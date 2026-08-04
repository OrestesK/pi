/**
 * Warm side-channel for the push path. The MCP server is a long-lived process
 * with a warm LSP, but its stdio is owned by the MCP client — so the
 * PostToolUse-hook bin can't reach it that way. Instead the server listens on a
 * local IPC endpoint (Unix domain socket / Windows named pipe), and the hook
 * connects to it to get LSP-complete diagnostics from the warm process instead
 * of running its own cold analysis.
 *
 * This module is the CLIENT + the shared path derivation only — deliberately
 * light (node:net + type-only result), so the bin can try the warm path WITHOUT
 * loading the dispatch graph. The server side lives in mcp/server.ts (which
 * already holds the analysis engine). If the warm path is unavailable, the
 * client resolves `undefined` and the caller falls back to cold local analysis.
 */
import * as crypto from "node:crypto";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
export const WARM_DIAGNOSTICS_SCHEMA_VERSION = 1;
export const WARM_CODE_ACTION_LOOKUP_LIMIT = 6;
/**
 * Stable per-workspace endpoint path. The server (from its launch cwd) and the
 * hook (from the PostToolUse cwd) must resolve the same path — both hash the
 * resolved root (lowercased for case-insensitive filesystems), so when they're
 * the same project they meet. Mismatch → the client just falls back to cold.
 */
export function ipcPathForCwd(cwd) {
    const root = path.resolve(cwd).toLowerCase();
    // sha256 (not for security — just a stable short id for the IPC socket/pipe
    // name keyed by cwd; sha256 over sha1 keeps SonarCloud's weak-hash check quiet)
    const hash = crypto
        .createHash("sha256")
        .update(root)
        .digest("hex")
        .slice(0, 16);
    if (process.platform === "win32") {
        return `\\\\.\\pipe\\pi-lens-mcp-${hash}`;
    }
    return path.join(os.tmpdir(), `pi-lens-mcp-${hash}.sock`);
}
/** PID-scoped endpoint used by pi sessions. The legacy MCP analyze endpoint
 * remains workspace-scoped for compatibility with the PostToolUse hook. */
export function diagnosticsIpcPathForCwd(cwd, pid) {
    const base = ipcPathForCwd(cwd);
    if (process.platform === "win32")
        return `${base}-diagnostics-${pid}`;
    return base.replace(/\.sock$/, `-diagnostics-${pid}.sock`);
}
export function contentHash(content) {
    return crypto.createHash("sha256").update(content).digest("hex");
}
/**
 * Shared one-shot request/response transport for the warm-attach IPC routes
 * (#822): connect to the incumbent's PID-scoped endpoint, write one JSON
 * line, read one JSON line back, classify. The per-route `validate` callback
 * returns a failure reason for an on-time but unusable reply (schema skew,
 * staleness) or `undefined` to accept it; transport failures map uniformly to
 * timeout/ipc-error. One transport, N routes — the diagnostics and
 * code-action clients cannot drift apart.
 */
function requestOverWarmIpc(cwd, incumbentPid, timeoutMs, buildRequest, validate) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            resolve(value);
        };
        const deadlineAt = Date.now() + timeoutMs;
        const socket = net.createConnection(diagnosticsIpcPathForCwd(cwd, incumbentPid));
        socket.setEncoding("utf8");
        let buffer = "";
        const timer = setTimeout(() => finish({ available: false, reason: "timeout" }), timeoutMs);
        timer.unref();
        socket.on("connect", () => {
            socket.write(`${JSON.stringify(buildRequest(deadlineAt))}\n`);
        });
        socket.on("data", (chunk) => {
            buffer += chunk;
            const newline = buffer.indexOf("\n");
            if (newline === -1)
                return;
            try {
                const message = JSON.parse(buffer.slice(0, newline));
                const result = message.result;
                if (message.error || !result) {
                    finish({ available: false, reason: "ipc-error" });
                    return;
                }
                const reason = validate(result, deadlineAt);
                if (reason === undefined) {
                    finish({ available: true, response: result });
                }
                else {
                    finish({ available: false, reason });
                }
            }
            catch {
                finish({ available: false, reason: "schema-mismatch" });
            }
        });
        socket.on("error", () => finish({ available: false, reason: "ipc-error" }));
        socket.on("close", () => finish({ available: false, reason: "ipc-error" }));
    });
}
export function requestWarmDiagnostics(cwd, incumbentPid, file, content, timeoutMs) {
    const expectedHash = contentHash(content);
    return requestOverWarmIpc(cwd, incumbentPid, timeoutMs, (deadlineAt) => ({
        route: "diagnostics",
        version: WARM_DIAGNOSTICS_SCHEMA_VERSION,
        file,
        cwd,
        content,
        contentHash: expectedHash,
        deadlineAt,
    }), (result, deadlineAt) => {
        if (result.route !== "diagnostics" ||
            result.version !== WARM_DIAGNOSTICS_SCHEMA_VERSION) {
            return "schema-mismatch";
        }
        if (!result.fresh ||
            result.inconclusive ||
            result.contentHash !== expectedHash ||
            result.servedAt > deadlineAt) {
            return "stale-answer";
        }
        return undefined;
    });
}
export function requestWarmCodeActions(cwd, incumbentPid, file, expectedContentHash, ranges, timeoutMs) {
    return requestOverWarmIpc(cwd, incumbentPid, timeoutMs, (deadlineAt) => ({
        route: "code-actions",
        version: WARM_DIAGNOSTICS_SCHEMA_VERSION,
        file,
        cwd,
        contentHash: expectedContentHash,
        ranges,
        deadlineAt,
    }), (result, deadlineAt) => {
        if (result.route !== "code-actions" ||
            result.version !== WARM_DIAGNOSTICS_SCHEMA_VERSION ||
            !Array.isArray(result.actions) ||
            result.actions.length !== ranges.length ||
            result.actions.some((actions) => !Array.isArray(actions))) {
            return "schema-mismatch";
        }
        if (result.contentHash !== expectedContentHash ||
            result.servedAt > deadlineAt) {
            return "stale-answer";
        }
        return undefined;
    });
}
/**
 * Ask the warm server to analyze a file. Resolves the server's result, or
 * `undefined` on ANY failure (no server, refused, stale socket, timeout, bad
 * response) so the caller transparently falls back to cold local analysis.
 */
export function requestWarmAnalyze(cwd, file, timeoutMs = 30_000) {
    return new Promise((resolve) => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const socket = net.createConnection(ipcPathForCwd(cwd));
        socket.setEncoding("utf8");
        let buffer = "";
        const timer = setTimeout(() => {
            socket.destroy();
            finish(undefined);
        }, timeoutMs);
        timer.unref();
        socket.on("connect", () => {
            const request = { file, cwd };
            socket.write(`${JSON.stringify(request)}\n`);
        });
        socket.on("data", (chunk) => {
            buffer += chunk;
            const newline = buffer.indexOf("\n");
            if (newline === -1)
                return;
            try {
                const message = JSON.parse(buffer.slice(0, newline));
                finish(message.error ? undefined : message.result);
            }
            catch {
                finish(undefined);
            }
            socket.end();
        });
        // No server / connection refused / reset → cold fallback.
        socket.on("error", () => finish(undefined));
        socket.on("close", () => finish(undefined));
    });
}
