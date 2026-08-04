import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { parseEnabledShape } from "./config-enabled-shape.js";
import { findNestedProjectMutationValue, } from "./project-lens-config.js";
export function getPiLensGlobalConfigPath(homeDir = os.homedir()) {
    const override = process.env.PI_LENS_CONFIG_PATH;
    if (override)
        return path.resolve(override);
    return path.join(homeDir, ".pi-lens", "config.json");
}
const warnedInvalidGlobalConfigs = new Set();
/**
 * Same warn-once-per-(path, reason) contract as project-lens-config.ts's
 * `warnInvalidConfigOnce` — a malformed global config value is logged once
 * and then treated as absent, rather than silently dropped (#792).
 */
function warnInvalidGlobalConfigOnce(configPath, reason) {
    const key = `${configPath}:${reason}`;
    if (warnedInvalidGlobalConfigs.has(key))
        return;
    warnedInvalidGlobalConfigs.add(key);
    console.error(`[pi-lens] ignoring invalid global config ${configPath}: ${reason}`);
}
/** For tests that need to force the warn-once cache to reset between cases. */
export function resetGlobalConfigWarnCache() {
    warnedInvalidGlobalConfigs.clear();
}
export function loadPiLensGlobalConfig(configPath = getPiLensGlobalConfigPath()) {
    try {
        const parsed = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        if (!parsed || typeof parsed !== "object")
            return undefined;
        const raw = parsed;
        const warnInvalid = (reason) => warnInvalidGlobalConfigOnce(configPath, reason);
        const dispatchRaw = raw.dispatch;
        const dispatch = dispatchRaw && typeof dispatchRaw === "object"
            ? dispatchRaw
            : undefined;
        const widgetRaw = raw.widget;
        const widget = widgetRaw && typeof widgetRaw === "object"
            ? widgetRaw
            : undefined;
        const format = parseEnabledShape(raw.format, "format", warnInvalid);
        const autofix = parseEnabledShape(raw.autofix, "autofix", warnInvalid);
        const formatModeRaw = raw.format;
        const formatModeSource = formatModeRaw && typeof formatModeRaw === "object"
            ? formatModeRaw
            : undefined;
        const actionableWarningsRaw = raw.actionableWarnings;
        const actionableWarnings = actionableWarningsRaw && typeof actionableWarningsRaw === "object"
            ? actionableWarningsRaw
            : undefined;
        const actionableWarningsAutoFix = parseEnabledShape(actionableWarnings?.autoFix, "actionableWarnings.autoFix", warnInvalid);
        const contextInjectionRaw = raw.contextInjection;
        const contextInjection = contextInjectionRaw && typeof contextInjectionRaw === "object"
            ? contextInjectionRaw
            : undefined;
        const turnSummaryRaw = raw.turnSummary;
        const turnSummary = turnSummaryRaw && typeof turnSummaryRaw === "object"
            ? turnSummaryRaw
            : undefined;
        const formatMode = formatModeSource?.mode === "immediate" ||
            formatModeSource?.mode === "deferred"
            ? formatModeSource.mode
            : undefined;
        const ignore = Array.isArray(raw.ignore)
            ? raw.ignore.filter((p) => typeof p === "string")
            : undefined;
        return {
            ignore: ignore && ignore.length > 0 ? ignore : undefined,
            dispatch: dispatch
                ? {
                    runnerTimeoutFloorMs: typeof dispatch.runnerTimeoutFloorMs === "number" &&
                        Number.isFinite(dispatch.runnerTimeoutFloorMs) &&
                        dispatch.runnerTimeoutFloorMs > 0
                        ? dispatch.runnerTimeoutFloorMs
                        : undefined,
                }
                : undefined,
            widget: widget
                ? {
                    visible: typeof widget.visible === "boolean" ? widget.visible : undefined,
                }
                : undefined,
            format: format
                ? {
                    enabled: format.enabled,
                    mode: formatMode,
                }
                : undefined,
            autofix: autofix ? { enabled: autofix.enabled } : undefined,
            actionableWarnings: actionableWarnings
                ? {
                    enabled: typeof actionableWarnings.enabled === "boolean"
                        ? actionableWarnings.enabled
                        : undefined,
                    includeLspCodeActions: typeof actionableWarnings.includeLspCodeActions === "boolean"
                        ? actionableWarnings.includeLspCodeActions
                        : undefined,
                    deltaOnly: typeof actionableWarnings.deltaOnly === "boolean"
                        ? actionableWarnings.deltaOnly
                        : undefined,
                    autoFix: actionableWarningsAutoFix
                        ? { enabled: actionableWarningsAutoFix.enabled }
                        : undefined,
                }
                : undefined,
            contextInjection: contextInjection
                ? {
                    enabled: typeof contextInjection.enabled === "boolean"
                        ? contextInjection.enabled
                        : undefined,
                }
                : undefined,
            turnSummary: turnSummary
                ? {
                    enabled: typeof turnSummary.enabled === "boolean"
                        ? turnSummary.enabled
                        : undefined,
                }
                : undefined,
        };
    }
    catch {
        return undefined;
    }
}
export function getGlobalIgnorePatterns(configPath) {
    return loadPiLensGlobalConfig(configPath)?.ignore ?? [];
}
export function getGlobalWidgetDefaultVisible(configPath) {
    return loadPiLensGlobalConfig(configPath)?.widget?.visible !== false;
}
export function getGlobalAutoformatEnabled(configPath) {
    return loadPiLensGlobalConfig(configPath)?.format?.enabled !== false;
}
export function getGlobalAutofixEnabled(configPath) {
    return loadPiLensGlobalConfig(configPath)?.autofix?.enabled !== false;
}
export function getGlobalImmediateFormatDefault(configPath) {
    return loadPiLensGlobalConfig(configPath)?.format?.mode === "immediate";
}
export function getGlobalContextInjectionEnabled(configPath) {
    return (loadPiLensGlobalConfig(configPath)?.contextInjection?.enabled !== false);
}
export function getGlobalTurnSummaryEnabled(configPath) {
    return loadPiLensGlobalConfig(configPath)?.turnSummary?.enabled === true;
}
/**
 * Resolve a flag AND report which config tier decided it — same precedence
 * as {@link resolvePiLensFlag} (which now delegates here), just also
 * returning the `source` so callers can log e.g.
 * "(--no-autofix, source=project)" instead of a bare boolean (#792).
 *
 * Precedence (unchanged, maintainer decision — project wins over global,
 * including re-enabling; only an explicit CLI disabling flag outranks
 * project config): cli → project → global → default.
 */
