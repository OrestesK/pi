/**
 * Returns the name of the smallest entry in `candidates` whose range strictly
 * contains [targetStart, targetEnd]. Undefined when nothing contains the
 * target (a top-level declaration).
 */
export function findOwnerName(candidates, targetStart, targetEnd) {
    let best;
    for (const candidate of candidates) {
        const span = candidate.endLine - candidate.startLine;
        const targetSpan = targetEnd - targetStart;
        const contains = candidate.startLine <= targetStart &&
            candidate.endLine >= targetEnd &&
            span > targetSpan;
        if (!contains)
            continue;
        if (!best || span < best.endLine - best.startLine)
            best = candidate;
    }
    return best?.name;
}
/** Build a dotted qualified name from an owner (if any) and the symbol's own name. */
export function buildQualifiedName(ownerName, symbolName) {
    return ownerName ? `${ownerName}.${symbolName}` : undefined;
}
