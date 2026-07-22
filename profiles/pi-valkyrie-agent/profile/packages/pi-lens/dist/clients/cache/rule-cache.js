/**
 * Rule Cache for pi-lens
 *
 * Provides disk-based caching for parsed tree-sitter rules with
 * automatic invalidation based on rule file modification times.
 */
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getProjectDataDir } from "../file-utils.js";
import { readJsonCache } from "../json-cache-read.js";
const CACHE_VERSION = "v3";
export class RuleCache {
    cacheFile;
    cacheDir;
    constructor(language, rootDir = process.cwd()) {
        this.cacheDir = path.join(getProjectDataDir(rootDir), "cache");
        this.cacheFile = path.join(this.cacheDir, `${language}-rules-${CACHE_VERSION}.json`);
    }
    ensureCacheDir() {
        if (!fs.existsSync(this.cacheDir)) {
            fs.mkdirSync(this.cacheDir, { recursive: true });
        }
    }
    computeRuleHash(ruleFiles) {
        const hash = crypto.createHash("sha256");
        for (const file of ruleFiles.sort((a, b) => a.localeCompare(b))) {
            if (fs.existsSync(file)) {
                const stat = fs.statSync(file);
                hash.update(`${file}:${stat.mtimeMs}:${stat.size}`);
            }
        }
        return hash.digest("hex").slice(0, 16);
    }
    get(ruleFiles) {
        try {
            this.ensureCacheDir();
            if (!fs.existsSync(this.cacheFile))
                return null;
            const currentHash = this.computeRuleHash(ruleFiles);
            const cached = readJsonCache(this.cacheFile, (parsed) => {
                const entry = parsed;
                if (entry.version !== CACHE_VERSION || entry.ruleHash !== currentHash) {
                    return undefined; // Cache invalid
                }
                return entry;
            });
            return cached ?? null;
        }
        catch {
            return null;
        }
    }
    set(ruleFiles, queries) {
        try {
            this.ensureCacheDir();
            const entry = {
                version: CACHE_VERSION,
                timestamp: Date.now(),
                ruleHash: this.computeRuleHash(ruleFiles),
                queries,
            };
            fs.writeFileSync(this.cacheFile, JSON.stringify(entry, null, 2));
        }
        catch {
            // Cache write failure is non-fatal
        }
    }
    clear() {
        try {
            if (fs.existsSync(this.cacheFile)) {
                fs.unlinkSync(this.cacheFile);
            }
        }
        catch {
            // Ignore
        }
    }
}
