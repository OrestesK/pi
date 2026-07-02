import { handleCommand, getGoalArgumentCompletions } from "./commands.ts";
import { queueContinuation } from "./continuation.ts";
import {
  assistantFingerprint,
  extractAssistantText,
  isAllowedGoalBlocker,
  parseGoalMarkers,
} from "./evidence.ts";
import { applyJudgeResult, deterministicPrecheck } from "./judge.ts";
import { judgeWithCurrentModel } from "./model.ts";
import {
  appendState,
  reduceState,
  restoreStateFromEntries,
  serializeState,
} from "./state.ts";
import {
  STATE_CUSTOM_TYPE,
  TOOL_RESTRICTION_CUSTOM_TYPE,
  type GoalJudgeResult,
  type GoalSupervisorApi,
  type GoalSupervisorState,
  type GoalToolRestrictionState,
} from "./types.ts";

type Runtime = {
  state?: GoalSupervisorState;
  toolRestriction?: GoalToolRestrictionState;
};

type JudgeFn = (
  state: GoalSupervisorState,
  assistantText: string,
  evidence: string,
  ctx: ContextLike,
) => Promise<GoalJudgeResult> | GoalJudgeResult;

type GoalSupervisorDeps = {
  judge?: JudgeFn;
};

type ContextLike = {
  sessionManager?: {
    getBranch?(): unknown[];
    getCwd?(): string;
    getSessionId?(): string;
  };
  isIdle?(): boolean;
  hasPendingMessages?(): boolean;
  abort?(): void;
  signal?: AbortSignal;
  model?: { provider: string; id: string };
  modelRegistry?: {
    getApiKeyAndHeaders(model: { provider: string; id: string }): Promise<{
      ok?: boolean;
      error?: string;
      apiKey?: string;
      headers?: Record<string, string>;
    }>;
  };
  ui?: {
    notify?(message: string, type?: "info" | "warning" | "error"): void;
    setWidget?(
      key: string,
      content: string[] | undefined,
      options?: { placement?: string },
    ): void;
  };
};

type BeforeAgentStartEvent = {
  systemPrompt?: string;
  prompt?: string;
};

type TurnEndEvent = {
  message?: unknown;
};

type ToolCallEvent = {
  toolName?: string;
};

const GOAL_PERMISSION_TOOL_NAMES = new Set(["ask_user", "interview"]);

function now(): string {
  return new Date().toISOString();
}

function contextCwd(ctx: ContextLike): string {
  return ctx.sessionManager?.getCwd?.() ?? ".";
}

function contextSessionId(ctx: ContextLike): string | undefined {
  return ctx.sessionManager?.getSessionId?.();
}

function isGoalPermissionTool(toolName: string): boolean {
  return (
    GOAL_PERMISSION_TOOL_NAMES.has(toolName) ||
    /(^|_)(ask|confirm|confirmation|permission|permissions|approve|approval|approvals|hitl)($|_)/i.test(
      toolName,
    ) ||
    /^retool_retool_(list_pending_react_app_thread_reviews|view_pending_react_app_thread_hitl|respond_to_react_app_thread_review|list_pending_react_app_function_approvals)$/.test(
      toolName,
    )
  );
}

function isActiveGoalState(state: GoalSupervisorState | undefined): boolean {
  return (
    state?.status === "running" ||
    state?.status === "paused" ||
    state?.status === "judging" ||
    state?.status === "blocked"
  );
}

function sameTools(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((tool, index) => tool === right[index])
  );
}

function isGoalToolRestrictionState(
  value: unknown,
): value is GoalToolRestrictionState {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.version === 1 &&
    typeof record.active === "boolean" &&
    typeof record.updatedAt === "string" &&
    (record.savedActiveTools === undefined ||
      (Array.isArray(record.savedActiveTools) &&
        record.savedActiveTools.every((tool) => typeof tool === "string")))
  );
}

function restoreToolRestrictionFromEntries(
  entries: Array<{ type?: string; customType?: string; data?: unknown }>,
): GoalToolRestrictionState | undefined {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (
      entry?.type === "custom" &&
      entry.customType === TOOL_RESTRICTION_CUSTOM_TYPE &&
      isGoalToolRestrictionState(entry.data)
    ) {
      return entry.data;
    }
  }
  return undefined;
}

