const rules = [];
export function registerRule(r) {
    rules.push(r);
}
export function clearRules() {
    rules.length = 0;
}
export function evaluateRules(ctx) {
    const diagnostics = [];
    for (const rule of rules) {
        if (!rule.appliesTo(ctx))
            continue;
        const results = rule.evaluate(ctx, ctx.facts);
        diagnostics.push(...results);
    }
    return diagnostics;
}
