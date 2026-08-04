/**
 * YAML Rule Parser for ast-grep
 *
 * Parses simplified YAML rule files for structural code analysis.
 * Supports pattern matching, kind matching, and structured conditions
 * (has/any/all/not/regex).
 *
 * Features:
 * - Mtime caching for bundled rules; content/path caching for project rules
 * - Severity filtering (error-only for blocking mode)
 * - Complexity scoring for performance optimization
 * - Overly broad pattern detection
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import yaml from "../../deps/js-yaml.js";
// --- Constants ---
/** Overly broad patterns that match everything (cause false positive explosions) */
export const OVERLY_BROAD_PATTERNS = [
    "$NAME",
    "$FIELD",
    "$_",
    "$X",
    "$VAR",
    "$EXPR",
];
/** Maximum complexity score for rules in blockingOnly mode */
export const MAX_BLOCKING_RULE_COMPLEXITY = 8;
// --- Caches ---
const rulesCache = new Map();
const blockingRulesCache = new Map();
const contentRulesCache = new Map();
const contentBlockingRulesCache = new Map();
// --- Public API ---
export function clearRulesCache() {
    rulesCache.clear();
    blockingRulesCache.clear();
    contentRulesCache.clear();
    contentBlockingRulesCache.clear();
}
export function loadYamlRules(ruleDir, severityFilter) {
    return getCachedRules(ruleDir, severityFilter);
}
function findYamlRuleFiles(ruleDir) {
    let entries;
    try {
        entries = fs
            .readdirSync(ruleDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name));
    }
    catch {
        return [];
    }
    const files = [];
    for (const entry of entries) {
        const full = path.join(ruleDir, entry.name);
        if (entry.isDirectory()) {
            files.push(...findYamlRuleFiles(full));
        }
        else if (entry.isFile() && /\.ya?ml$/i.test(entry.name)) {
            files.push(full);
        }
    }
    return files;
}
function loadYamlRuleFiles(files, severityFilter) {
    const rules = [];
    for (const file of files) {
        let content;
        try {
            content = fs.readFileSync(file, "utf-8");
        }
        catch {
            continue;
        }
        const documents = content.split(/^---\s*$/m).filter((doc) => doc.trim());
        for (const document of documents) {
            const rule = parseSimpleYaml(document.trim());
            if (!rule?.id)
                continue;
            if (severityFilter && rule.severity !== severityFilter)
                continue;
            rules.push(rule);
        }
    }
    return rules;
}
export function loadYamlRulesUncached(ruleDir, severityFilter) {
    return loadYamlRuleFiles(findYamlRuleFiles(ruleDir), severityFilter);
}
/** Content/path-aware cache used for mutable project-owned rule trees. */
export function loadYamlRulesFresh(ruleDir, severityFilter) {
    const files = findYamlRuleFiles(ruleDir);
    const hash = createHash("sha256");
    for (const file of files) {
        hash.update(path.relative(ruleDir, file));
        hash.update("\0");
        try {
            hash.update(fs.readFileSync(file));
        }
        catch {
            hash.update("missing");
        }
        hash.update("\0");
    }
    const signature = hash.digest("hex");
    const cache = severityFilter === "error"
        ? contentBlockingRulesCache
        : contentRulesCache;
    const cached = cache.get(ruleDir);
    if (cached?.signature === signature)
        return cached.rules;
    const rules = loadYamlRuleFiles(files, severityFilter);
    cache.set(ruleDir, { rules, signature });
    return rules;
}
export function getCachedRules(ruleDir, severityFilter) {
    if (!fs.existsSync(ruleDir)) {
        return [];
    }
    let currentMtime = 0;
    try {
        currentMtime = fs.statSync(ruleDir).mtimeMs;
    }
    catch {
        return [];
    }
    const cache = severityFilter === "error" ? blockingRulesCache : rulesCache;
    const cached = cache.get(ruleDir);
    if (cached && cached.mtime === currentMtime) {
        return cached.rules;
    }
    const rules = loadYamlRulesUncached(ruleDir, severityFilter);
    cache.set(ruleDir, { rules, mtime: currentMtime });
    return rules;
}
export function isOverlyBroadPattern(pattern) {
    // The rich pattern form ({context, selector, ...}) is structured and never a
    // single-metavar trap; only string patterns can be overly-broad literals.
    if (!pattern)
        return false;
    if (typeof pattern !== "string")
        return false;
    if (OVERLY_BROAD_PATTERNS.includes(pattern.trim()))
        return true;
    return /^\$[A-Z_]+$/i.test(pattern.trim());
}
export function isValidCondition(condition) {
    if (!condition)
        return false;
    if (condition.all !== undefined && condition.all.length === 0)
        return false;
    if (condition.any !== undefined && condition.any.length === 0)
        return false;
    if (isOverlyBroadPattern(condition.pattern))
        return false;
    return true;
}
export function isStructuredRule(rule) {
    if (!rule.rule)
        return false;
    // The rich pattern form ({context, selector, …}) is itself a structured
    // match — it specifies a context snippet plus the AST node to pick out.
    // Without recognizing it as structure, an otherwise-rich rule with only
    // `pattern: {context, selector}` and no other combinators would be wrongly
    // classified as "unstructured single-metavar" and dropped by the runner.
    const hasRichPattern = typeof rule.rule.pattern === "object" && rule.rule.pattern !== null;
    return !!(hasRichPattern ||
        rule.rule.has ||
        rule.rule.any ||
        rule.rule.all ||
        rule.rule.not ||
        rule.rule.regex);
}
export function calculateRuleComplexity(condition) {
    if (!condition)
        return 0;
    let score = 0;
    if (condition.has)
        score += 3;
    if (condition.not)
        score += 2;
    if (condition.regex)
        score += 2;
    if (condition.any)
        score += condition.any.length * 2;
    if (condition.all)
        score += condition.all.length * 3;
    if (condition.has)
        score += calculateRuleComplexity(condition.has);
    if (condition.not)
        score += calculateRuleComplexity(condition.not);
    if (condition.any) {
        for (const sub of condition.any)
            score += calculateRuleComplexity(sub);
    }
    if (condition.all) {
        for (const sub of condition.all)
            score += calculateRuleComplexity(sub);
    }
    return score;
}
// --- YAML Parser ---
/**
 * Parse a single YAML rule document into a {@link YamlRule}.
 *
 * Uses `js-yaml` so the full ast-grep rule grammar — nested `any`/`all`/`has`,
 * `field`/`inside`/`stopBy`, and metavariable `constraints` — survives intact and
 * can be handed straight to napi's native engine. (The former hand-rolled parser
 * flattened nested structures and dropped constraints, which is why those rules
 * had to be skipped; see #206.) A malformed document returns `null` rather than
 * throwing, so callers skip just that rule.
 */
export function parseSimpleYaml(content) {
    let parsed;
    try {
        parsed = yaml.load(content);
    }
    catch {
        return null;
    }
    if (!parsed || typeof parsed !== "object")
        return null;
    const rule = parsed;
    return rule.id ? rule : null;
}