function appendToolRestriction(
  pi: GoalSupervisorApi,
  restriction: GoalToolRestrictionState,
): void {
  pi.appendEntry?.(TOOL_RESTRICTION_CUSTOM_TYPE, restriction);
}

function filterExistingTools(pi: GoalSupervisorApi, tools: string[]): string[] {
  const allToolNames = pi.getAllTools?.().map((tool) => tool.name);
  if (!allToolNames) return tools;
  const available = new Set(allToolNames);
  return tools.filter((tool) => available.has(tool));
}

function applyGoalToolRestrictions(
  runtime: Runtime,
  pi: GoalSupervisorApi,
): void {
  if (!pi.getActiveTools || !pi.setActiveTools) return;
  const activeTools = pi.getActiveTools();
  if (isActiveGoalState(runtime.state)) {
    if (!runtime.toolRestriction?.active) {
      runtime.toolRestriction = {
        version: 1,
        active: true,
        updatedAt: now(),
        savedActiveTools: activeTools,
      };
      appendToolRestriction(pi, runtime.toolRestriction);
    }
    const filtered = activeTools.filter((tool) => !isGoalPermissionTool(tool));
    if (!sameTools(activeTools, filtered)) pi.setActiveTools(filtered);
    return;
  }
  if (!runtime.toolRestriction?.active) return;
  const restored = filterExistingTools(
    pi,
    runtime.toolRestriction.savedActiveTools ?? [],
  );
  if (!sameTools(activeTools, restored)) pi.setActiveTools(restored);
  runtime.toolRestriction = {
    version: 1,
    active: false,
    updatedAt: now(),
    savedActiveTools: restored,
  };
  appendToolRestriction(pi, runtime.toolRestriction);
}

function restore(runtime: Runtime, ctx: ContextLike): void {
  const branch = ctx.sessionManager?.getBranch?.();
  if (!branch) return;
  const entries = branch.map(
    (entry) => entry as { type?: string; customType?: string; data?: unknown },
  );
  runtime.state = restoreStateFromEntries(entries);
  runtime.toolRestriction = restoreToolRestrictionFromEntries(entries);
}

function safeNotify(
  ctx: ContextLike,
  message: string,
  type: "info" | "warning" | "error" = "info",
): void {
  try {
    ctx.ui?.notify?.(message, type);
  } catch (error) {
    if (!String(error).includes("stale")) throw error;
  }
}

function updateWidget(
  ctx: ContextLike,
  state: GoalSupervisorState | undefined,
): void {
  try {
    if (
      !state ||
      state.status === "idle" ||
      state.status === "stopped" ||
      state.status === "complete"
    ) {
      ctx.ui?.setWidget?.("goal-supervisor", undefined);
      return;
    }
    ctx.ui?.setWidget?.(
      "goal-supervisor",
      [
        `goal: ${state.status} ${state.iteration} turns`,
        state.objective.slice(0, 100),
      ],
      { placement: "aboveEditor" },
    );
  } catch (error) {
    if (!String(error).includes("stale")) throw error;
  }
}

function queueIfSafe(
  runtime: Runtime,
  pi: GoalSupervisorApi,
  ctx: ContextLike,
  reason: Parameters<typeof queueContinuation>[2]["reason"],
): void {
  if (!runtime.state) return;
  runtime.state = queueContinuation(runtime.state, pi, {
    idle: ctx.isIdle?.() ?? true,
    pendingMessages: ctx.hasPendingMessages?.() ?? false,
    now: now(),
    reason,
  });
  updateWidget(ctx, runtime.state);
}

function isSupervisorContinuationPrompt(prompt: string | undefined): boolean {
  return prompt?.includes("[GOAL SUPERVISOR CONTINUATION") ?? false;
}

async function judgeCurrentClaim(
  runtime: Runtime,
  deps: GoalSupervisorDeps,
  ctx: ContextLike,
  assistantText: string,
): Promise<void> {
  if (!runtime.state?.lastDoneClaim) return;
  const evidence = runtime.state.lastDoneClaim.evidence;
  const precheck = deterministicPrecheck(assistantText, evidence, now());
  const judgeResult =
    precheck.verdict === "inconclusive"
      ? await (deps.judge ?? judgeWithCurrentModel)(
          runtime.state,
          assistantText,
          evidence,
          ctx,
        )
      : precheck;
  runtime.state = applyJudgeResult(runtime.state, judgeResult);
}

