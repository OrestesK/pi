/**
 * Shared TreeSitterClient singleton + ext→language resolver.
 *
 * web-tree-sitter's WASM runtime is module-level — one per process. TRANSFER_BUFFER
 * and _ts_init are global, so every subsystem MUST share a single TreeSitterClient:
 * separate clients race on init and corrupt the shared WASM heap. This module is
 * that single seam — read expansion, the dispatch tree-sitter runner, project scanner,
 * module-report, review-graph, and fact providers all obtain their client here, so a
 * file parsed by one is reused by the others while its content version remains resident.
 *
 * Once the WASM runtime aborts (Emscripten abort()), the heap is corrupted with no
 * in-process recovery. markTreeSitterWasmAborted() poisons the singleton so EVERY
 * consumer skips further tree-sitter work (previously only the runner tracked this,
 * while the other subsystems kept calling the dead runtime).
 */
import * as path from "node:path";
import { TreeSitterClient, } from "./tree-sitter-client.js";
import { logTreeSitter } from "./tree-sitter-logger.js";
let _shared = null;
let _wasmAborted = false;
let _wasmAbortedAt;
/** The process-wide TreeSitterClient, or null once the WASM runtime has aborted. */
export function getSharedTreeSitterClient() {
    if (_wasmAborted)
        return null;
    _shared ??= new TreeSitterClient(false, markTreeSitterWasmAborted);
    return _shared;
}
export function isTreeSitterWasmAborted() {
    return _wasmAborted;
}
/** Machine-readable process-wide runtime health for status/reporting surfaces. */
export function getTreeSitterRuntimeStatus() {
    return {
        available: !_wasmAborted,
        wasmAborted: _wasmAborted,
        recovery: _wasmAborted ? "restart_required" : "not_required",
        ...(_wasmAbortedAt ? { abortedAt: _wasmAbortedAt } : {}),
    };
}
/**
 * Poison the singleton after an unrecoverable Emscripten abort() — the module-level
 * WASM heap is corrupted, so no client can be used again this process.
 */
export function markTreeSitterWasmAborted() {
    if (_wasmAborted)
        return;
    _wasmAborted = true;
    _wasmAbortedAt = new Date().toISOString();
    _shared = null;
    console.error("[pi-lens] tree-sitter WASM runtime aborted; structural analysis is disabled " +
        "for this process. Restart the pi-lens extension/MCP server to recover.");
    logTreeSitter({
        phase: "runtime_abort",
        filePath: process.cwd(),
        status: "degraded",
        reason: "wasm_aborted_restart_required",
        metadata: { abortedAt: _wasmAbortedAt },
    });
}
/** Test-only: reset the singleton + abort flag. */
export function _resetSharedTreeSitterClientForTests() {
    _shared = null;
    _wasmAborted = false;
    _wasmAbortedAt = undefined;
}
// Grammar selection by extension — the single ext→grammar-id authority. `.tsx` →
// the tsx grammar (parses JSX); `.jsx` → the javascript grammar. The project
// scanner (project-diagnostics/scanner.ts) DERIVES its map from this one and
// module-report (module-report.ts `tsLangForFile`, #887) resolves its
// extension-split kinds (jsts/cxx) through `resolveTreeSitterLanguage` below,
// so neither can drift: post-#877 both key `.tsx`→tsx (the old note here said the
// scanner mapped `.tsx`→typescript to reuse typescript queries — that stopped
// being true when #877 moved typescript-rule inheritance into
// `queriesForLanguage`). The scanner layers only java/kotlin on top, whose
// grammars + rule dirs exist but are not wired into a per-edit runner `appliesTo`.
export const EXT_TO_LANG = {
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
    ".js": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".jsx": "javascript",
    ".py": "python",
    ".go": "go",
    ".rs": "rust",
    ".rb": "ruby",
    ".c": "c",
    ".h": "c",
    ".cc": "cpp",
    ".cpp": "cpp",
    ".cxx": "cpp",
    ".c++": "cpp",
    ".hh": "cpp",
    ".hpp": "cpp",
    ".hxx": "cpp",
    ".inl": "cpp",
    ".ipp": "cpp",
    ".tpp": "cpp",
    ".txx": "cpp",
    ".cu": "cpp",
    ".hip": "cpp",
    ".cs": "csharp",
    ".php": "php",
    ".phtml": "php",
    ".php3": "php",
    ".php4": "php",
    ".php5": "php",
    ".css": "css",
};
/** Resolve a tree-sitter grammar/language id from a file path's extension. */
export function resolveTreeSitterLanguage(filePath) {
    return EXT_TO_LANG[path.extname(filePath).toLowerCase()];
}
export async function withTreeSitterRoot(filePath, content, consume) {
    const languageId = resolveTreeSitterLanguage(filePath);
    const client = getSharedTreeSitterClient();
    if (!languageId || !client || !(await client.init()))
        return { parsed: false };
    return client.withParsedTree(filePath, languageId, content, (tree) => consume(tree.rootNode));
}
export function childrenOfType(node, type) {
    return (node.children ?? []).filter((c) => c && c.type === type);
}
export function firstChildOfType(node, type) {
    return (node.children ?? []).find((c) => c && c.type === type);
}
/** Depth-first walk, calling `visit` on every node (pre-order = source order). */
export function walk(node, visit) {
    visit(node);
    for (const child of node.children ?? []) {
        if (child)
            walk(child, visit);
    }
}
