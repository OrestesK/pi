import type {
	AgentEndEvent,
	BeforeAgentStartEvent,
	ExtensionAPI,
	ExtensionContext,
	SessionCompactEvent,
	SessionShutdownEvent,
	SessionStartEvent,
	SessionTreeEvent,
	TurnEndEvent,
} from "@earendil-works/pi-coding-agent";
import type {
	ReflectionObservation,
	ReflectionProvider,
} from "./contracts.ts";
import {
	loadReflectionConfig,
	type ReflectionConfig,
} from "./config.ts";
import { ReflectionController } from "./controller.ts";
import { PiSubagentsReflectionProvider } from "./providers/pi-subagents.ts";
import { ReflectionProviderRegistry } from "./registry.ts";
import { ReflectionScheduler } from "./scheduler.ts";
import { REFLECTION_SEMANTIC_BUNDLE } from "./semantic-bundle.ts";

export const REFLECTION_PROVIDER_DISCOVERY_EVENT =
	"pi-reflection:providers:discover:v1";

export type ReflectionProviderDiscovery = Readonly<{
	register(provider: ReflectionProvider): () => void;
}>;

export type ReflectionRuntime = Readonly<{
	getObservations(): readonly ReflectionObservation[];
}>;

export function registerReflectionExtension(
	pi: ExtensionAPI,
	config: ReflectionConfig = loadReflectionConfig(),
): ReflectionRuntime | undefined {
	if (!config.enabled) return undefined;

	const provider = new PiSubagentsReflectionProvider(pi.events, {
		pingTimeoutMs: config.readinessTimeoutMs,
	});
	if (!provider.isHostEligible()) {
		provider.dispose();
		return undefined;
	}

	const registry = new ReflectionProviderRegistry();
	registry.register(provider);
	const controller = new ReflectionController(registry);
	let cwd: string;

	const scheduler = new ReflectionScheduler({
		config,
		bundleReady: REFLECTION_SEMANTIC_BUNDLE.ready,
		onEvent: (event) => {
			switch (event.type) {
				case "session_started":
					controller.startSession(event.sessionId);
					break;
				case "invalidated":
					controller.advanceRevision();
					break;
				case "checkpoint":
					if (!event.checkpoint.launchReady) {
						controller.recordResourcesNotReady(event.checkpoint);
						break;
					}
					controller.submit({
						laneId: event.checkpoint.laneId,
						stateKey: event.checkpoint.stateKey,
						cwd,
						payload: REFLECTION_SEMANTIC_BUNDLE.manifest,
						...(config.providerId === undefined
							? {}
							: { providerId: config.providerId }),
					});
					break;
				case "shutdown":
					controller.closeSession();
					break;
			}
		},
	});

	pi.on("session_start", (_event: SessionStartEvent, ctx: ExtensionContext) => {
		cwd = ctx.cwd;
		scheduler.sessionStart(ctx.sessionManager.getSessionId());
		pi.events.emit(REFLECTION_PROVIDER_DISCOVERY_EVENT, {
			register: (candidate: ReflectionProvider) => registry.register(candidate),
		} satisfies ReflectionProviderDiscovery);
		void provider.refreshAvailability();
	});

	pi.on("before_agent_start", (
		_event: BeforeAgentStartEvent,
		ctx: ExtensionContext,
	) => {
		cwd = ctx.cwd;
		scheduler.beforeAgentStart();
	});

	pi.on("turn_end", (_event: TurnEndEvent, ctx: ExtensionContext) => {
		cwd = ctx.cwd;
		scheduler.turnEnd();
	});

	pi.on("agent_end", (_event: AgentEndEvent, ctx: ExtensionContext) => {
		cwd = ctx.cwd;
		scheduler.agentEnd();
	});

	pi.on("session_tree", (_event: SessionTreeEvent, ctx: ExtensionContext) => {
		cwd = ctx.cwd;
		scheduler.treeNavigation();
	});

	pi.on("session_compact", (
		_event: SessionCompactEvent,
		ctx: ExtensionContext,
	) => {
		cwd = ctx.cwd;
		scheduler.compactionRevision();
	});

	pi.on("session_shutdown", (
		_event: SessionShutdownEvent,
		_ctx: ExtensionContext,
	) => {
		scheduler.shutdown();
		controller.dispose();
		registry.dispose();
	});

	return {
		getObservations: () => controller.getObservations(),
	};
}

export default function piReflection(pi: ExtensionAPI): void {
	registerReflectionExtension(pi);
}