function supervisorPrompt(state: GoalSupervisorState): string {
  return `

## Goal Supervisor
Active objective: ${state.objective}
Status: ${state.status}; turns: ${state.iteration}.
Goal mode disables direct user asking, approval, confirmation, and HITL tools. Automatic command/tool blockers remain active. Do not ask for approval, confirmation, clarification, or a product/workflow decision.
Autonomy rule: keep going unless you have verified you are 100% blocked by an automatic command/tool blocker or a missing required tool, credential, auth, access, or service. Do not block for internal plan approval, routine local work, minor/reversible local edits, tests, docs, formatting, routine implementation choices, user permission policy, or any other safe local/read-only/reversible next step.
Default execution posture: use the main agent by default. Do not start a supervised team, reviewer swarm, reducer workflow, or child-agent workflow from this goal prompt.
Contract Gate: for nontrivial implementation, refactor, migration, PR-sized, schema/API, docs-surface, or cross-file goals, build a compact contract card and owner map before editing. The contract card must name the public behavior/API/schema/config/env names, compatibility boundaries, required docs/tests surfaces, explicit non-goals, and forbidden alternate shapes or artifacts. The owner map must identify the likely source-of-truth files/layers that should own the behavior.
Owner map review: during final self-review, explain any expected owner surface that was not touched.
Use GOAL_BLOCKED only for an actual automatic command/tool blocker or a missing required tool, credential, auth, access, or service. If blocked, write exactly: GOAL_BLOCKED: <specific blocker and evidence that no safe non-asking next step exists>.
When fully complete, write: GOAL_DONE: <specific evidence from transcript/artifacts/verifications>.`;
}

