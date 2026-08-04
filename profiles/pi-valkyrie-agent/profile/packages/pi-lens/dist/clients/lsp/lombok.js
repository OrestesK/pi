import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
const LOMBOK_ENV_KEYS = ["PI_LENS_LOMBOK_JAR", "LOMBOK_JAR"];
const LOMBOK_PROJECT_FILES = [
    "lombok.config",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    path.join("gradle", "libs.versions.toml"),
];
function fileExists(filePath) {
    if (!filePath)
        return false;
    try {
        return fs.statSync(filePath).isFile();
    }
    catch {
        return false;
    }
}
function readTextIfSmall(filePath, maxBytes = 512 * 1024) {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > maxBytes)
            return "";
        return fs.readFileSync(filePath, "utf-8");
    }
    catch {
        return "";
    }
}
function containsLombokDependency(text) {
    return (/\borg\.projectlombok\b/i.test(text) ||
        /<artifactId>\s*lombok\s*<\/artifactId>/i.test(text) ||
        /\b(annotationProcessor|compileOnly|testCompileOnly|testAnnotationProcessor)\b[^\n]*\blombok\b/i.test(text));
}
export function hasLombokProject(root) {
    const lombokConfig = path.join(root, "lombok.config");
    if (fileExists(lombokConfig))
        return true;
    for (const name of LOMBOK_PROJECT_FILES) {
        if (name === "lombok.config")
            continue;
        const text = readTextIfSmall(path.join(root, name));
        if (text && containsLombokDependency(text))
            return true;
    }
    return false;
}
function envJarCandidate(env) {
    for (const key of LOMBOK_ENV_KEYS) {
        const value = env[key]?.trim();
        if (fileExists(value))
            return path.resolve(value);
    }
    return undefined;
}
function localJarCandidates(root) {
    return [
        path.join(root, "lombok.jar"),
        path.join(root, ".lombok", "lombok.jar"),
        path.join(root, "lib", "lombok.jar"),
        path.join(root, "libs", "lombok.jar"),
    ];
}
function newestExistingJar(candidates) {
    let best;
    for (const candidate of candidates) {
        try {
            const stat = fs.statSync(candidate);
            if (!stat.isFile())
                continue;
            if (!best || stat.mtimeMs > best.mtimeMs) {
                best = { filePath: candidate, mtimeMs: stat.mtimeMs };
            }
        }
        catch {
            // missing candidate
        }
    }
    return best?.filePath;
}
function mavenLocalLombokJar(home = os.homedir()) {
    const base = path.join(home, ".m2", "repository", "org", "projectlombok", "lombok");
    let versions = [];
    try {
        versions = fs.readdirSync(base);
    }
    catch {
        return undefined;
    }
    return newestExistingJar(versions.map((version) => path.join(base, version, `lombok-${version}.jar`)));
}
function gradleCacheLombokJar(home = os.homedir()) {
    const base = path.join(home, ".gradle", "caches", "modules-2", "files-2.1", "org.projectlombok", "lombok");
    const candidates = [];
    let versions = [];
    try {
        versions = fs.readdirSync(base);
    }
    catch {
        return undefined;
    }
    for (const version of versions) {
        const versionDir = path.join(base, version);
        let hashes = [];
        try {
            hashes = fs.readdirSync(versionDir);
        }
        catch {
            continue;
        }
        for (const hash of hashes) {
            candidates.push(path.join(versionDir, hash, `lombok-${version}.jar`));
        }
    }
    return newestExistingJar(candidates);
}
export function resolveLombokJar(root, env = process.env) {
    const explicit = envJarCandidate(env);
    if (explicit)
        return explicit;
    return (newestExistingJar(localJarCandidates(root)) ??
        mavenLocalLombokJar() ??
        gradleCacheLombokJar());
}
export function hasLombokJavaAgent(jvmArgs) {
    return /(^|\s)-javaagent:(?:"[^"]*lombok[^"]*\.jar"|\S*lombok\S*\.jar)/i.test(jvmArgs ?? "");
}
function appendJvmArg(existing, next) {
    const trimmed = existing?.trim();
    return trimmed ? `${trimmed} ${next}` : next;
}
function resolveLombokJavaAgentArg(root, baseEnv = process.env) {
    if (baseEnv.PI_LENS_JAVA_LOMBOK === "0")
        return undefined;
    if (hasLombokJavaAgent(baseEnv.JDTLS_JVM_ARGS))
        return undefined;
    const explicitJar = envJarCandidate(baseEnv);
    if (!explicitJar && !hasLombokProject(root))
        return undefined;
    const jar = explicitJar ?? resolveLombokJar(root, baseEnv);
    return jar ? `-javaagent:${jar}` : undefined;
}
export function createLombokJdtlsArgs(root, baseEnv = process.env) {
    const javaAgent = resolveLombokJavaAgentArg(root, baseEnv);
    return javaAgent ? [`--jvm-arg=${javaAgent}`] : [];
}
export function createLombokJdtlsEnv(root, baseEnv = process.env) {
    const javaAgent = resolveLombokJavaAgentArg(root, baseEnv);
    if (!javaAgent)
        return undefined;
    return {
        ...baseEnv,
        JDTLS_JVM_ARGS: appendJvmArg(baseEnv.JDTLS_JVM_ARGS, javaAgent),
    };
}
