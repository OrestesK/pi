import type {} from "@earendil-works/pi-agent-core";

declare module "@earendil-works/pi-agent-core" {
	interface AgentToolResult<T> {
		/** Tool-level error marker used by Pi tool results. */
		isError?: boolean;
	}
}

export {};
