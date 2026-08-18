import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const piRoot = path.resolve(process.env.CLAUDE_UI_PI_ROOT);
const piParentUrl = pathToFileURL(path.join(piRoot, "dist", "cli.js")).href;

export function resolve(specifier, context, nextResolve) {
	if (
		specifier === "@earendil-works/pi-coding-agent" ||
		specifier === "@earendil-works/pi-tui"
	) {
		return nextResolve(specifier, { ...context, parentURL: piParentUrl });
	}

	if (specifier.startsWith(".") && specifier.endsWith(".js") && context.parentURL) {
		const jsPath = path.resolve(
			path.dirname(new URL(context.parentURL).pathname),
			specifier,
		);
		const tsPath = jsPath.replace(/\.js$/, ".ts");
		if (!fs.existsSync(jsPath) && fs.existsSync(tsPath)) {
			return nextResolve(specifier.replace(/\.js$/, ".ts"), context);
		}
	}

	return nextResolve(specifier, context);
}
