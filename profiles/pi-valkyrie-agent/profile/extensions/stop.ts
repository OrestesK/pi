// @ts-expect-error Pi runtime resolves SDK imports outside this config repo.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("stop", {
    description: "Stop the active model response",
    handler: (_args, ctx) => {
      ctx.abort();
    },
  });
}
