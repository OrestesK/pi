let bootstrapPromise = null;
/**
 * A stand-in for an analysis client whose module failed to load (an unresolved
 * runtime dependency under a package-manager layout the resolver can't traverse
 * — #285/#335). Every method call no-ops to `undefined`, which every analyzer
 * consumer already treats as "nothing to report", so a single failed analyzer
 * degrades to silence instead of taking down the whole extension. This keeps the
 * fail-soft in ONE seam (the bootstrap) so consumers never special-case it —
 * the same single-seam principle as the clients/deps/* accessors.
 */
export function degradedClient() {
    return new Proxy({}, {
        get(_target, prop) {
            // Not thenable (so `await stub` / Promise.resolve(stub) won't treat it
            // as a promise), not iterable, no surprising coercion.
            if (typeof prop === "symbol" || prop === "then")
                return undefined;
            return () => undefined;
        },
    });
}
/**
 * One or more client modules failed to load — almost always an unresolved
 * runtime dependency under a package-manager layout the runtime's resolver can't
 * traverse (#285/#335). Name each disabled analyzer, then emit ONE paste-able
 * environment fingerprint so a reporter can tell us exactly what failed and
 * where. Best-effort: never let the diagnostic itself mask the failure.
 */
async function logBootstrapFailures(failures) {
    for (const { name, err } of failures) {
        console.error(`[pi-lens] analyzer "${name}" disabled (degraded mode): ${err?.message ?? String(err)}`);
    }
    try {
        const { collectInstallDiagnostics, formatInstallDiagnostics } = await import("./install-diagnostics.js");
        console.error(formatInstallDiagnostics(collectInstallDiagnostics(), failures[0]?.err));
    }
    catch {
        // the per-analyzer lines above already named the failures
    }
}
export function loadBootstrapClients() {
    bootstrapPromise ??= (async () => {
        const failures = [];
        // Load + construct one client in isolation; on failure record it and
        // substitute a degraded no-op stub so the others still load — single-seam
        // fail-soft, consumers never special-case it.
        async function load(name, make) {
            try {
                return await make();
            }
            catch (err) {
                failures.push({ name, err });
                return degradedClient();
            }
        }
        // Lists degrade to empty (a stub Proxy isn't iterable), e.g. dead-code.
        async function loadList(name, make) {
            try {
                return await make();
            }
            catch (err) {
                failures.push({ name, err });
                return [];
            }
        }
        const [ruffClient, biomeClient, knipClient, todoScanner, jscpdClient, depChecker, testRunnerClient, metricsClient, complexityClient, goClient, govulncheckClient, gitleaksClient, trivyClient, opengrepClient, rustClient, agentBehaviorClient, deadCodeClients,] = await Promise.all([
            load("ruff", async () => new (await import("./ruff-client.js")).RuffClient()),
            load("biome", async () => new (await import("./biome-client.js")).BiomeClient()),
            load("knip", async () => new (await import("./knip-client.js")).KnipClient()),
            load("todo", async () => new (await import("./todo-scanner.js")).TodoScanner()),
            load("jscpd", async () => new (await import("./jscpd-client.js")).JscpdClient()),
            load("dependency-checker", async () => new (await import("./dependency-checker.js")).DependencyChecker()),
            load("test-runner", async () => new (await import("./test-runner-client.js")).TestRunnerClient()),
            load("metrics", async () => new (await import("./metrics-client.js")).MetricsClient()),
            load("complexity", async () => new (await import("./complexity-client.js")).ComplexityClient()),
            load("go", async () => new (await import("./go-client.js")).GoClient()),
            load("govulncheck", async () => new (await import("./govulncheck-client.js")).GovulncheckClient()),
            load("gitleaks", async () => new (await import("./gitleaks-client.js")).GitleaksClient()),
            load("trivy", async () => new (await import("./trivy-client.js")).TrivyClient()),
            load("opengrep", async () => new (await import("./opengrep-client.js")).OpengrepClient()),
            load("rust", async () => new (await import("./rust-client.js")).RustClient()),
            load("agent-behavior", async () => new (await import("./agent-behavior-client.js")).AgentBehaviorClient()),
            loadList("dead-code", async () => (await import("./dead-code-client.js")).getDeadCodeClients()),
        ]);
        if (failures.length > 0)
            await logBootstrapFailures(failures);
        return {
            ruffClient,
            biomeClient,
            knipClient,
            todoScanner,
            jscpdClient,
            depChecker,
            testRunnerClient,
            metricsClient,
            complexityClient,
            goClient,
            govulncheckClient,
            gitleaksClient,
            trivyClient,
            opengrepClient,
            rustClient,
            agentBehaviorClient,
            deadCodeClients,
        };
    })();
    return bootstrapPromise;
}
