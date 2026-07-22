/**
 * Tree-sitter Query Loader
 *
 * Loads tree-sitter queries from YAML files in rules/tree-sitter-queries/
 * and provides them to the TreeSitterClient.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { resolvePackagePath } from "./package-root.js";
export function isDisabledQueryDirectoryName(name) {
    return name.endsWith("-disabled");
}
export function getQueryLanguageKey(directoryName) {
    return isDisabledQueryDirectoryName(directoryName)
        ? directoryName.slice(0, -"-disabled".length)
        : directoryName;
}
export function isDisabledQueryFilePath(filePath) {
    const normalized = filePath.replaceAll("\\", "/");
    const parts = normalized.split("/").filter(Boolean);
    const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
    return isDisabledQueryDirectoryName(parent);
}
export class TreeSitterQueryLoader {
    queries = new Map();
    loaded = false;
    loadedRoot = null;
    verbose;
    constructor(verbose = false) {
        this.verbose = verbose;
    }
    /** Debug logging helper */
    dbg(msg) {
        if (this.verbose) {
            console.error(`[query-loader] ${msg}`);
        }
    }
    /**
     * Load all queries from the rules/tree-sitter-queries directory
     */
    async loadQueries(rootDir = process.cwd()) {
        const resolvedRoot = path.resolve(rootDir);
        if (this.loaded && this.loadedRoot === resolvedRoot)
            return this.queries;
        if (this.loadedRoot !== resolvedRoot) {
            this.queries.clear();
            this.loaded = false;
        }
        // Load from user's project rules AND package built-in rules (coexist)
        const queryDirs = [
            ...new Set([
                path.join(resolvedRoot, "rules", "tree-sitter-queries"),
                resolvePackagePath(import.meta.url, "rules", "tree-sitter-queries"),
            ]),
        ];
        for (const queriesDir of queryDirs) {
            if (!fs.existsSync(queriesDir)) {
                this.dbg(`Queries directory not found: ${queriesDir}`);
                continue;
            }
            const languageDirs = fs
                .readdirSync(queriesDir, { withFileTypes: true })
                .filter((d) => d.isDirectory())
                .map((d) => d.name);
            for (const lang of languageDirs) {
                const langDir = path.join(queriesDir, lang);
                const languageKey = getQueryLanguageKey(lang);
                const queryFiles = fs
                    .readdirSync(langDir)
                    .filter((f) => f.endsWith(".yml"));
                const langQueries = this.queries.get(languageKey) ?? [];
                for (const file of queryFiles) {
                    const filePath = path.join(langDir, file);
                    const query = this.parseQueryFile(filePath, languageKey);
                    if (query) {
                        langQueries.push(query);
                    }
                }
                if (langQueries.length > 0) {
                    this.queries.set(languageKey, langQueries);
                    this.dbg(`Loaded ${langQueries.length} queries for ${languageKey}`);
                }
            }
        }
        this.loaded = true;
        this.loadedRoot = resolvedRoot;
        return this.queries;
    }
    /**
     * Parse a single YAML query file
     */
    parseQueryFile(filePath, language) {
        try {
            const content = fs.readFileSync(filePath, "utf-8");
            // Simple YAML parsing (extract key: value pairs)
            const parsed = this.parseYaml(content);
            if (!parsed.id || !parsed.query) {
                this.dbg(`Invalid query file: ${filePath}`);
                return null;
            }
            return {
                id: String(parsed.id),
                name: String(parsed.name || parsed.id),
                severity: this.parseSeverity(parsed.severity),
                category: String(parsed.category || "general"),
                language: String(parsed.language || language),
                message: String(parsed.message || `Pattern: ${parsed.id}`),
                description: parsed.description
                    ? String(parsed.description)
                    : undefined,
                query: this.extractMultilineValue(content, "query") || String(parsed.query),
                metavars: Array.isArray(parsed.metavars)
                    ? parsed.metavars.map(String)
                    : this.extractMetavars(String(parsed.query)),
                post_filter: parsed.post_filter
                    ? String(parsed.post_filter)
                    : undefined,
                // biome-ignore lint/suspicious/noExplicitAny: Post filter params
                post_filter_params: parsed.post_filter_params,
                defect_class: parsed.defect_class
                    ? String(parsed.defect_class)
                    : undefined,
                inline_tier: parsed.inline_tier
                    ? String(parsed.inline_tier)
                    : undefined,
                skip_test_files: parsed.skip_test_files === true,
                // Parse predicates if present
                predicates: Array.isArray(parsed.predicates)
                    ? parsed.predicates.map((p) => ({
                        type: p.type,
                        var: p.var,
                        value: p.value,
                    }))
                    : undefined,
                tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : undefined,
                cwe: Array.isArray(parsed.cwe) ? parsed.cwe.map(String) : undefined,
                owasp: Array.isArray(parsed.owasp)
                    ? parsed.owasp.map(String)
                    : undefined,
                confidence: parsed.confidence
                    ? String(parsed.confidence)
                    : undefined,
                has_fix: parsed.has_fix === true || parsed.has_fix === "true",
                fix_action: parsed.fix_action ? String(parsed.fix_action) : undefined,
                filePath,
            };
        }
        catch (err) {
            this.dbg(`Failed to parse ${filePath}: ${err}`);
            return null;
        }
    }
    /**
     * Simple YAML parser for our query files
     */
    parseYaml(content) {
        const result = {};
        const lines = content.split("\n");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const match = line.match(/^([a-z_]+):\s*(.*)$/);
            if (match) {
                const key = match[1];
                let value = match[2].trim();
                // Handle arrays inline: metavars: [A, B, C]
                if (value.startsWith("[") && value.endsWith("]")) {
                    value = value
                        .slice(1, -1)
                        .split(",")
                        .map((s) => s.trim().replace(/^["']|["']$/g, ""));
                }
                // Handle multi-line arrays: metavars:\n  - A\n  - B
                // and nested objects: post_filter_params:\n  KEY: "value"
                else if (value === "") {
                    const arrayItems = [];
                    const nestedObj = {};
                    const baseIndent = line.match(/^(\s*)/)?.[0].length || 0;
                    for (let j = i + 1; j < lines.length; j++) {
                        const nextLine = lines[j];
                        const nextIndent = nextLine.match(/^(\s*)/)?.[0].length || 0;
                        // Stop if we hit a line with same or less indent (new key)
                        if (nextIndent <= baseIndent &&
                            nextLine.trim() !== "" &&
                            nextLine.match(/^\S/)) {
                            break;
                        }
                        // Check if it's an array item
                        const itemMatch = nextLine.match(/^\s+-\s*(.+)$/);
                        if (itemMatch) {
                            const item = itemMatch[1].trim().replace(/\s*#.*$/, "");
                            if (item)
                                arrayItems.push(item);
                            continue;
                        }
                        // Check if it's a nested key: value pair
                        const nestedMatch = nextLine.match(/^\s+(\w+):\s*(.+)$/);
                        if (nestedMatch) {
                            let nv = nestedMatch[2].trim();
                            if ((nv.startsWith('"') && nv.endsWith('"')) ||
                                (nv.startsWith("'") && nv.endsWith("'"))) {
                                nv = nv.slice(1, -1);
                            }
                            nestedObj[nestedMatch[1]] = nv;
                        }
                    }
                    if (arrayItems.length > 0) {
                        value = arrayItems;
                    }
                    else if (Object.keys(nestedObj).length > 0) {
                        // biome-ignore lint/suspicious/noExplicitAny: nested object from YAML
                        result[key] = nestedObj;
                        continue;
                    }
                }
                // Handle booleans
                else if (value === "true")
                    value = true;
                else if (value === "false")
                    value = false;
                // Strip quotes from strings
                else if (value.startsWith('"') && value.endsWith('"')) {
                    value = value.slice(1, -1);
                }
                result[key] = value;
            }
        }
        return result;
    }
    /**
     * Extract a multiline value (like query) from YAML
     */
    extractMultilineValue(content, key) {
        const lines = content.split("\n");
        let startLine = -1;
        let startIndent = 0;
        const keyPrefix = `${key}:`;
        // Find the key line
        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trimStart();
            if (trimmed.startsWith(keyPrefix)) {
                startLine = i;
                startIndent = lines[i].length - trimmed.length;
                const afterKey = trimmed.slice(keyPrefix.length).trim();
                // If there's content on the same line (not just |), return it
                if (afterKey && afterKey !== "|")
                    return afterKey;
                break;
            }
        }
        if (startLine === -1)
            return null;
        // Collect all lines until we hit a new key with same or less indent
        const valueLines = [];
        for (let i = startLine + 1; i < lines.length; i++) {
            const line = lines[i];
            // Track empty lines
            if (!line.trim()) {
                valueLines.push("");
                continue;
            }
            // Check indent
            const indentMatch = line.match(/^(\s*)/);
            const indent = indentMatch ? indentMatch[1].length : 0;
            const trimmed = line.trim();
            // Stop at new key with same or less indent (but not at comments)
            if (indent <= startIndent &&
                trimmed.match(/^[a-z_]+:/) &&
                !trimmed.startsWith("#")) {
                break;
            }
            // Skip YAML comment lines for most keys, but preserve native
            // tree-sitter predicate lines in query blocks (#eq?, #match?, ...).
            if (trimmed.startsWith("#") && key !== "query")
                continue;
            // This is part of the multiline value
            valueLines.push(line);
        }
        // Strip the common minimum indent (relative to startIndent).
        // YAML's `|` block scalar preserves content with consistent
        // indentation; we want to remove the leading whitespace that
        // was used for YAML formatting.
        // biome-ignore lint/suspicious/noExplicitAny: line iteration
        const nonEmpty = valueLines.filter((l) => l.trim().length > 0);
        if (nonEmpty.length > 0) {
            const minExtraIndent = Math.min(...nonEmpty.map((l) => {
                const m = l.match(/^(\s*)/);
                return (m?.[1].length ?? 0) - startIndent;
            }));
            for (let i = 0; i < valueLines.length; i++) {
                if (valueLines[i].trim().length === 0)
                    continue; // leave blank lines alone
                valueLines[i] = valueLines[i].slice(startIndent + Math.max(0, minExtraIndent));
            }
        }
        // Clean up - remove trailing empty lines
        while (valueLines.length > 0 && !valueLines[valueLines.length - 1].trim()) {
            valueLines.pop();
        }
        return valueLines.length > 0 ? valueLines.join("\n") : null;
    }
    /**
     * Parse severity string to valid type
     */
    parseSeverity(value) {
        if (value === "error")
            return "error";
        if (value === "warning")
            return "warning";
        if (value === "info")
            return "info";
        return "warning"; // default
    }
    /**
     * Extract @VAR patterns from query string
     */
    extractMetavars(query) {
        const matches = query.match(/@([A-Z_][A-Z0-9_]*)/g);
        if (!matches)
            return [];
        return [...new Set(matches.map((m) => m.slice(1)))];
    }
    /**
     * Get queries for a specific language
     */
    getQueriesForLanguage(language) {
        const all = this.queries.get(language) || [];
        // Exclude queries from <language>-disabled/ directories.
        // Disabled rules are loaded (needed by tests via getAllQueries)
        // but excluded from production dispatch.
        return all.filter((q) => !isDisabledQueryFilePath(q.filePath));
    }
    /**
     * Get a specific query by ID
     */
    getQueryById(id) {
        for (const langQueries of this.queries.values()) {
            const query = langQueries.find((q) => q.id === id);
            if (query)
                return query;
        }
        return undefined;
    }
    /**
     * Find matching query for a pattern string
     */
    findMatchingQuery(pattern, language) {
        const langQueries = this.getQueriesForLanguage(language);
        // Check for pattern keywords
        for (const query of langQueries) {
            // Match by ID
            if (pattern.includes(query.id))
                return query;
            // Match by keywords in pattern
            switch (query.id) {
                case "empty-catch":
                    if (pattern.includes("empty-catch") || pattern.includes("catch {}"))
                        return query;
                    break;
                case "debugger-statement":
                    if (pattern.includes("debugger"))
                        return query;
                    break;
                case "await-in-loop":
                    if (pattern.includes("await-in-loop") || pattern.includes("await"))
                        return query;
                    break;
                case "hardcoded-secrets":
                    if (pattern.includes("hardcoded") ||
                        pattern.includes("api_key") ||
                        pattern.includes("password"))
                        return query;
                    break;
                case "dangerously-set-inner-html":
                    if (pattern.includes("dangerously") || pattern.includes("innerHTML"))
                        return query;
                    break;
                case "nested-ternary":
                    if (pattern.includes("ternary") || pattern.includes("? :"))
                        return query;
                    break;
                case "no-eval":
                    if (pattern.includes("eval") && !pattern.includes("console"))
                        return query;
                    break;
                case "deep-promise-chain":
                    if (pattern.includes(".then") && pattern.includes(".catch"))
                        return query;
                    break;
                case "console-statement":
                    if (pattern.includes("console") && !pattern.includes("test"))
                        return query;
                    break;
                case "long-parameter-list":
                    if (pattern.includes("PARAMS"))
                        return query;
                    break;
                // Python queries
                case "bare-except":
                    if (pattern.includes("bare-except") || pattern.includes("except:"))
                        return query;
                    break;
                case "mutable-default-arg":
                    if (pattern.includes("mutable") || pattern.includes("default"))
                        return query;
                    break;
                case "wildcard-import":
                    if (pattern.includes("wildcard") || pattern.includes("import *"))
                        return query;
                    break;
                case "eval-exec":
                    if (pattern.includes("eval") || pattern.includes("exec"))
                        return query;
                    break;
                case "is-vs-equals":
                    if (pattern.includes("is") || pattern.includes("equals"))
                        return query;
                    break;
                case "unreachable-except":
                    if (pattern.includes("unreachable") || pattern.includes("except"))
                        return query;
                    break;
            }
        }
        return undefined;
    }
    /**
     * Get all loaded queries
     */
    getAllQueries() {
        const all = [];
        for (const queries of this.queries.values()) {
            all.push(...queries);
        }
        return all;
    }
    /**
     * Reload queries from disk
     */
    async reload() {
        this.queries.clear();
        this.loaded = false;
        await this.loadQueries();
    }
}
// Singleton instance
export const queryLoader = new TreeSitterQueryLoader();
