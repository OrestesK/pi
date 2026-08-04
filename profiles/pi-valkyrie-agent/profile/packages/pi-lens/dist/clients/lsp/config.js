/**
 * LSP Configuration for pi-lens
 *
 * Allows users to define custom LSP servers and override initialization options
 * for built-in servers via configuration.
 *
 * Config file: .pi-lens/lsp.json (or .pi-lens.json, pi-lsp.json)
 *
 * Example — custom server:
 * {
 *   "servers": {
 *     "my-server": {
 *       "name": "My Custom LSP",
 *       "extensions": [".myext"],
 *       "command": "my-lsp-server",
 *       "args": ["--stdio"],
 *       "rootMarkers": ["package.json"]
 *     }
 *   }
 * }
 *
 * Example — override initializationOptions for a built-in server:
 * {
 *   "serverOverrides": {
 *     "rust": {
 *       "initializationOptions": {
 *         "check": { "command": "clippy", "allTargets": true },
 *         "cargo": { "features": "all", "targetDir": true }
 *       }
 *     },
 *     "nix": {
 *       "initializationOptions": {
 *         "nixpkgs": { "expr": "import <nixpkgs> {}" },
 *         "options": {
 *           "home_manager": { "expr": "(builtins.getFlake (toString ./.)).homeConfigurations.me.options" }
 *         }
 *       }
 *     }
 *   }
 * }
 *
 * The `initializationOptions` object is deep-merged onto the server's built-in
 * defaults, so you only need to specify the keys you want to change or add.
 * User-supplied values win on conflicts at every level of nesting.
 *
 * Server IDs match the `id` field of each built-in server definition in
 * clients/lsp/server.ts (e.g. "rust", "nix", "bash", "python", "go", "ts").
 */
import fs from "node:fs/promises";
import path from "node:path";
import { launchLSP } from "./launch.js";
import { createRootDetector, LSP_SERVERS, } from "./server.js";
// --- Config Loading ---
const CONFIG_PATHS = [".pi-lens/lsp.json", ".pi-lens.json", "pi-lsp.json"];
/**
 * Load LSP configuration from file
 */
export async function loadLSPConfig(cwd) {
    let dir = path.resolve(cwd);
    while (true) {
        for (const configPath of CONFIG_PATHS) {
            const fullPath = path.join(dir, configPath);
            try {
                const content = await fs.readFile(fullPath, "utf-8");
                const config = JSON.parse(content);
                return config;
            }
            catch {
                // File doesn't exist or is invalid, try next
            }
        }
        const parent = path.dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
    }
    return {};
}
// --- Custom Server Factory ---
/**
 * Create LSPServerInfo from user configuration
 */
export function createCustomServer(config, id) {
    return {
        id,
        name: config.name,
        extensions: config.extensions,
        root: config.rootMarkers
            ? createRootDetector(config.rootMarkers)
            : async () => process.cwd(),
        async spawn(root) {
            const proc = await launchLSP(config.command, config.args ?? ["--stdio"], {
                cwd: root,
                env: config.env ? { ...process.env, ...config.env } : process.env,
            });
            return { process: proc };
        },
    };
}
// --- Registry Management ---
const EMPTY_CONFIG = {
    customServers: [],
    disabledServerIds: new Set(),
    serverOverrides: new Map(),
};
const workspaceConfigs = new Map();
/** In-flight config initialization promises to prevent duplicate concurrent loads */
const configInFlight = new Map();
function normalizeWorkspacePath(cwd) {
    return path.resolve(cwd);
}
function isSameOrChildPath(filePath, candidateRoot) {
    if (filePath === candidateRoot)
        return true;
    return filePath.startsWith(`${candidateRoot}${path.sep}`);
}
function getConfigForFile(filePath) {
    const resolvedFilePath = path.resolve(filePath);
    let bestMatch;
    for (const [root, config] of workspaceConfigs) {
        if (!isSameOrChildPath(resolvedFilePath, root))
            continue;
        if (!bestMatch || root.length > bestMatch.root.length) {
            bestMatch = { root, config };
        }
    }
    return bestMatch?.config ?? EMPTY_CONFIG;
}
/**
 * Initialize LSP configuration (call at session start)
 * Deduplicates concurrent calls for the same workspace.
 */
