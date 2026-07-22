import { createHmac, randomBytes, randomUUID } from "node:crypto";
import {
	chmod,
	link,
	mkdir,
	readFile,
	realpath,
	unlink,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";

export type CaptureClassification =
	| "unclassified-local"
	| "legacy-unclassified";
export type CaptureScope = "project" | "unscoped" | "legacy";
export type ScopeFailure = "cwd_unavailable" | "scope_key_unavailable";

export type CaptureProvenance = {
	scope: Exclude<CaptureScope, "legacy">;
	classification: "unclassified-local";
	projectId?: string;
	scopeFailure?: ScopeFailure;
	sessionId?: string;
	subagentRunId?: string;
	agentName?: string;
};

type ProvenanceContext = {
	cwd: string;
	sessionManager?: {
		getSessionId(): string;
	};
};

function nonEmpty(value: string | undefined): string | undefined {
	return value && value.length > 0 ? value : undefined;
}

async function readScopeKey(path: string): Promise<Buffer> {
	const key = await readFile(path);
	if (key.length !== 32)
		throw new Error(
			"tool-result virtualizer scope key must contain exactly 32 bytes",
		);
	await chmod(path, 0o600);
	return key;
}

export class ProvenanceResolver {
	private readonly root: string;
	private readonly scopeKeyPath: string;
	private scopeKeyPromise: Promise<Buffer> | undefined;

	constructor(root: string) {
		this.root = root;
		this.scopeKeyPath = join(root, "scope.key");
	}

	private async createOrReadScopeKey(): Promise<Buffer> {
		await mkdir(this.root, { recursive: true, mode: 0o700 });
		await chmod(this.root, 0o700);
		try {
			return await readScopeKey(this.scopeKeyPath);
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			)
				throw error;
		}

		const temporaryPath = join(this.root, `.scope-key-${randomUUID()}.tmp`);
		try {
			await writeFile(temporaryPath, randomBytes(32), {
				flag: "wx",
				mode: 0o600,
			});
			try {
				await link(temporaryPath, this.scopeKeyPath);
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "EEXIST"
					)
				)
					throw error;
			}
			return await readScopeKey(this.scopeKeyPath);
		} finally {
			await unlink(temporaryPath).catch(() => undefined);
		}
	}

	private scopeKey(): Promise<Buffer> {
		this.scopeKeyPromise ??= this.createOrReadScopeKey();
		return this.scopeKeyPromise;
	}

	async resolve(
		context: ProvenanceContext,
		env: NodeJS.ProcessEnv = process.env,
	): Promise<CaptureProvenance> {
		const provenance: CaptureProvenance = {
			scope: "unscoped",
			classification: "unclassified-local",
		};
		const sessionId = context.sessionManager
			? nonEmpty(context.sessionManager.getSessionId())
			: undefined;
		const subagentRunId = nonEmpty(env.PI_SUBAGENT_RUN_ID);
		const agentName = nonEmpty(env.PI_SUBAGENT_CHILD_AGENT);
		if (sessionId) provenance.sessionId = sessionId;
		if (subagentRunId) provenance.subagentRunId = subagentRunId;
		if (agentName) provenance.agentName = agentName;

		let canonicalCwd: string;
		try {
			canonicalCwd = await realpath(context.cwd);
		} catch {
			provenance.scopeFailure = "cwd_unavailable";
			return provenance;
		}
		let scopeKey: Buffer;
		try {
			scopeKey = await this.scopeKey();
		} catch {
			provenance.scopeFailure = "scope_key_unavailable";
			return provenance;
		}
		provenance.scope = "project";
		provenance.projectId = createHmac("sha256", scopeKey)
			.update(canonicalCwd)
			.digest("hex");
		return provenance;
	}
}
