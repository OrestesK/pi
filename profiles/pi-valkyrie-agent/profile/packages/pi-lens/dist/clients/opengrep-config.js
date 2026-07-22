import * as path from "node:path";
import { findLocalToolConfig } from "./path-utils.js";
// Opengrep is a fork of Semgrep and natively consumes the same rule format, so
// we discover both `.opengrep.*` (preferred) and the de-facto `.semgrep.*` rule
// files an existing repo may already carry.
export const LOCAL_OPENGREP_CONFIG_NAMES = [
    ".opengrep.yml",
    ".opengrep.yaml",
    "opengrep.yml",
    "opengrep.yaml",
    ".semgrep.yml",
    ".semgrep.yaml",
    "semgrep.yml",
    "semgrep.yaml",
];
export function findLocalOpengrepConfig(startDir) {
    return findLocalToolConfig(startDir, LOCAL_OPENGREP_CONFIG_NAMES);
}
function isRegistryOrAutoConfig(config) {
    return (config === "auto" || config.startsWith("p/") || config.startsWith("r/"));
}
export function normalizeOpengrepConfigArg(config, cwd) {
    if (!config)
        return undefined;
    const trimmed = config.trim();
    if (!trimmed)
        return undefined;
    if (isRegistryOrAutoConfig(trimmed))
        return trimmed;
    return path.isAbsolute(trimmed) ? trimmed : path.resolve(cwd, trimmed);
}
/**
 * Decide whether Opengrep dispatch runs, and with which `--config`. The surface
 * is intentionally seamless — there is no persisted `.pi-lens/opengrep.json` and
 * no management command. Opengrep is enabled when EITHER:
 *
 *   - the repo carries a rule file (`.opengrep.yml`/`.semgrep.yml`, …) — the
 *     rule file IS the opt-in signal; or
 *   - `--lens-opengrep` is set — self-sufficient: with no local/explicit config
 *     it defaults to `--config auto` (Opengrep's login-free Community ruleset).
 *
 * `--lens-opengrep-config <auto|p/pack|path>` overrides the chosen config.
 */
export function resolveOpengrepConfig(cwd, flags) {
    const localConfig = findLocalOpengrepConfig(cwd);
    const flagConfig = typeof flags?.config === "string" && flags.config.trim()
        ? flags.config.trim()
        : undefined;
    // A non-empty --lens-opengrep-config implies --lens-opengrep (passing a
    // config is an unambiguous opt-in).
    if (flags?.enabled || flagConfig) {
        // Self-sufficient flag: explicit config → local rule file → `auto`.
        const explicit = normalizeOpengrepConfigArg(flagConfig ?? localConfig, cwd);
        return {
            enabled: true,
            configArg: explicit ?? "auto",
            source: explicit && localConfig && !flagConfig ? "local" : "flag",
        };
    }
    if (localConfig) {
        return {
            enabled: true,
            configArg: localConfig,
            source: "local",
        };
    }
    return {
        enabled: false,
        source: "disabled",
        reason: "no local opengrep config (.opengrep.yml) and --lens-opengrep not set",
    };
}
