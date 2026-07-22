/**
 * Shared machinery for pi-lens's session-scan security clients
 * (gitleaks #130, govulncheck #132, trivy #131).
 *
 * Each of those surfaces findings from an external CLI scanner with the same
 * lifecycle plumbing: a one-time availability resolution (PATH probe, optionally
 * followed by an auto-install) shared across concurrent first-time callers, plus
 * per-target scan re-entrancy so concurrent scans of the same root share a single
 * process. That plumbing was copy-pasted three times; this base owns it once and
 * lets each subclass supply only the tool-specific probe/install
 * (`doEnsureAvailable`) and the scan invocation.
 *
 * Refs: #130, #131, #132
 */
import { safeSpawnAsync } from "./safe-spawn.js";
export class SecurityScanClient {
    toolName;
    available = null;
    ensureInFlight = null;
    inFlight = new Map();
    binaryPath = null;
    log;
    /**
     * @param toolName binary / installer id used for probes, logs and auto-install
     * @param verbose  when true, diagnostics are written to stderr
     */
    constructor(toolName, verbose = false) {
        this.toolName = toolName;
        this.log = verbose
            ? (msg) => console.error(`[${toolName}] ${msg}`)
            : () => { };
    }
    /**
     * Resolve (once) whether the scanner is usable, sharing the probe promise
     * across concurrent first-time callers. The tool-specific probe + optional
     * install lives in `doEnsureAvailable`.
     */
    async ensureAvailable() {
        if (this.available !== null)
            return this.available;
        if (this.ensureInFlight)
            return this.ensureInFlight;
        this.ensureInFlight = this.doEnsureAvailable();
        try {
            return await this.ensureInFlight;
        }
        finally {
            this.ensureInFlight = null;
        }
    }
    /**
     * Spawn `toolName <versionArgs>` and report whether it answered cleanly.
     * Does NOT mutate `this.available` — callers decide what a hit/miss means.
     */
    async probeVersion(versionArgs) {
        const probe = await safeSpawnAsync(this.toolName, versionArgs, {
            timeout: 5000,
        });
        if (!probe.error && probe.status === 0) {
            this.log(`${this.toolName} found: ${probe.stdout.trim().split("\n")[0]}`);
            return true;
        }
        return false;
    }
    /**
     * Standard availability path for the GitHub-release tools (gitleaks, trivy):
     * PATH probe first, then fall back to the pi-lens installer's `ensureTool`.
     * Records the resolved binary path and sets `this.available`.
     */
    async ensureViaInstaller(versionArgs) {
        if (await this.probeVersion(versionArgs)) {
            this.available = true;
            return true;
        }
        this.log(`${this.toolName} not found, attempting auto-install`);
        const { ensureTool } = await import("./installer/index.js");
        const installed = await ensureTool(this.toolName);
        if (!installed) {
            this.log(`${this.toolName} auto-install failed`);
            this.available = false;
            return false;
        }
        this.binaryPath = installed;
        this.available = true;
        this.log(`${this.toolName} auto-installed at ${installed}`);
        return true;
    }
    /**
     * Per-target scan re-entrancy: when a scan for `key` is already running, the
     * concurrent caller shares the in-flight promise instead of spawning a second
     * process. The entry is cleared when the run settles.
     */
    dedupeScan(key, run) {
        const existing = this.inFlight.get(key);
        if (existing) {
            this.log(`Scan already in flight for ${key}; sharing result`);
            return existing;
        }
        const promise = run().finally(() => this.inFlight.delete(key));
        this.inFlight.set(key, promise);
        return promise;
    }
}
