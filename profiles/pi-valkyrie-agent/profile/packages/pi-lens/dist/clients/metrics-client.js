/**
 * Silent Metrics Client for pi-lens
 *
 * Tracks code quality metrics silently during the session.
 * Metrics are aggregated and shown in session summary only.
 *
 * Tracks:
 * - Code Entropy: Shannon entropy delta per file
 *
 * These are observational metrics — they inform the human in session summary,
 * they don't gate or interrupt the agent mid-task.
 */
import * as fs from "node:fs";
import * as path from "node:path";
// --- Client ---
export class MetricsClient {
    log;
    fileBaselines = new Map();
    constructor(verbose = false) {
        this.log = verbose
            ? (msg) => console.error(`[metrics] ${msg}`)
            : () => { };
    }
    /**
     * Record initial state of a file when first touched this session
     */
    recordBaseline(filePath) {
        const absolutePath = path.resolve(filePath);
        if (!fs.existsSync(absolutePath))
            return;
        if (this.fileBaselines.has(absolutePath))
            return; // Already recorded
        const content = fs.readFileSync(absolutePath, "utf-8");
        const entropy = this.calculateEntropy(content);
        this.fileBaselines.set(absolutePath, { content, entropy });
        this.log(`Baseline recorded: ${path.basename(filePath)} (entropy: ${entropy.toFixed(2)})`);
    }
    /**
     * Get metrics for a specific file
     */
    getFileMetrics(filePath) {
        const absolutePath = path.resolve(filePath);
        const baseline = this.fileBaselines.get(absolutePath);
        if (!baseline)
            return null;
        if (!fs.existsSync(absolutePath))
            return null;
        const currentContent = fs.readFileSync(absolutePath, "utf-8");
        const totalLines = currentContent.split("\n").length;
        const entropyCurrent = this.calculateEntropy(currentContent);
        const entropyDelta = entropyCurrent - baseline.entropy;
        return {
            filePath: path.relative(process.cwd(), absolutePath),
            totalLines,
            entropyStart: baseline.entropy,
            entropyCurrent,
            entropyDelta,
        };
    }
    /**
     * Get entropy delta for all touched files
     */
    getEntropyDeltas() {
        const results = [];
        for (const [filePath, baseline] of this.fileBaselines) {
            if (!fs.existsSync(filePath))
                continue;
            const content = fs.readFileSync(filePath, "utf-8");
            const current = this.calculateEntropy(content);
            const delta = current - baseline.entropy;
            results.push({
                file: path.relative(process.cwd(), filePath),
                start: baseline.entropy,
                current,
                delta,
            });
        }
        return results.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }
    /**
     * Calculate Shannon entropy of a string
     * Returns bits per character
     */
    calculateEntropy(text) {
        if (text.length === 0)
            return 0;
        const freq = new Map();
        for (const char of text) {
            freq.set(char, (freq.get(char) || 0) + 1);
        }
        let entropy = 0;
        const len = text.length;
        for (const count of freq.values()) {
            const p = count / len;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }
        return entropy;
    }
    /**
     * Reset session state (for new session)
     */
    reset() {
        this.fileBaselines.clear();
        this.log("Session metrics reset");
    }
}
