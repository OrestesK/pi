function normalizeHintInput(value) {
    return value.replace(/\\/g, "/").toLowerCase();
}
/**
 * Deterministic feature-kind hint derived from package/entity/file names.
 * Inspired by clawpatch's packageKind() heuristic.
 */
export function inferFeatureKind(nameOrPath) {
    const normalized = normalizeHintInput(nameOrPath);
    if (/config|store|db|database|github|openai|sync|service/.test(normalized)) {
        return "service";
    }
    if (/(^|[/_.\-\s])(cli|command|bin)([/_.\-\s]|$)/.test(normalized)) {
        return "cli-command";
    }
    return "library";
}
/**
 * Deterministic trust-boundary hints derived from package/entity/file names.
 * These are advisory metadata for context injection, not security findings.
 */
export function inferTrustBoundaries(nameOrPath) {
    const normalized = normalizeHintInput(nameOrPath);
    const boundaries = new Set();
    if (/config|store|db|database|repo|repository|model|migration/.test(normalized)) {
        boundaries.add("filesystem");
        boundaries.add("database");
    }
    if (/github|gitlab|openai|anthropic|stripe|slack|sync|webhook|api|client/.test(normalized)) {
        boundaries.add("network");
        boundaries.add("external-api");
        boundaries.add("serialization");
    }
    if (/(^|[/_.\-\s])(cli|command|bin|exec|spawn|process|shell)([/_.\-\s]|$)/.test(normalized)) {
        boundaries.add("user-input");
        boundaries.add("process-exec");
    }
    if (/auth|login|token|session|oauth|jwt/.test(normalized)) {
        boundaries.add("auth");
        boundaries.add("user-input");
    }
    return [...boundaries];
}
export function featureHintMetadata(nameOrPath) {
    return {
        featureKind: inferFeatureKind(nameOrPath),
        trustBoundaries: inferTrustBoundaries(nameOrPath),
    };
}
