import { computeImpactCascade as computeImpactCascadeImpl, computeTransitiveImpact as computeTransitiveImpactImpl, } from "./query.js";
import { buildOrUpdateGraph as buildOrUpdateGraphImpl, } from "./builder.js";
import { formatImpactCascade as formatImpactCascadeImpl } from "./format.js";
import { buildModuleGraph } from "./workspace-modules.js";
const CHANGED_SYMBOLS_PREFIX = "session.reviewGraph.changedSymbols:";
const ENTITY_SNAPSHOT_PREFIX = "session.reviewGraph.entitySnapshot:";
export async function buildOrUpdateGraph(cwd, changedFiles, facts, seqHint) {
    return buildOrUpdateGraphImpl(cwd, changedFiles, facts, seqHint);
}
export function computeImpactCascade(graph, changedFile, cwd) {
    const moduleGraph = cwd ? buildModuleGraph(cwd) : null;
    return computeImpactCascadeImpl(graph, changedFile, moduleGraph);
}
export function formatImpactCascade(result, maxFiles) {
    return formatImpactCascadeImpl(result, maxFiles);
}
/** Transitive (depth-bounded) dependents of a file — see query.computeTransitiveImpact. */
export function computeTransitiveImpact(graph, seedFile, options) {
    return computeTransitiveImpactImpl(graph, seedFile, options);
}
export function recordEntitySnapshotDiff(facts, filePath, nextSnapshot) {
    const prev = facts.getSessionFact(`${ENTITY_SNAPSHOT_PREFIX}${filePath}`) ?? new Map();
    const added = [];
    const removed = [];
    const modified = [];
    for (const [key, value] of nextSnapshot.entries()) {
        if (!prev.has(key))
            added.push(key);
        else if (prev.get(key) !== value)
            modified.push(key);
    }
    for (const key of prev.keys()) {
        if (!nextSnapshot.has(key))
            removed.push(key);
    }
    const changedSymbols = [
        ...new Set([...added, ...modified, ...removed]
            .map((key) => key.split(":")[1])
            .filter(Boolean)),
    ];
    facts.setSessionFact(`${ENTITY_SNAPSHOT_PREFIX}${filePath}`, new Map(nextSnapshot));
    facts.setSessionFact(`${CHANGED_SYMBOLS_PREFIX}${filePath}`, changedSymbols);
    return { added, removed, modified };
}
