import { randomBytes } from "node:crypto";
import * as path from "node:path";
import { normalizeMapKey } from "./path-utils.js";
import { ReadGuard } from "./read-guard.js";
import { RUNTIME_CONFIG } from "./runtime-config.js";
import { TurnSummaryCollector } from "./turn-summary.js";
export class RuntimeCoordinator {
    _projectRoot = normalizeMapKey(process.cwd());
    _sessionGeneration = 0;
    _sessionStartedAt = Date.now();
    _errorDebtBaseline = null;
    _pipelineCrashCounts = new Map();
    _cachedExports = new Map();
    _startupScansInFlight = new Map();
    _cascadeRuns = [];
    // Cascade computes are kicked off unawaited by the pipeline (#450); their
    // promises park here until turn_end drains them via settleCascadeRuns. Each is
    // guaranteed non-rejecting by the pipeline's .catch.
    _pendingCascadeRuns = [];
    _cascadeSessionStats = {
        runs: 0,
        diagnosticsSurfaced: 0,
        coldSnapshotTouches: 0,
    };
    _complexityBaselines = new Map();
    _fixedThisTurn = new Set();
    _reportedThisTurn = new Set();
    _projectRulesScan = {
        rules: [],
        hasCustomRules: false,
    };
    _telemetrySessionId = `lens-${Date.now().toString(36)}`;
    _lifecycleReason;
    _hasStableSessionId = false;
    _telemetryModel = "unknown";
    _turnIndex = 0;
    _writeIndex = 0;
    _projectSeq = 0;
    _turnStartProjectSeq = 0;
    _fileSeq = new Map();
    // File key → the projectSeq value at that file's most recent bump (#451). Lets
    // the review-graph builder ask "which files changed since I last built?" and
    // skip its per-build O(project) walk+stat sweep when only pi-observed edits
    // occurred. Keyed identically to _fileSeq (normalizeMapKey + path.resolve).
    _fileLastProjectSeq = new Map();
    _gitGuardHasBlockers = false;
    _gitGuardSummary = "";
    callGraph = null;
    wordIndex = null;
    _readGuard = null;
    _pendingDeferredFormatFiles = new Map();
    _lspReadWarmState = new Map();
    _pendingInlineBlockers = new Map();
    _actionableWarningsThisTurn = new Map();
    _codeQualityWarningsThisTurn = new Map();
    // #484: opt-in per-RUN summary of diagnostics/autofixes/formats,
    // accumulated across the run's turns and consumed once at the
    // agent_settled quiet window. The collector itself is always constructed
    // (cheap, empty Map) but callers gate recording behind the
    // `lens-turn-summary` flag so it's a true no-op when the feature is off.
    _turnSummary = new TurnSummaryCollector();
    resetForSession() {
        this._sessionGeneration += 1;
        this._sessionStartedAt = Date.now();
        this._complexityBaselines.clear();
        this._pipelineCrashCounts.clear();
        this._cachedExports.clear();
        this.wordIndex = null;
        this._startupScansInFlight.clear();
        this._cascadeRuns = [];
        this._pendingCascadeRuns = [];
        this._cascadeSessionStats = {
            runs: 0,
            diagnosticsSurfaced: 0,
            coldSnapshotTouches: 0,
        };
        this._fixedThisTurn.clear();
        this._reportedThisTurn.clear();
        this._telemetrySessionId = `lens-${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
        this._hasStableSessionId = false;
        this._telemetryModel = "unknown";
        this._turnIndex = 0;
        this._writeIndex = 0;
        this._projectSeq = 0;
        this._turnStartProjectSeq = 0;
        this._fileSeq.clear();
        this._fileLastProjectSeq.clear();
        this._gitGuardHasBlockers = false;
        this._gitGuardSummary = "";
        this._readGuard = null;
        this._pendingDeferredFormatFiles.clear();
        this._lspReadWarmState.clear();
        this._pendingInlineBlockers.clear();
        this._actionableWarningsThisTurn.clear();
        this._codeQualityWarningsThisTurn.clear();
        this._turnSummary.clear();
    }
    get sessionStartedAt() {
        return this._sessionStartedAt;
    }
    get cascadeSessionStats() {
        return this._cascadeSessionStats;
    }
    recordCascadeRun(diagnosticsSurfaced, coldSnapshotTouches) {
        this._cascadeSessionStats.runs += 1;
        this._cascadeSessionStats.diagnosticsSurfaced += diagnosticsSurfaced;
        this._cascadeSessionStats.coldSnapshotTouches += coldSnapshotTouches;
    }
    updateGitGuardStatus(hasBlockers, output) {
        this._gitGuardHasBlockers = hasBlockers;
        if (!hasBlockers) {
            this._gitGuardSummary = "";
            return;
        }
        const firstLine = output
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0);
        this._gitGuardSummary = (firstLine ?? "Unresolved blockers detected").slice(0, 160);
    }
    get gitGuardHasBlockers() {
        return this._gitGuardHasBlockers;
    }
    get gitGuardSummary() {
        return this._gitGuardSummary;
    }
    beginTurn() {
        this._cascadeRuns = [];
        // _pendingCascadeRuns is deliberately NOT cleared here: a cascade compute
        // still in flight past last turn_end's settle cap (fresh graph builds have
        // measured up to ~19s) must surface on the NEXT turn_end, not be dropped —
        // pre-#450 those findings were always awaited, never lost. Session reset
        // still clears it.
        this._pendingInlineBlockers.clear();
        this._actionableWarningsThisTurn.clear();
        this._codeQualityWarningsThisTurn.clear();
        // _turnSummary is deliberately NOT cleared here (#484 rework): the
        // summary entry is emitted once per RUN at the agent_settled quiet
        // window (sendMessage during a live stream would STEER the agent, and
        // turn_end can fire mid-stream), so the collector must accumulate
        // across the run's turns. It is cleared only by consume() at emit and
        // by resetForSession().
        this._turnStartProjectSeq = this._projectSeq;
        this._turnIndex += 1;
        this._writeIndex = 0;
        this._reportedThisTurn.clear();
    }
    get reportedThisTurn() {
        return this._reportedThisTurn;
    }
    nextWriteIndex() {
        this._writeIndex += 1;
        return this._writeIndex;
    }
    peekWriteIndex() {
        return this._writeIndex;
    }
    setTelemetryIdentity(identity) {
        if (identity.sessionId && identity.sessionId.trim()) {
            this._telemetrySessionId = identity.sessionId.trim();
        }
        const model = identity.model?.trim();
        const provider = identity.provider?.trim();
        if (model && provider) {
            this._telemetryModel = `${provider}/${model}`;
        }
        else if (model) {
            this._telemetryModel = model;
        }
        else if (provider) {
            this._telemetryModel = provider;
        }
    }
    get telemetrySessionId() {
        return this._telemetrySessionId;
    }
    /**
     * Pin the session identity to pi's STABLE session id and record why this
     * session started (#190). Called AFTER {@link resetForSession} (which assigns
     * a fresh random id), so the stable id — when pi provides one via
     * `ctx.sessionManager.getSessionId()` — wins and survives a quit→resume.
     */
    setSessionLifecycle(args) {
        if (args.sessionId && args.sessionId.trim()) {
            this._telemetrySessionId = args.sessionId.trim();
            this._hasStableSessionId = true;
        }
        this._lifecycleReason = args.reason;
    }
    /** Why the current session started: new | resume | fork | reload | startup. */
    get sessionLifecycleReason() {
        return this._lifecycleReason;
    }
    /** True once a stable pi session id has been pinned (vs the random fallback). */
    get hasStableSessionId() {
        return this._hasStableSessionId;
    }
    get telemetryModel() {
        return this._telemetryModel;
    }
    get turnIndex() {
        return this._turnIndex;
    }
    get projectSeq() {
        return this._projectSeq;
    }
    get turnStartProjectSeq() {
        return this._turnStartProjectSeq;
    }
    seedProjectSequence(projectSeq, fileSeqByPath) {
        this._projectSeq = Math.max(0, Math.floor(projectSeq));
        this._turnStartProjectSeq = this._projectSeq;
        this._fileSeq.clear();
        // Seeded per-file counters carry no projectSeq provenance, so start the
        // changed-since map empty; the graph fast path simply won't fire until an
        // in-process bump records a seq-stamped change (safe: falls back to sweep).
        this._fileLastProjectSeq.clear();
        for (const [filePath, seq] of fileSeqByPath ?? []) {
            this._fileSeq.set(normalizeMapKey(path.resolve(filePath)), Math.max(0, seq));
        }
    }
    bumpFileSeq(filePath) {
        const key = normalizeMapKey(path.resolve(filePath));
        this._projectSeq += 1;
        const fileSeq = (this._fileSeq.get(key) ?? 0) + 1;
        this._fileSeq.set(key, fileSeq);
        this._fileLastProjectSeq.set(key, this._projectSeq);
        return { projectSeq: this._projectSeq, fileSeq };
    }
    /**
     * Files whose most recent bump happened AFTER `seq` — i.e. every file the
     * review graph would need to re-ingest to catch up from a build taken at
     * projectSeq `seq` (#451). Returns NORMALIZED keys (normalizeMapKey +
     * path.resolve), the same form the builder's fileSignatures map uses, so the
     * caller can compare without re-normalizing.
     */
    getFilesChangedSince(seq) {
        const changed = [];
        for (const [key, lastSeq] of this._fileLastProjectSeq) {
            if (lastSeq > seq)
                changed.push(key);
        }
        return changed;
    }
    getFileSeq(filePath) {
        return this._fileSeq.get(normalizeMapKey(path.resolve(filePath))) ?? 0;
    }
    getFileSeqEntries() {
        return [...this._fileSeq.entries()];
    }
    get sessionGeneration() {
        return this._sessionGeneration;
    }
    isCurrentSession(generation) {
        return this._sessionGeneration === generation;
    }
    markStartupScanInFlight(name, generation) {
        this._startupScansInFlight.set(name, generation);
    }
    clearStartupScanInFlight(name, generation) {
        const owner = this._startupScansInFlight.get(name);
        if (owner === generation) {
            this._startupScansInFlight.delete(name);
        }
    }
    isStartupScanInFlight(name) {
        return this._startupScansInFlight.has(name);
    }
    formatPipelineCrashNotice(filePath, err) {
        const key = path.resolve(filePath);
        const count = (this._pipelineCrashCounts.get(key) ?? 0) + 1;
        this._pipelineCrashCounts.set(key, count);
        const message = err instanceof Error ? err.message : String(err);
        const shortMessage = message.split("\n")[0].slice(0, 220);
        const shouldSurface = count <= RUNTIME_CONFIG.crashNotice.alwaysShowFirstN ||
            count % RUNTIME_CONFIG.crashNotice.showEveryNth === 0;
        if (!shouldSurface)
            return "";
        return [
            "⚠️ pi-lens pipeline crashed while analyzing this write.",
            `File: ${path.basename(filePath)} | crash count this session: ${count}`,
            `Error: ${shortMessage}`,
            "Recovery: LSP service was reset. If this repeats, rerun with --no-lsp and report the file + stack.",
        ].join("\n");
    }
    getCrashEntries() {
        return Array.from(this._pipelineCrashCounts.entries());
    }
    get projectRoot() {
        return this._projectRoot;
    }
    set projectRoot(value) {
        this._projectRoot = normalizeMapKey(value);
    }
    get errorDebtBaseline() {
        return this._errorDebtBaseline;
    }
    set errorDebtBaseline(value) {
        this._errorDebtBaseline = value;
    }
    get cachedExports() {
        return this._cachedExports;
    }
    appendCascadeRun(run) {
        this._cascadeRuns.push(run);
    }
    appendCascadePromise(p) {
        this._pendingCascadeRuns.push(p);
    }
    /**
     * Drain the deferred cascade computes kicked off this turn (#450), racing them
     * against a bounded wait. Fulfilled runs feed the same accumulator as inline
     * runs (appendCascadeRun). A promise still pending at the cap is retained so a
     * late-resolving compute is picked up on the next turn_end rather than lost.
     * The stored promises never reject (pipeline guarantees an "error" skip-run).
     */
    async settleCascadeRuns(maxWaitMs) {
        const pending = this._pendingCascadeRuns;
        if (pending.length === 0)
            return { settled: 0, timedOut: 0 };
        this._pendingCascadeRuns = [];
        // Track per-promise settlement so promises still in flight at the cap can be
        // carried over. A settled entry records its run; an unsettled one is re-parked.
        const tracked = pending.map((p) => {
            const entry = { done: false, promise: p };
            entry.promise = p.then((run) => {
                entry.done = true;
                entry.run = run;
                return run;
            });
            return entry;
        });
        const timeout = new Promise((resolve) => {
            setTimeout(resolve, maxWaitMs).unref?.();
        });
        await Promise.race([
            Promise.allSettled(tracked.map((t) => t.promise)),
            timeout,
        ]);
        let settled = 0;
        let timedOut = 0;
        for (const entry of tracked) {
            if (entry.done && entry.run) {
                this.appendCascadeRun(entry.run);
                settled += 1;
            }
            else {
                this._pendingCascadeRuns.push(entry.promise);
                timedOut += 1;
            }
        }
        return { settled, timedOut };
    }
    consumeCascadeRuns() {
        const runs = this._cascadeRuns;
        this._cascadeRuns = [];
        return runs;
    }
    recordInlineBlockers(filePath, summary) {
        this._pendingInlineBlockers.set(path.resolve(filePath), {
            filePath,
            summary,
        });
    }
    clearInlineBlockers(filePath) {
        this._pendingInlineBlockers.delete(path.resolve(filePath));
    }
    consumeInlineBlockers() {
        const entries = [...this._pendingInlineBlockers.values()];
        this._pendingInlineBlockers.clear();
        return entries;
    }
    recordActionableWarnings(warnings) {
        for (const warning of warnings) {
            this._actionableWarningsThisTurn.set(warning.id, warning);
        }
    }
    peekActionableWarnings() {
        return [...this._actionableWarningsThisTurn.values()];
    }
    clearActionableWarnings() {
        this._actionableWarningsThisTurn.clear();
    }
    recordCodeQualityWarnings(warnings) {
        for (const warning of warnings) {
            this._codeQualityWarningsThisTurn.set(warning.id, warning);
        }
    }
    peekCodeQualityWarnings() {
        return [...this._codeQualityWarningsThisTurn.values()];
    }
    clearCodeQualityWarnings() {
        this._codeQualityWarningsThisTurn.clear();
    }
    /** #484: the per-run diagnostics/autofix/format collector (accumulates
     * across turns; consumed once at the agent_settled quiet window). Always
     * present; callers gate recording behind the `lens-turn-summary` opt-in
     * flag. */
    get turnSummary() {
        return this._turnSummary;
    }
    get complexityBaselines() {
        return this._complexityBaselines;
    }
    get fixedThisTurn() {
        return this._fixedThisTurn;
    }
    get projectRulesScan() {
        return this._projectRulesScan;
    }
    set projectRulesScan(value) {
        this._projectRulesScan = value;
    }
    get readGuard() {
        this._readGuard ??= new ReadGuard(this._telemetrySessionId);
        return this._readGuard;
    }
    /**
     * Queue `filePath` for deferred formatting at `agent_end`. Returns `true`
     * when this call created a NEW pending entry, `false` when it re-touched
     * an already-queued file. #673: the caller uses this to publish
     * `pilens:format:queued` only on first queue entry, so repeated edits to
     * the same already-queued file before `agent_end` don't spam the bus.
     */
    deferFormat(filePath, cwd, toolName, turnStateCwd) {
        const key = path.resolve(filePath);
        const now = Date.now();
        const existing = this._pendingDeferredFormatFiles.get(key);
        if (existing) {
            existing.lastTouchedAt = now;
            existing.cwd = cwd;
            existing.turnStateCwd = turnStateCwd;
            existing.toolNames.add(toolName);
            return false;
        }
        this._pendingDeferredFormatFiles.set(key, {
            filePath: key,
            cwd,
            turnStateCwd,
            firstTouchedAt: now,
            lastTouchedAt: now,
            toolNames: new Set([toolName]),
        });
        return true;
    }
    get pendingDeferredFormatCount() {
        return this._pendingDeferredFormatFiles.size;
    }
    consumeDeferredFormatFiles() {
        const records = [...this._pendingDeferredFormatFiles.values()];
        this._pendingDeferredFormatFiles.clear();
        return records;
    }
    shouldWarmLspOnRead(filePath, maxAgeMs = 120_000) {
        const state = this._lspReadWarmState.get(path.resolve(filePath));
        if (!state)
            return true;
        if (state.status === "warming")
            return false;
        return Date.now() - state.ts > maxAgeMs;
    }
    markLspReadWarmStarted(filePath) {
        this._lspReadWarmState.set(path.resolve(filePath), {
            status: "warming",
            ts: Date.now(),
        });
    }
    markLspReadWarmCompleted(filePath) {
        this._lspReadWarmState.set(path.resolve(filePath), {
            status: "ready",
            ts: Date.now(),
        });
    }
    clearLspReadWarmState(filePath) {
        this._lspReadWarmState.delete(path.resolve(filePath));
    }
}
