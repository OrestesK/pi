/**
 * Dependency Checker for pi-local
 *
 * Real-time circular dependency detection.
 * Caches the dependency graph and only re-scans when imports change.
 * Runs in the tool_result hook like ast-grep and Biome.
 *
 * Requires: npm install -D madge
 * Docs: https://github.com/pahen/madge
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { findNodeToolBinary } from "./package-manager.js";
import { safeSpawnAsync } from "./safe-spawn.js";
/**
 * Build madge's argv for a circular-dependency scan.
 *
 * Two correctness levers beyond the bare `--circular`:
 *   - `mjs,cjs` extensions: without them madge ignores explicit ESM/CJS files,
 *     dropping their edges from the graph.
 *   - `--ts-config <tsconfig.json>`: madge can only resolve TypeScript `paths`
 *     aliases (`@/foo`, `~/bar`) when pointed at the tsconfig. Without it those
 *     imports are silently unresolved, so cycles that route through an alias are
 *     MISSED (false negatives). Passed only when a tsconfig actually exists, so
 *     non-TS / alias-free projects are unaffected.
 */
export function buildMadgeArgs(target, projectRoot) {
    const args = ["--circular", "--extensions", "ts,tsx,js,jsx,mjs,cjs"];
    const tsConfig = path.join(projectRoot, "tsconfig.json");
    if (fs.existsSync(tsConfig)) {
        args.push("--ts-config", tsConfig);
    }
    // --warning surfaces files madge couldn't resolve into the graph (to stderr;
    // stdout JSON is unaffected). Without it those skips are SILENT — and a
    // skipped *local* file could hide a real cycle. We log them (see
    // parseMadgeSkips) instead of discarding stderr.
    args.push("--warning", "--json", target);
    return args;
}
/**
 * Parse madge's `--warning` stderr for skipped (unresolvable) files. External
 * package specifiers (bare names / subpaths like `web-tree-sitter`,
 * `vitest/config`) are expected — madge doesn't traverse node_modules. We flag
 * only **local** skips (relative/absolute paths), which are the ones that could
 * silently drop an internal edge and hide a cycle.
 *
 * @returns total skip count and the subset that look local.
 */
