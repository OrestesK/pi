// @ts-ignore Pi runtime resolves SDK imports after setup installs the pinned package.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("stop", {
    description: "Stop the active model response",
    handler: async (_args, ctx) => {
      ctx.abort();
    },
  });
}
