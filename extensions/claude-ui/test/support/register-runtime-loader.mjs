import { registerHooks } from "node:module";
import { resolve } from "./runtime-loader.mjs";

if (!process.env.CLAUDE_UI_PI_ROOT) {
	throw new Error("CLAUDE_UI_PI_ROOT must point to the active pi-coding-agent package");
}

registerHooks({ resolve });