export function parseMadgeSkips(stderr) {
    const lines = (stderr || "").split(/\r?\n/);
    const headerIdx = lines.findIndex((l) => /Skipped\s+\d+\s+file/i.test(l));
    if (headerIdx === -1)
        return { total: 0, local: [] };
    const total = Number.parseInt(lines[headerIdx].match(/Skipped\s+(\d+)/i)?.[1] ?? "0", 10) ||
        0;
    const specifiers = lines
        .slice(headerIdx + 1)
        .map((l) => l.trim())
        .filter(Boolean);
    const local = specifiers.filter((s) => s.startsWith(".") || s.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(s));
    return { total, local };
}
// --- Client ---
export class DependencyChecker {
    available = null;
    ensureInFlight = null;
    checkInFlight = new Map();
    scanInFlight = new Map();
    log;
    // Cache: file path -> its imports
    importCache = new Map();
    // Circular deps: last known circular deps
    lastCircular = [];
    // Files that are part of a circular dependency
    circularFiles = new Set();
    constructor(verbose = false) {
        this.log = verbose
            ? (msg) => console.error(`[deps] ${msg}`)
            : () => { };
    }
    /**
     * Resolve how to invoke madge for `cwd`: a local/global-installed binary
     * (npm/pnpm/yarn/bun) if found, else `npx madge` (#375). `prefix` is prepended
     * to the madge args (empty for a resolved binary, `["madge"]` for the npx
     * fallback).
     */
    async resolveMadge(cwd) {
        const bin = await findNodeToolBinary("madge", cwd);
        return bin ? { cmd: bin, prefix: [] } : { cmd: "npx", prefix: ["madge"] };
    }
    /**
     * Check if madge is available, auto-install if not
     */
    async ensureAvailable() {
        // Fast path: already checked
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
    async doEnsureAvailable() {
        // Check if available in PATH
        const result = await safeSpawnAsync("madge", ["--version"], {
            timeout: 5000,
        });
        this.available = !result.error && result.status === 0;
        if (this.available) {
            this.log(`Madge found: ${result.stdout?.trim()}`);
            return true;
        }
        // Auto-install via pi-lens installer
        this.log("Madge not found, attempting auto-install...");
        const { ensureTool } = await import("./installer/index.js");
        const installedPath = await ensureTool("madge");
        if (installedPath) {
            this.log(`Madge auto-installed: ${installedPath}`);
            this.available = true;
            return true;
        }
        this.available = false;
        this.log("Madge auto-install failed");
        return false;
    }
    /**
     * Check if a file is part of a circular dependency (from cache)
     */
    isInCircular(filePath) {
        const normalized = path.resolve(filePath);
        return this.circularFiles.has(normalized);
    }
    /**
     * Get circular deps for a specific file
     */
    getCircularForFile(filePath) {
        const normalized = path.resolve(filePath);
        const deps = [];
        for (const dep of this.lastCircular) {
            if (dep.file === normalized || dep.path.includes(normalized)) {
                // Add the other files in the cycle
                for (const f of dep.path) {
                    if (f !== normalized) {
                        deps.push(path.relative(process.cwd(), f));
                    }
                }
            }
        }
        return Array.from(new Set(deps));
    }
    /**
     * Extract imports from a TypeScript/JavaScript file
     */
    extractImports(filePath) {
        const content = fs.readFileSync(filePath, "utf-8");
        const imports = new Set();
        // Match import statements: import ... from '...'
        const importPattern = /(?:import|export)\s+(?:.*?\s+from\s+)?['"]([^'"]+)['"]/g;
        const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
        let match;
        while ((match = importPattern.exec(content)) !== null) {
            if (match[1].startsWith(".")) {
                imports.add(match[1]);
            }
        }
        while ((match = requirePattern.exec(content)) !== null) {
            if (match[1].startsWith(".")) {
                imports.add(match[1]);
            }
        }
        return imports;
    }
    /**
     * Check if imports have changed for a file
     */
    importsChanged(filePath) {
        const normalized = path.resolve(filePath);
        if (!fs.existsSync(normalized)) {
            this.importCache.delete(normalized);
            return true;
        }
        const stat = fs.statSync(normalized);
        const cached = this.importCache.get(normalized);
        // Fast path: timestamp hasn't changed
        if (cached && cached.timestamp >= stat.mtimeMs) {
            return false;
        }
        // Compare actual imports
        const newImports = this.extractImports(normalized);
        const hasChanged = !cached || !this.setsEqual(cached.imports, newImports);
        // Update cache
        this.importCache.set(normalized, {
            imports: newImports,
            timestamp: stat.mtimeMs,
        });
        return hasChanged;
    }
    /**
     * Check if two sets have the same elements
     */
    setsEqual(a, b) {
        if (a.size !== b.size)
            return false;
        for (const item of a) {
            if (!b.has(item))
                return false;
        }
        return true;
    }
    /**
     * Quick circular dependency check using DFS on cached graph.
     * Only re-runs full madge check when imports change.
     */
    async checkFile(filePath, cwd) {
        const normalized = path.resolve(filePath);
        // Return early for non-existent files without running availability check
        if (!fs.existsSync(normalized)) {
            return {
                hasCircular: false,
                circular: [],
                checked: false,
                cacheHit: false,
            };
        }
        const projectRoot = path.resolve(cwd || process.cwd());
        // Check if imports changed before probing/installing madge.
        const importsChanged = this.importsChanged(normalized);
        if (!importsChanged) {
            // Return cached result
            return {
                hasCircular: this.circularFiles.has(normalized),
                circular: this.lastCircular.filter((d) => d.file === normalized || d.path.includes(normalized)),
                checked: true,
                cacheHit: true,
            };
        }
        if (!(await this.ensureAvailable())) {
            return {
                hasCircular: false,
                circular: [],
                checked: false,
                cacheHit: false,
            };
        }
        const key = `${projectRoot}:${normalized}`;
        const existing = this.checkInFlight.get(key);
        if (existing)
            return existing;
        const promise = this.runCheckFile(normalized, projectRoot).finally(() => {
            this.checkInFlight.delete(key);
        });
        this.checkInFlight.set(key, promise);
        return promise;
    }
    async runCheckFile(normalized, projectRoot) {
        this.log(`Imports changed for ${path.basename(normalized)}, checking dependencies...`);
        // Run madge on the specific file (fast)
        try {
            const { cmd, prefix } = await this.resolveMadge(projectRoot);
            const result = await safeSpawnAsync(cmd, [...prefix, ...buildMadgeArgs(normalized, projectRoot)], {
                timeout: 15000,
                cwd: projectRoot,
            });
            if (result.error) {
                this.log(`Check error: ${result.error.message}`);
                return {
                    hasCircular: false,
                    circular: [],
                    checked: false,
                    cacheHit: false,
                };
            }
            const output = result.stdout || "[]";
            const parsed = JSON.parse(output);
            // Madge --circular --json returns array of cycle arrays: [["a.ts", "b.ts"], ...]
            const cycles = Array.isArray(parsed) ? parsed : [];
            const circular = [];
            const circularFiles = new Set();
            for (const cycle of cycles) {
                const resolvedPaths = cycle.map((f) => path.resolve(projectRoot, f));
                for (const f of resolvedPaths) {
                    circularFiles.add(f);
                }
                circular.push({
                    file: resolvedPaths[0],
                    path: resolvedPaths,
                });
            }
            this.lastCircular = circular;
            this.circularFiles = circularFiles;
            const skips = parseMadgeSkips(result.stderr || "");
            if (skips.local.length > 0) {
                this.log(`madge skipped ${skips.local.length} local file(s) (possible silent cycle-miss): ${skips.local.slice(0, 5).join(", ")}`);
            }
            return {
                hasCircular: circular.length > 0,
                circular: circular.filter((d) => d.file === normalized || d.path.includes(normalized)),
                checked: true,
                cacheHit: false,
                localSkips: skips.local.length,
            };
        }
        catch (err) {
            this.log(`Check error: ${err.message}`);
            return {
                hasCircular: false,
                circular: [],
                checked: false,
                cacheHit: false,
            };
        }
    }
    /**
     * Format circular dependency warning for LLM
     */
    formatWarning(filePath, deps) {
        if (deps.length === 0)
            return "";
        const filename = path.basename(filePath);
        const depNames = deps.map((d) => path.basename(d));
        let output = `[Circular Deps] ${filename} is in a cycle:\n`;
        output += `  ${filename} ↔ ${depNames.join(", ")}\n`;
        output += `\n  Consider extracting shared code to a separate module.\n`;
        return output;
    }
    /**
     * Full project scan (for /check-deps command)
     */
    async scanProject(cwd) {
        const projectRoot = path.resolve(cwd || process.cwd());
        // Return early for non-existent or empty directories before probing/installing.
        if (!fs.existsSync(projectRoot)) {
            return { circular: [], count: 0 };
        }
        const entries = fs.readdirSync(projectRoot);
        const hasSourceFiles = entries.some((e) => /\.(ts|tsx|js|jsx)$/.test(e) && !e.endsWith(".d.ts"));
        if (!hasSourceFiles) {
            return { circular: [], count: 0 };
        }
        if (!(await this.ensureAvailable())) {
            return { circular: [], count: 0 };
        }
        const existing = this.scanInFlight.get(projectRoot);
        if (existing)
            return existing;
        const promise = this.runScanProject(projectRoot).finally(() => {
            this.scanInFlight.delete(projectRoot);
        });
        this.scanInFlight.set(projectRoot, promise);
        return promise;
    }
    async runScanProject(projectRoot) {
        try {
            const { cmd, prefix } = await this.resolveMadge(projectRoot);
            const result = await safeSpawnAsync(cmd, [...prefix, ...buildMadgeArgs(projectRoot, projectRoot)], {
                timeout: 30000,
                cwd: projectRoot,
            });
            if (result.error) {
                this.log(`Scan error: ${result.error.message}`);
                return { circular: [], count: 0 };
            }
            const output = result.stdout || "{}";
            const data = JSON.parse(output);
            const circular = [];
            const circularFiles = new Set();
            for (const [file, deps] of Object.entries(data)) {
                if (Array.isArray(deps) && deps.length > 0) {
                    const resolvedFile = path.resolve(file);
                    circularFiles.add(resolvedFile);
                    circular.push({
                        file: resolvedFile,
                        path: [resolvedFile, ...deps.map((d) => path.resolve(d))],
                    });
                }
            }
            this.lastCircular = circular;
            this.circularFiles = circularFiles;
            return { circular, count: circular.length };
        }
        catch (err) {
            this.log(`Scan error: ${err.message}`);
            return { circular: [], count: 0 };
        }
    }
    /**
     * Format full scan results
     */
    formatScanResult(circular) {
        if (circular.length === 0)
            return "";
        // Group by cycle to avoid duplicate entries
        const seen = new Set();
        let output = `[Circular Deps] ${circular.length} cycle(s) found:\n`;
        for (const dep of circular) {
            const cycleKey = dep.path.sort((a, b) => a.localeCompare(b)).join("→");
            if (seen.has(cycleKey))
                continue;
            seen.add(cycleKey);
            const names = dep.path.map((p) => path.relative(process.cwd(), p));
            output += `  • ${names.join(" → ")}\n`;
        }
        output += "\n  Consider extracting shared code to break cycles.\n";
        return output;
    }
}
