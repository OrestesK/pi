import { lstatSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  basename,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { type ChafaRunner, renderSixelPreview } from "./chafa.ts";
import { DEFAULT_CONFIG, loadSettings, type SixelConfig } from "./config.ts";

const CUSTOM_MESSAGE_TYPE = "pi-sixel-preview";
const MAX_GENERATED_IMAGES_PER_PREVIEW = 1;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
// Pi 0.80.3 only exempts Kitty/iTerm image lines from text normalization.
// SIXEL terminals ignore this empty iTerm marker, then render the validated DCS.
const ITERM_IMAGE_MARKER = "\x1b]1337;File=inline=1:\x07";
const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);
const CLIPBOARD_BASENAME = /^pi-clipboard-[0-9a-f-]+\.(?:gif|jpe?g|png|webp)$/i;

interface PreviewDetails {
  paths: string[];
  source: "clipboard" | "generated";
}

export interface PiSixelOptions {
  config?: Readonly<SixelConfig>;
  runner?: ChafaRunner;
  schedule?: (callback: () => void) => void;
}

interface PreviewComponent {
  invalidate(): void;
  render(width: number): string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isInside(root: string, candidate: string): boolean {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromRoot))
  );
}

function validatedRegularImage(path: string): string | undefined {
  try {
    if (!IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) {
      return undefined;
    }
    const stats = lstatSync(path);
    if (
      !stats.isFile() ||
      stats.isSymbolicLink() ||
      stats.size > MAX_IMAGE_BYTES
    ) {
      return undefined;
    }
    return realpathSync(path);
  } catch {
    return undefined;
  }
}