export function resolvePiLensFlagWithSource(name, value, config, projectConfig, editedFilePath, projectRoot) {
    if (value)
        return { value, source: "cli" };
    const mutationFlag = name === "no-autoformat" ||
        name === "no-autofix" ||
        name === "lens-actionable-warning-autofix"
        ? name
        : undefined;
    const nested = mutationFlag && editedFilePath && projectRoot
        ? findNestedProjectMutationValue(mutationFlag, editedFilePath, projectRoot)
        : undefined;
    const nestedSource = nested
        ? path.resolve(nested.dir) === path.resolve(projectRoot)
            ? "project"
            : `nested-project:${nested.dir}`
        : undefined;
    if (name === "no-autoformat") {
        if (nested)
            return { value: !nested.value, source: nestedSource };
        if (projectConfig?.format?.enabled !== undefined) {
            return { value: !projectConfig.format.enabled, source: "project" };
        }
        if (config?.format?.enabled === false) {
            return { value: true, source: "global" };
        }
        return { value: false, source: "default" };
    }
    if (name === "no-autofix") {
        if (nested)
            return { value: !nested.value, source: nestedSource };
        if (projectConfig?.autofix?.enabled !== undefined) {
            return { value: !projectConfig.autofix.enabled, source: "project" };
        }
        if (config?.autofix?.enabled === false) {
            return { value: true, source: "global" };
        }
        return { value: false, source: "default" };
    }
    if (name === "immediate-format") {
        const immediate = config?.format?.mode === "immediate";
        return { value: immediate, source: immediate ? "global" : "default" };
    }
    if (name === "lens-actionable-warnings") {
        const enabled = config?.actionableWarnings?.enabled === true;
        return { value: enabled, source: enabled ? "global" : "default" };
    }
    if (name === "lens-actionable-warning-actions") {
        const enabled = config?.actionableWarnings?.includeLspCodeActions === true;
        return { value: enabled, source: enabled ? "global" : "default" };
    }
    if (name === "lens-actionable-warning-autofix") {
        if (nested)
            return { value: nested.value, source: nestedSource };
        if (projectConfig?.actionableWarnings?.autoFix?.enabled !== undefined) {
            return {
                value: projectConfig.actionableWarnings.autoFix.enabled,
                source: "project",
            };
        }
        const enabled = config?.actionableWarnings?.autoFix?.enabled === true;
        return { value: enabled, source: enabled ? "global" : "default" };
    }
    if (name === "lens-actionable-warning-all") {
        const all = config?.actionableWarnings?.deltaOnly === false;
        return { value: all, source: all ? "global" : "default" };
    }
    if (name === "no-lens-context") {
        const disabled = config?.contextInjection?.enabled === false;
        return { value: disabled, source: disabled ? "global" : "default" };
    }
    if (name === "lens-turn-summary") {
        const enabled = config?.turnSummary?.enabled === true;
        return { value: enabled, source: enabled ? "global" : "default" };
    }
    return { value, source: "default" };
}
export function resolvePiLensFlag(name, value, config, projectConfig, editedFilePath, projectRoot) {
    return resolvePiLensFlagWithSource(name, value, config, projectConfig, editedFilePath, projectRoot).value;
}
