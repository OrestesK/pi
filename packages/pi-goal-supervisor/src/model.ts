import { parseJudgeResponse } from "./judge.ts";
import type { GoalJudgeResult, GoalSupervisorState } from "./types.ts";

type ModelLike = { provider: string; id: string };
type ModelRegistryLike = {
	getApiKeyAndHeaders(model: ModelLike): Promise<{
		ok?: boolean;
		error?: string;
		apiKey?: string;
		headers?: Record<string, string>;
	}>;
};
export type ModelJudgeContext = {
	model?: ModelLike;
	modelRegistry?: ModelRegistryLike;
	signal?: AbortSignal;
};

type CompleteModule = {
	complete(
		model: ModelLike,
		body: {
			messages: Array<{
				role: "user";
				content: Array<{ type: "text"; text: string }>;
			}>;
		},
		options: {
			apiKey?: string;
			headers?: Record<string, string>;
			maxTokens: number;
			signal?: AbortSignal;
		},
	): Promise<{ content: Array<{ type: string; text?: string }> }>;
};

export function buildJudgePrompt(
	state: GoalSupervisorState,
	assistantText: string,
	evidence: string,
): string {
	return `You are the pi-goal-supervisor completion judge. You are read-only. Do not call tools.\n\nObjective:\n${state.objective}\n\nClaimed completion evidence:\n${evidence}\n\nLatest assistant text:\n${assistantText.slice(-20_000)}\n\nReturn strict JSON only with this shape:\n{"verdict":"approved|rejected|inconclusive","score":0,"reason":"...","missingEvidence":["..."]}\n\nApprove only when transcript evidence proves the objective is complete. Use score >= 8 only for approved completion.`;
}

function responseText(response: {
	content: Array<{ type: string; text?: string }>;
}): string {
	return response.content
		.filter(
			(block): block is { type: "text"; text: string } =>
				block.type === "text" && typeof block.text === "string",
		)
		.map((block) => block.text)
		.join("\n")
		.trim();
}

export async function judgeWithCurrentModel(
	state: GoalSupervisorState,
	assistantText: string,
	evidence: string,
	ctx: ModelJudgeContext,
	timeoutMs = 120_000,
): Promise<GoalJudgeResult> {
	const at = new Date().toISOString();
	if (!ctx.model || !ctx.modelRegistry) {
		return {
			verdict: "inconclusive",
			score: 0,
			reason: "no active model/model registry available for judge",
			missingEvidence: ["model judge availability"],
			at,
		};
	}
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(ctx.model);
	if (auth.ok === false) {
		return {
			verdict: "inconclusive",
			score: 0,
			reason: `judge model auth failed: ${auth.error ?? "unknown"}`,
			missingEvidence: ["model auth"],
			at,
		};
	}
	if (
		!auth.apiKey &&
		(!auth.headers || Object.keys(auth.headers).length === 0)
	) {
		return {
			verdict: "inconclusive",
			score: 0,
			reason: "no API key or headers available for judge model",
			missingEvidence: ["model auth"],
			at,
		};
	}
	const controller = new AbortController();
	const abortFromParent = () => controller.abort(ctx.signal?.reason);
	if (ctx.signal) {
		if (ctx.signal.aborted) abortFromParent();
		else ctx.signal.addEventListener("abort", abortFromParent, { once: true });
	}
	let timeout: ReturnType<typeof setTimeout> | undefined;
	try {
		const mod = (await import("@mariozechner/pi-ai")) as CompleteModule;
		const result = await Promise.race([
			mod.complete(
				ctx.model,
				{
					messages: [
						{
							role: "user",
							content: [
								{
									type: "text",
									text: buildJudgePrompt(state, assistantText, evidence),
								},
							],
						},
					],
				},
				{
					apiKey: auth.apiKey,
					headers: auth.headers,
					maxTokens: 1024,
					signal: controller.signal,
				},
			),
			new Promise<never>((_, reject) => {
				timeout = setTimeout(() => {
					controller.abort(new Error(`judge timed out after ${timeoutMs}ms`));
					reject(new Error(`judge timed out after ${timeoutMs}ms`));
				}, timeoutMs);
			}),
		]);
		return parseJudgeResponse(responseText(result), new Date().toISOString());
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		return {
			verdict: "inconclusive",
			score: 0,
			reason: `judge model failed: ${reason}`,
			missingEvidence: ["successful judge call"],
			at: new Date().toISOString(),
		};
	} finally {
		if (timeout) clearTimeout(timeout);
		if (ctx.signal) ctx.signal.removeEventListener("abort", abortFromParent);
	}
}