function validateClipboardImagePath(path: string): string | undefined {
  if (!CLIPBOARD_BASENAME.test(basename(path))) {
    return undefined;
  }
  const validated = validatedRegularImage(path);
  if (!validated) {
    return undefined;
  }
  const temporaryRoot = realpathSync(tmpdir());
  return isInside(temporaryRoot, validated) ? validated : undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findClipboardImagePaths(
  prompt: string,
  maxImages: number,
): string[] {
  const temporaryRoot = resolve(tmpdir());
  const pattern = new RegExp(
    `${escapeRegExp(temporaryRoot)}${escapeRegExp(sep)}pi-clipboard-[0-9a-f-]+\\.(?:gif|jpe?g|png|webp)`,
    "gi",
  );
  const paths: string[] = [];
  for (const match of prompt.matchAll(pattern)) {
    const path = validateClipboardImagePath(match[0]);
    if (path && !paths.includes(path)) {
      paths.push(path);
    }
    if (paths.length === maxImages) {
      break;
    }
  }
  return paths;
}

function findGeneratedImagePath(details: unknown): string | undefined {
  if (!isRecord(details) || typeof details.saved_path !== "string") {
    return undefined;
  }
  return validatedRegularImage(details.saved_path);
}

function parsePreviewDetails(
  value: unknown,
  maxClipboardImages: number,
): PreviewDetails | undefined {
  if (
    !isRecord(value) ||
    (value.source !== "clipboard" && value.source !== "generated") ||
    !Array.isArray(value.paths)
  ) {
    return undefined;
  }

  const isClipboard = value.source === "clipboard";
  const validate = isClipboard
    ? validateClipboardImagePath
    : validatedRegularImage;
  const maxImages = isClipboard
    ? maxClipboardImages
    : MAX_GENERATED_IMAGES_PER_PREVIEW;
  const paths = value.paths.slice(0, maxImages).flatMap((path) => {
    if (typeof path !== "string") {
      return [];
    }
    const validated = validate(path);
    return validated ? [validated] : [];
  });
  if (paths.length === 0) {
    return undefined;
  }

  return {
    paths,
    source: value.source,
  };
}

function previewLabel(source: PreviewDetails["source"]): string {
  return source === "clipboard"
    ? "Pasted image preview"
    : "Generated image preview";
}

function truncatePlainText(value: string, width: number): string {
  return Array.from(value)
    .slice(0, Math.max(1, Math.floor(width)))
    .join("");
}

class SixelPreviewComponent implements PreviewComponent {
  private readonly cache = new Map<number, string[]>();
  private readonly config: Readonly<SixelConfig>;
  private readonly details: PreviewDetails;
  private readonly runner?: ChafaRunner;

  constructor(
    details: PreviewDetails,
    config: Readonly<SixelConfig>,
    runner?: ChafaRunner,
  ) {
    this.config = config;
    this.details = details;
    this.runner = runner;
  }

  invalidate(): void {
    this.cache.clear();
  }

  render(width: number): string[] {
    const availableWidth = Math.max(1, Math.floor(width));
    const label = truncatePlainText(
      previewLabel(this.details.source),
      availableWidth,
    );
    if (availableWidth < 8) {
      return [label];
    }
    const safeWidth = Math.min(this.config.maxColumns, availableWidth - 2);
    const cached = this.cache.get(safeWidth);
    if (cached) {
      return cached;
    }

    const lines = [label];
    for (const path of this.details.paths) {
      lines.push("");
      const preview = renderSixelPreview(
        path,
        safeWidth,
        this.config.maxRows,
        this.runner,
        this.config.quality,
      );
      if (preview.ok) {
        for (let row = 1; row < preview.rows; row++) {
          lines.push("");
        }
        const moveUp =
          preview.rows > 1 ? `\x1b[${String(preview.rows - 1)}A` : "";
        lines.push(`${moveUp}${ITERM_IMAGE_MARKER}${preview.sequence}`);
      } else {
        lines.push(truncatePlainText(preview.error, safeWidth));
      }
    }
    this.cache.set(safeWidth, lines);
    return lines;
  }
}

function previewMessage(details: PreviewDetails) {
  return {
    customType: CUSTOM_MESSAGE_TYPE,
    content: [{ type: "text" as const, text: previewLabel(details.source) }],
    display: true,
    details,
  };
}

export function createPiSixel(options: PiSixelOptions = {}) {
  return (pi: ExtensionAPI): void => {
    const config = options.config ?? DEFAULT_CONFIG;
    const pendingGeneratedPaths = new Set<string>();
    const schedule =
      options.schedule ??
      ((callback: () => void) => void setTimeout(callback, 0));

    pi.registerMessageRenderer<PreviewDetails>(
      CUSTOM_MESSAGE_TYPE,
      (message) => {
        const details = parsePreviewDetails(
          message.details,
          config.maxImages,
        );
        return details
          ? new SixelPreviewComponent(details, config, options.runner)
          : undefined;
      },
    );

    pi.registerMessageRenderer("image_generation_call", (message) => {
      const path = findGeneratedImagePath(message.details);
      return path
        ? new SixelPreviewComponent(
            {
              paths: [path],
              source: "generated",
            },
            config,
            options.runner,
          )
        : undefined;
    });

    pi.on("before_agent_start", (event) => {
      const paths = findClipboardImagePaths(event.prompt, config.maxImages);
      if (paths.length === 0) {
        return undefined;
      }
      return {
        message: previewMessage({
          paths,
          source: "clipboard",
        }),
      };
    });

    pi.on("tool_execution_end", (event) => {
      if (event.toolName !== "image_generation" || event.isError) {
        return;
      }
      const result = isRecord(event.result) ? event.result : undefined;
      const path = findGeneratedImagePath(result?.details);
      if (
        path &&
        pendingGeneratedPaths.size < MAX_GENERATED_IMAGES_PER_PREVIEW
      ) {
        pendingGeneratedPaths.add(path);
      }
    });

    pi.on("agent_end", (_event, ctx) => {
      const paths = [...pendingGeneratedPaths].slice(
        0,
        MAX_GENERATED_IMAGES_PER_PREVIEW,
      );
      if (paths.length === 0) {
        return;
      }
      pendingGeneratedPaths.clear();
      schedule(() => {
        if (!ctx.isIdle()) {
          for (const path of paths) {
            pendingGeneratedPaths.add(path);
          }
          return;
        }
        pi.sendMessage(
          previewMessage({
            paths,
            source: "generated",
          }),
        );
      });
    });
  };
}

export function createConfiguredPiSixel(
  options: Omit<PiSixelOptions, "config"> = {},
) {
  return createPiSixel({ ...options, config: loadSettings() });
}

export default function piSixel(pi: ExtensionAPI): void {
  createConfiguredPiSixel()(pi);
}

export const _test = {
  findClipboardImagePaths,
  findGeneratedImagePath,
  parsePreviewDetails,
  validateClipboardImagePath,
  validatedRegularImage,
};