export function registerGoalSupervisor(
  pi: GoalSupervisorApi,
  runtime: Runtime = {},
  deps: GoalSupervisorDeps = {},
): void {
  pi.registerCommand?.("goal", {
    description:
      "Run a session-scoped goal until evidence-backed completion. Usage: /goal <objective> | start <objective> | status | pause | resume | clear | done <evidence> | help",
    getArgumentCompletions: getGoalArgumentCompletions,
    handler: async (args: string, rawCtx: unknown) => {
      const ctx = rawCtx as ContextLike;
      restore(runtime, ctx);
      try {
        const result = handleCommand(runtime.state, args, {
          cwd: contextCwd(ctx),
          sessionId: contextSessionId(ctx),
          now: now(),
        });
        runtime.state = result.state;
        if (runtime.state) appendState(pi, runtime.state);
        safeNotify(ctx, result.message);
        updateWidget(ctx, runtime.state);
        applyGoalToolRestrictions(runtime, pi);
        if (runtime.state?.status === "judging") {
          await judgeCurrentClaim(
            runtime,
            deps,
            ctx,
            runtime.state.lastAssistantText ?? "",
          );
          if (runtime.state) appendState(pi, runtime.state);
          updateWidget(ctx, runtime.state);
          applyGoalToolRestrictions(runtime, pi);
          const statusAfterJudge: string | undefined = runtime.state?.status;
          if (statusAfterJudge === "running")
            queueIfSafe(runtime, pi, ctx, "judge_rejected");
        }
        if (result.abortTurn) {
          ctx.abort?.();
        }
        if (
          result.shouldQueueContinuation &&
          runtime.state &&
          result.continuationReason
        )
          queueIfSafe(runtime, pi, ctx, result.continuationReason);
        applyGoalToolRestrictions(runtime, pi);
      } catch (error) {
        safeNotify(
          ctx,
          error instanceof Error ? error.message : String(error),
          "warning",
        );
      }
    },
  });

  pi.on?.("session_start", (_event: unknown, rawCtx: unknown) => {
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    updateWidget(ctx, runtime.state);
    applyGoalToolRestrictions(runtime, pi);
    queueIfSafe(runtime, pi, ctx, "session_start");
    applyGoalToolRestrictions(runtime, pi);
  });

  pi.on?.("before_agent_start", (rawEvent: unknown, rawCtx: unknown) => {
    const event = rawEvent as BeforeAgentStartEvent;
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    if (
      runtime.state?.status === "blocked" &&
      runtime.state.lastBlocker?.source === "marker"
    ) {
      runtime.state = reduceState(runtime.state, {
        type: "resumed",
        now: now(),
      });
      appendState(pi, runtime.state);
    }
    applyGoalToolRestrictions(runtime, pi);
    if (!runtime.state || runtime.state.status !== "running") {
      if (isSupervisorContinuationPrompt(event.prompt)) ctx.abort?.();
      return undefined;
    }
    if (
      runtime.state.pendingContinuation &&
      event.prompt?.includes(runtime.state.pendingContinuation.id)
    ) {
      runtime.state = reduceState(runtime.state, {
        type: "continuation_delivered",
        now: now(),
      });
      appendState(pi, runtime.state);
    }
    applyGoalToolRestrictions(runtime, pi);
    return {
      systemPrompt: `${event.systemPrompt ?? ""}${supervisorPrompt(runtime.state)}`,
    };
  });

  pi.on?.("tool_call", (rawEvent: unknown, rawCtx: unknown) => {
    const event = rawEvent as ToolCallEvent;
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    applyGoalToolRestrictions(runtime, pi);
    if (!isActiveGoalState(runtime.state) || !event.toolName) return undefined;
    if (!isGoalPermissionTool(event.toolName)) return undefined;
    return {
      block: true,
      reason: `Goal mode disables user permission/asking tool '${event.toolName}'; automatic command/tool blockers remain active.`,
    };
  });

  pi.on?.("turn_end", async (rawEvent: unknown, rawCtx: unknown) => {
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    if (!runtime.state || runtime.state.status !== "running") return;
    const event = rawEvent as TurnEndEvent;
    const assistantText = extractAssistantText(
      event.message as { content?: unknown },
    );
    runtime.state = reduceState(runtime.state, {
      type: "turn_recorded",
      assistantText,
      fingerprint: assistantFingerprint(assistantText),
      now: now(),
    });
    const markers = parseGoalMarkers(assistantText);
    if (markers.blocked && isAllowedGoalBlocker(markers.blocked))
      runtime.state = reduceState(runtime.state, {
        type: "blocked",
        reason: markers.blocked,
        now: now(),
        source: "marker",
      });
    else if (markers.done) {
      runtime.state = reduceState(runtime.state, {
        type: "done_claimed",
        evidence: markers.done,
        source: "marker",
        now: now(),
      });
      await judgeCurrentClaim(runtime, deps, ctx, assistantText);
    }
    appendState(pi, runtime.state);
    updateWidget(ctx, runtime.state);
    applyGoalToolRestrictions(runtime, pi);
    queueIfSafe(runtime, pi, ctx, "turn_end");
    applyGoalToolRestrictions(runtime, pi);
  });

  pi.on?.("session_before_compact", (_event: unknown) => {
    if (runtime.state)
      pi.appendEntry?.(STATE_CUSTOM_TYPE, serializeState(runtime.state));
    return undefined;
  });

  pi.on?.("session_compact", (_event: unknown, rawCtx: unknown) => {
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    if (runtime.state)
      runtime.state = reduceState(runtime.state, {
        type: "compacted",
        now: now(),
      });
    if (runtime.state) appendState(pi, runtime.state);
    applyGoalToolRestrictions(runtime, pi);
    queueIfSafe(runtime, pi, ctx, "compact");
    applyGoalToolRestrictions(runtime, pi);
  });

  pi.on?.("session_tree", (_event: unknown, rawCtx: unknown) => {
    const ctx = rawCtx as ContextLike;
    restore(runtime, ctx);
    updateWidget(ctx, runtime.state);
    applyGoalToolRestrictions(runtime, pi);
  });

  pi.on?.("session_shutdown", () => {
    if (runtime.state)
      pi.appendEntry?.(STATE_CUSTOM_TYPE, serializeState(runtime.state));
  });
}

export default async function piGoalSupervisor(
  pi: GoalSupervisorApi,
): Promise<void> {
  registerGoalSupervisor(pi);
}
