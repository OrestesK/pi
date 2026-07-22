import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type AllowedToolsDocument = {
  version: 1;
  tools: string[];
};

function loadAllowedTools(profileRoot: string): string[] {
  const value: unknown = JSON.parse(
    readFileSync(join(profileRoot, "allowed-tools.json"), "utf8"),
  );
  if (!value || typeof value !== "object")
    throw new Error("allowed-tools.json must be an object");

  const document = value as Partial<AllowedToolsDocument>;
  if (
    document.version !== 1 ||
    !Array.isArray(document.tools) ||
    document.tools.length === 0 ||
    !document.tools.every((tool) => typeof tool === "string" && tool.length > 0) ||
    new Set(document.tools).size !== document.tools.length
  )
    throw new Error("allowed-tools.json must contain unique tool names");
  return document.tools;
}

export default function (pi: ExtensionAPI) {
  pi.on("session_start", () => {
    const profileRoot = process.env.PI_CODING_AGENT_DIR;
    const targetPath = process.env.PI_VALKYRIE_TOOL_STATE_PATH;
    if (!profileRoot || !targetPath)
      throw new Error("Valkyrie tool attestation paths are required");

    const allowedTools = loadAllowedTools(profileRoot);
    const registeredTools = pi.getAllTools().map((tool) => tool.name);
    const activeTools = pi.getActiveTools();
    const registered = new Set(registeredTools);
    const allowed = new Set(allowedTools);
    const missing = allowedTools.filter((tool) => !registered.has(tool));
    if (missing.length > 0)
      throw new Error(`allowed tools are not registered: ${missing.join(", ")}`);
    const unexpected = activeTools.filter((tool) => !allowed.has(tool));
    if (unexpected.length > 0)
      throw new Error(`active tools are not allowed: ${unexpected.join(", ")}`);

    mkdirSync(dirname(targetPath), { recursive: true, mode: 0o700 });
    const temporary = `${targetPath}.${process.pid}.tmp`;
    writeFileSync(
      temporary,
      `${JSON.stringify(
        {
          version: 1,
          allowedTools,
          registeredTools,
          activeTools,
        },
        null,
        2,
      )}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    renameSync(temporary, targetPath);
  });
}
