import { normalizeMapKey } from "../path-utils.js";
export class FactStore {
    fileFacts = new Map();
    sessionFacts = new Map();
    // All file-keyed methods normalize the path internally via normalizeMapKey().
    // Callers always pass raw/resolved paths — normalization is not their concern.
    getFileFact(filePath, factId) {
        return this.fileFacts.get(normalizeMapKey(filePath))?.get(factId);
    }
    setFileFact(filePath, factId, value) {
        const key = normalizeMapKey(filePath);
        let facts = this.fileFacts.get(key);
        if (!facts) {
            facts = new Map();
            this.fileFacts.set(key, facts);
        }
        facts.set(factId, value);
    }
    hasFileFact(filePath, factId) {
        return this.fileFacts.get(normalizeMapKey(filePath))?.has(factId) ?? false;
    }
    /** Clear facts for one specific file only. Use at the start of each per-file dispatch call.
     *  Preserves facts for other files computed in the same turn.
     *  Normalizes filePath internally — callers pass raw paths. */
    clearFileFactsFor(filePath) {
        this.fileFacts.delete(normalizeMapKey(filePath));
    }
    /** Clear all file facts across all paths. Reserve for explicit full resets only —
     *  do NOT use in the normal per-file dispatch path. */
    clearFileFacts() {
        this.fileFacts.clear();
    }
    getSessionFact(factId) {
        return this.sessionFacts.get(factId);
    }
    setSessionFact(factId, value) {
        this.sessionFacts.set(factId, value);
    }
    hasSessionFact(factId) {
        return this.sessionFacts.has(factId);
    }
    /** Call on session reset only. Clears everything including tool cache and baselines. */
    clearAll() {
        this.fileFacts.clear();
        this.sessionFacts.clear();
    }
}
