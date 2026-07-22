/**
 * AstGrep Client for pi-lens
 *
 * Structural code analysis using ast-grep CLI.
 * Scans files against YAML rule definitions.
 *
 * Requires: npm install -D @ast-grep/cli
 * Rules: ./rules/ directory
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { AstGrepRuleManager } from "./ast-grep-rule-manager.js";
import { resolvePackagePath } from "./package-root.js";
import { SgRunner } from "./sg-runner.js";
// --- Client ---
function extractDebugAst(raw) {
    const lines = raw.split(/\r?\n/);
    const start = lines.findIndex((line) => /^Debug (?:A|C)ST:/.test(line.trim()));
    if (start < 0)
        return undefined;
    const out = [];
    for (const line of lines.slice(start + 1)) {
        if (!line.trim())
            break;
        out.push(line);
    }
    return out.length > 0 ? out.join("\n") : undefined;
}
function lineStartOffsets(source) {
    const offsets = [0];
    for (let index = 0; index < source.length; index++) {
        if (source.charCodeAt(index) === 10)
            offsets.push(index + 1);
    }
    return offsets;
}
function snippetForRange(source, offsets, startLine0, startCol0, endLine0, endCol0) {
    const start = (offsets[startLine0] ?? 0) + startCol0;
    const end = (offsets[endLine0] ?? source.length) + endCol0;
    const text = source.slice(start, end).replace(/\s+/g, " ").trim();
    return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}
const MAX_VALIDATE_PATTERN_CHARS = 20_000;
const MAX_VALIDATE_RULE_CHARS = 200_000;
const VALIDATION_SNIPPETS = {
    bash: { ext: "sh", source: "echo pi_lens_validate\n" },
    c: { ext: "c", source: "int main(void) { return 0; }\n" },
    cpp: { ext: "cpp", source: "int main() { return 0; }\n" },
    csharp: { ext: "cs", source: "class C { static void Main() {} }\n" },
    css: { ext: "css", source: ".pi-lens { color: black; }\n" },
    go: { ext: "go", source: "package main\nfunc main() {}\n" },
    html: { ext: "html", source: "<main>pi-lens</main>\n" },
    java: { ext: "java", source: "class Main { void run() {} }\n" },
    javascript: { ext: "js", source: "const piLensValidate = 1;\n" },
    json: { ext: "json", source: "{\"piLensValidate\":true}\n" },
    kotlin: { ext: "kt", source: "fun main() {}\n" },
    lua: { ext: "lua", source: "local pi_lens_validate = 1\n" },
    php: { ext: "php", source: "<?php $piLensValidate = 1;\n" },
    python: { ext: "py", source: "pi_lens_validate = 1\n" },
    ruby: { ext: "rb", source: "pi_lens_validate = 1\n" },
    rust: { ext: "rs", source: "fn main() {}\n" },
    tsx: { ext: "tsx", source: "export function App() { return <div />; }\n" },
    typescript: { ext: "ts", source: "const piLensValidate = 1;\n" },
    yaml: { ext: "yaml", source: "piLensValidate: true\n" },
};
function validationSnippetFor(language) {
    const key = language.toLowerCase().replace(/^"|"$/g, "");
    return VALIDATION_SNIPPETS[key] ?? { ext: key.replace(/[^a-z0-9_-]/gi, "") || "txt", source: "pi_lens_validate\n" };
}
function validateInputShape(value, maxChars, label) {
    if (value.includes("\0"))
        return `${label} contains NUL bytes`;
    if (value.length > maxChars) {
        return `${label} is too large (${value.length} chars, max ${maxChars})`;
    }
    return undefined;
}
function stderrHasError(stderr) {
    return stderr.split(/\r?\n/).some((line) => /^\s*(error|Error):/.test(line));
}
function formatDebugAst(tree, source) {
    const offsets = lineStartOffsets(source);
    return tree
        .split(/\r\n|\n/)
        .map((line) => {
        const match = /^([ \t]*)([^ \t(][^(]*)? \((\d+),(\d+)\)-\((\d+),(\d+)\)$/.exec(line);
        if (!match)
            return line;
        const [, indent = "", label = "", startLine, startCol, endLine, endCol] = match;
        const sl = Number(startLine);
        const sc = Number(startCol);
        const el = Number(endLine);
        const ec = Number(endCol);
        const snippet = snippetForRange(source, offsets, sl, sc, el, ec);
        return `${indent}${label} [${sl + 1},${sc + 1}] - [${el + 1},${ec + 1}] ${JSON.stringify(snippet)}`;
    })
        .join("\n");
}
export class AstGrepClient {
    ruleDir;
    log;
    ruleManager;
    runner;
    constructor(ruleDir, verbose = false) {
        const projectRuleDir = path.join(process.cwd(), "rules");
        this.ruleDir =
            ruleDir ||
                (fs.existsSync(projectRuleDir)
                    ? projectRuleDir
                    : resolvePackagePath(import.meta.url, "rules"));
        this.log = verbose
            ? (msg) => console.error(`[ast-grep] ${msg}`)
            : () => { };
        this.ruleManager = new AstGrepRuleManager(this.ruleDir, this.log);
        this.runner = new SgRunner(verbose);
    }
    /**
     * Check if ast-grep CLI is available, auto-install if not
     */
    ensureAvailable() {
        return this.runner.ensureAvailable();
    }
    /**
     * Replace using a raw YAML rule that includes a `fix:` field (Phase 3/4 of #125).
     * Dry-run returns matches for preview; apply writes fixes to disk.
     */
    async replaceWithRule(ruleYaml, paths, apply) {
        const allMatches = [];
        for (const scanPath of paths) {
            if (apply) {
                // Stale-preview check: dry-run first
                const preCheck = await this.runner.tempScanAsync(scanPath, "agent-rule", ruleYaml);
                if (preCheck.length === 0) {
                    return {
                        matches: [],
                        totalMatches: 0,
                        applied: false,
                        stalePreview: true,
                    };
                }
            }
            const result = await this.runner.tempScanWithFixAsync(scanPath, "agent-rule", ruleYaml, apply);
            if (result.error) {
                return {
                    matches: allMatches,
                    totalMatches: allMatches.length,
                    applied: false,
                    error: result.error,
                };
            }
            allMatches.push(...result.matches);
        }
        return {
            matches: allMatches,
            totalMatches: allMatches.length,
            applied: apply,
        };
    }
    /**
     * Search using a raw YAML rule (Phase 4 of #125).
     * Routes through sg scan --config rather than sg run -p.
     * Each path is scanned independently; results are merged.
     */
    async searchWithRule(ruleYaml, paths) {
        const allMatches = [];
        for (const scanPath of paths) {
            try {
                const results = await this.runner.tempScanAsync(scanPath, "agent-rule", ruleYaml);
                allMatches.push(...results);
            }
            catch (err) {
                return {
                    matches: allMatches,
                    totalMatches: allMatches.length,
                    error: String(err),
                };
            }
        }
        return { matches: allMatches, totalMatches: allMatches.length };
    }
    /**
     * Dump the parsed tree-sitter AST for a snippet using ast-grep CLI.
     */
    async dumpAst(source, lang, options = {}) {
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-ast-dump-"));
        const tmpFile = path.join(tmpDir, `snippet.${lang.replace(/[^a-z0-9_-]/gi, "") || "txt"}`);
        try {
            fs.writeFileSync(tmpFile, source, "utf-8");
            const mode = options.includeAnonymous ? "cst" : "ast";
            const result = await this.runner.execRaw([
                "run",
                "--lang",
                lang,
                "-p",
                source,
                `--debug-query=${mode}`,
                tmpFile,
            ]);
            const raw = result.stderr || result.stdout;
            const tree = extractDebugAst(raw);
            if (tree)
                return { output: formatDebugAst(tree, source) };
            return {
                error: result.error ||
                    result.stderr.trim() ||
                    result.stdout.trim() ||
                    `ast-grep did not return a debug AST for language ${lang}`,
            };
        }
        finally {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    }
    async validatePattern(pattern, lang, options) {
        const shapeError = validateInputShape(pattern, MAX_VALIDATE_PATTERN_CHARS, "pattern");
        if (shapeError)
            return { valid: false, error: shapeError };
        const snippet = validationSnippetFor(lang);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-sg-validate-"));
        const tmpFile = path.join(tmpDir, `snippet.${snippet.ext}`);
        try {
            fs.writeFileSync(tmpFile, snippet.source, "utf-8");
            const args = ["run", "-p", pattern, "--lang", lang, "--json=compact"];
            if (options?.selector)
                args.push("--selector", options.selector);
            if (options?.strictness)
                args.push("--strictness", options.strictness);
            args.push(tmpFile);
            const result = await this.runner.execRaw(args);
            const stderr = result.stderr.trim();
            const stdout = result.stdout.trim();
            if (result.error)
                return { valid: false, error: result.error };
            if (stderrHasError(stderr))
                return { valid: false, error: stderr };
            const warning = stderr || stdout || undefined;
            return {
                valid: true,
                ...(warning ? { warning } : {}),
            };
        }
        finally {
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
            catch {
                // Best-effort cleanup; never mask the validation result.
            }
        }
    }
    async validateRule(ruleYaml) {
        const shapeError = validateInputShape(ruleYaml, MAX_VALIDATE_RULE_CHARS, "rule");
        if (shapeError)
            return { valid: false, error: shapeError };
        const language = /^\s*language:\s*([^\s#]+)/im.exec(ruleYaml)?.[1] ?? "typescript";
        const snippet = validationSnippetFor(language);
        const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-lens-sg-rule-"));
        try {
            fs.writeFileSync(path.join(tmpDir, `snippet.${snippet.ext}`), snippet.source, "utf-8");
            await this.runner.tempScanAsync(tmpDir, "agent-rule", ruleYaml, 10000);
            return { valid: true };
        }
        catch (err) {
            return { valid: false, error: String(err) };
        }
        finally {
            try {
                fs.rmSync(tmpDir, { recursive: true, force: true });
            }
            catch {
                // Best-effort cleanup; never mask the validation result.
            }
        }
    }
    /**
     * Syntax-only code outline via `ast-grep outline` (#311) — symbols, imports,
     * exports, and members for file or directory input. Raw, fast, no index/LSP;
     * complements module_report (which adds the cached graph's who-uses-this,
     * complexity, and blast radius). Returns parsed JSON; args go through
     * `execRaw` (execFile-style, no shell), so no interpolation risk.
     */
    async outline(paths, options = {}) {
        if (paths.length === 0)
            return { error: "no paths provided" };
        const args = ["outline", "--json=compact", "--color", "never"];
        if (options.lang)
            args.push("--lang", options.lang);
        if (options.items)
            args.push("--items", options.items);
        if (options.view)
            args.push("--view", options.view);
        if (options.types?.length)
            args.push("--type", options.types.join(","));
        if (options.match)
            args.push("--match", options.match);
        if (options.pubMembers)
            args.push("--pub-members");
        for (const glob of options.globs ?? [])
            args.push("--globs", glob);
        args.push(...paths);
        const result = await this.runner.execRaw(args);
        const raw = (result.stdout ?? "").trim();
        if (!raw) {
            return {
                error: result.error ||
                    result.stderr?.trim() ||
                    "ast-grep outline returned no output",
            };
        }
        try {
            return { output: JSON.parse(raw) };
        }
        catch (err) {
            return {
                error: `failed to parse ast-grep outline JSON: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    }
    /**
     * Search for AST patterns in files
     */
    async search(pattern, lang, paths, options) {
        const args = ["run", "-p", pattern, "--lang", lang, "--json=compact"];
        if (options?.selector) {
            args.push("--selector", options.selector);
        }
        if (options?.context !== undefined) {
            args.push("--context", String(options.context));
        }
        if (options?.strictness) {
            args.push("--strictness", options.strictness);
        }
        args.push(...paths);
        const result = await this.runner.exec(args);
        return {
            matches: result.matches,
            totalMatches: result.totalMatches,
            truncated: result.truncated,
            error: result.error,
        };
    }
    /**
     * Search and replace AST patterns
     */
    async replace(pattern, rewrite, lang, paths, apply = false, options) {
        const baseArgs = ["run", "-p", pattern, "-r", rewrite, "--lang", lang];
        if (options?.strictness) {
            baseArgs.push("--strictness", options.strictness);
        }
        if (!apply) {
            // Dry-run: --json=compact shows what would change without writing
            const result = await this.runner.exec([
                ...baseArgs,
                "--json=compact",
                ...paths,
            ]);
            return {
                matches: result.matches,
                totalMatches: result.totalMatches,
                truncated: result.truncated,
                applied: false,
                error: result.error,
            };
        }
        // Stale-preview check: re-run dry-run before writing.
        // If the pattern no longer matches, the files changed since the preview.
        const preCheck = await this.runner.exec([
            ...baseArgs,
            "--json=compact",
            ...paths,
        ]);
        if (preCheck.error) {
            return {
                matches: [],
                totalMatches: 0,
                truncated: false,
                applied: false,
                error: preCheck.error,
            };
        }
        if (preCheck.matches.length === 0) {
            return {
                matches: [],
                totalMatches: 0,
                truncated: false,
                applied: false,
                stalePreview: true,
            };
        }
        // Apply: --update-all writes the files. We do NOT recount afterwards —
        // the original pattern no longer matches post-rewrite, and searching for
        // the rewrite as a pattern is unreliable (multi-line rewrites and
        // metavariable substitutions don't round-trip into a valid search
        // pattern, yielding a false "0 matches" even on a successful apply).
        // preCheck above already captured exactly what matched and was rewritten.
        const applyResult = await this.runner.exec([
            ...baseArgs,
            "--update-all",
            ...paths,
        ]);
        if (applyResult.error) {
            return {
                matches: [],
                totalMatches: 0,
                truncated: false,
                applied: false,
                error: applyResult.error,
            };
        }
        return {
            matches: preCheck.matches,
            totalMatches: preCheck.totalMatches,
            truncated: preCheck.truncated,
            applied: true,
            error: undefined,
        };
    }
    /**
     * Run a one-off scan with a temporary rule and configuration
     */
    async runTempScanAsync(dir, ruleId, ruleYaml, timeout = 30000) {
        if (!(await this.ensureAvailable()))
            return [];
        return this.runner.tempScanAsync(dir, ruleId, ruleYaml, timeout);
    }
    /**
     * Find similar functions by comparing normalized AST structure
     */
    async findSimilarFunctions(dir, lang = "typescript") {
        const ruleYaml = `id: find-functions
language: ${lang}
rule:
  kind: function_declaration
severity: info
message: found
`;
        const matches = await this.runTempScanAsync(dir, "find-functions", ruleYaml);
        if (matches.length === 0)
            return [];
        return this.groupSimilarFunctions(matches);
    }
    groupSimilarFunctions(matches) {
        const grouped = new Map();
        for (const item of matches) {
            const name = this.extractFunctionName(item.text);
            if (!name)
                continue;
            const signature = this.normalizeFunction(item.text);
            const line = (item.range?.start?.line || item.labels?.[0]?.range?.start?.line || 0) +
                1;
            const group = grouped.get(signature) ?? [];
            group.push({ name, file: item.file, line });
            grouped.set(signature, group);
        }
        return Array.from(grouped.entries())
            .filter(([_, functions]) => functions.length > 1)
            .map(([pattern, functions]) => ({ pattern, functions }));
    }
    /**
     * Extract function name from match text
     */
    extractFunctionName(text) {
        return text.match(/function\s+(\w+)/)?.[1] ?? null;
    }
    normalizeFunction(text) {
        const normalizedText = text
            .replace(/function\s+\w+/, "function FN")
            .replace(/\bconst\b|\blet\b|\bvar\b/g, "VAR")
            .replace(/["'].*?["']/g, "STR")
            .replace(/`[^`]*`/g, "TMPL")
            .replace(/\b\d+\b/g, "NUM")
            .replace(/\btrue\b|\bfalse\b/g, "BOOL")
            .replace(/\/\/.*/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "")
            .replace(/\s+/g, " ")
            .trim();
        // Extract just the body structure
        const bodyMatch = normalizedText.match(/\{(.*)\}/);
        const body = bodyMatch ? bodyMatch[1].trim() : normalizedText;
        // Use first 200 chars as signature
        return body.slice(0, 200);
    }
    /**
     * Scan for exported function names in a directory
     */
    async scanExports(dir, lang = "typescript") {
        const exports = new Map();
        const ruleYaml = `id: find-functions
language: ${lang}
rule:
  kind: function_declaration
severity: info
message: found
`;
        const matches = await this.runTempScanAsync(dir, "find-functions", ruleYaml, 15000);
        this.log(`scanExports output length: ${matches.length}`);
        for (const item of matches) {
            const text = item.text || "";
            const nameMatch = text.match(/function\s+(\w+)/);
            if (nameMatch?.[1]) {
                this.log(`scanExports found: ${nameMatch[1]} in ${item.file}`);
                exports.set(nameMatch[1], item.file);
            }
        }
        return exports;
    }
    formatMatches(matches, isDryRun = false, showModeIndicator = false) {
        return this.runner.formatMatches(matches, isDryRun, 50, showModeIndicator);
    }
    /**
     * Format diagnostics for LLM consumption
     */
    formatDiagnostics(diags) {
        if (diags.length === 0)
            return "";
        const errors = diags.filter((d) => d.severity === "error");
        const warnings = diags.filter((d) => d.severity === "warning");
        const hints = diags.filter((d) => d.severity === "hint");
        let output = `[ast-grep] ${diags.length} structural issue(s)`;
        if (errors.length)
            output += ` — ${errors.length} error(s)`;
        if (warnings.length)
            output += ` — ${warnings.length} warning(s)`;
        if (hints.length)
            output += ` — ${hints.length} hint(s)`;
        output += ":\n";
        for (const d of diags.slice(0, 10)) {
            const loc = d.line === d.endLine ? `L${d.line}` : `L${d.line}-${d.endLine}`;
            const ruleInfo = d.ruleDescription
                ? `${d.rule}: ${d.ruleDescription.message}`
                : d.rule;
            const fix = d.fix || d.ruleDescription?.note ? " [fixable]" : "";
            output += `  ${ruleInfo} (${loc})${fix}\n`;
            if (d.ruleDescription?.note) {
                const shortNote = d.ruleDescription.note.split(/\r?\n/)[0];
                output += `    → ${shortNote}\n`;
            }
        }
        if (diags.length > 10) {
            output += `  ... and ${diags.length - 10} more\n`;
        }
        return output;
    }
    getRuleDescription(ruleId) {
        return this.ruleManager.loadRuleDescriptions().get(ruleId);
    }
}