export async function initLSPConfig(cwd) {
    const normalizedCwd = normalizeWorkspacePath(cwd);
    const existing = configInFlight.get(normalizedCwd);
    if (existing)
        return existing;
    const promise = (async () => {
        const config = await loadLSPConfig(cwd);
        const customServers = [];
        const disabledServerIds = new Set(config.disabledServers ?? []);
        if (config.servers) {
            for (const [id, serverConfig] of Object.entries(config.servers)) {
                try {
                    const server = createCustomServer(serverConfig, id);
                    customServers.push(server);
                }
                catch {
                    // pi-lens-ignore: missing-error-propagation — per-server registration, skip bad entries
                }
            }
        }
        const serverOverrides = new Map();
        if (config.serverOverrides) {
            for (const [id, entry] of Object.entries(config.serverOverrides)) {
                if (entry && typeof entry === "object" && !Array.isArray(entry)) {
                    const initOpts = entry.initializationOptions;
                    if (initOpts !== undefined &&
                        typeof initOpts === "object" &&
                        initOpts !== null &&
                        !Array.isArray(initOpts)) {
                        serverOverrides.set(id, {
                            initializationOptions: initOpts,
                        });
                    }
                }
            }
        }
        workspaceConfigs.set(normalizedCwd, {
            customServers,
            disabledServerIds,
            serverOverrides,
        });
    })();
    configInFlight.set(normalizedCwd, promise);
    try {
        await promise;
    }
    finally {
        configInFlight.delete(normalizedCwd);
    }
}
/**
 * Get all available servers (built-in + custom, minus disabled)
 */
export function getAllServers(filePath) {
    const config = filePath ? getConfigForFile(filePath) : EMPTY_CONFIG;
    const all = [...LSP_SERVERS, ...config.customServers];
    return all.filter((s) => !config.disabledServerIds.has(s.id));
}
/**
 * Check if a server is disabled
 */
export function isServerDisabled(serverId, filePath) {
    const config = filePath ? getConfigForFile(filePath) : EMPTY_CONFIG;
    return config.disabledServerIds.has(serverId);
}
// --- Override getServersForFile to include custom servers
export function getServersForFileWithConfig(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const base = path.basename(filePath).toLowerCase();
    return getAllServers(filePath).filter((server) => {
        const extensions = server.extensions.map((value) => value.toLowerCase());
        const extensionMatch = extensions.includes(ext) || extensions.includes(base);
        if (!extensionMatch)
            return false;
        // #636: a server's extension match can be intentionally broader than what
        // it can usefully act on (zizmor attaches to "yaml" but only ever reports
        // on GitHub Actions workflow/action/dependabot paths). `pathFilter`, when
        // present, is an ADDITIONAL narrowing gate — never a widening one.
        return server.pathFilter ? server.pathFilter(filePath) : true;
    });
}
/**
 * The primary language server for a file (e.g. "typescript"), as opposed to a
 * cross-cutting auxiliary scanner attached via clientScope "all"/
 * "with-auxiliary" (ast-grep, opengrep, zizmor, typos, marksman, ...). `role`
 * is only ever set to "auxiliary" on those auxiliary entries (see
 * clients/lsp/server.ts) — undefined means a real language server. Used to
 * split a file's diagnostics into "primary confirmation" vs "auxiliary
 * findings" so a page of ast-grep/opengrep/marksman noise never buries
 * whether the actual type checker/compiler confirmed the file clean.
 *
 * #646: extracted from `tools/lsp-diagnostics.ts` (where it originated) so
 * `tools/lens-diagnostics.ts`'s `mode=full` sweep can share the exact same
 * primary/auxiliary classification instead of hand-copying it — both tools
 * now report the same primary-vs-auxiliary split for the same file.
 */
export function primaryServerId(filePath) {
    return getServersForFileWithConfig(filePath).find((s) => s.role !== "auxiliary")
        ?.id;
}
/**
 * Look up an initializationOptions override for a built-in server.
 * Returns undefined when no config was loaded or no override was specified
 * for this server ID.
 *
 * @param serverId  Built-in server id (e.g. "rust", "nix", "bash")
 * @param filePath  Any file path within the project (used to locate the
 *                  workspace config that was loaded for this directory tree)
 */
export function getServerInitOverride(serverId, filePath) {
    return getConfigForFile(filePath).serverOverrides.get(serverId);
}
export function resetLSPConfigStateForTests() {
    workspaceConfigs.clear();
}
// Re-export with config support
export { getAllServers as getServersForFile };
