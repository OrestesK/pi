import { spawnSync } from "node:child_process";

import {
  DEFAULT_CONFIG,
  MAX_COLUMNS,
  MAX_ROWS,
  type SixelQuality,
} from "./config.ts";

const DEFAULT_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;
const MAX_SIXEL_WIDTH_PER_COLUMN = 32;
const MAX_SIXEL_HEIGHT_PER_ROW = 40;
const MAX_SIXEL_COLOR_INDEX = 255;
const PREVIEW_ERROR = "SIXEL preview unavailable.";
const SIXEL_PREFIX = "\x1bP";
const SIXEL_SUFFIX = "\x1b\\";
const QUALITY_ARGS: Record<SixelQuality, readonly string[]> = {
  balanced: ["--work=5", "--color-space=rgb"],
  high: ["--work=9", "--color-space=din99d"],
};

export interface ChafaRunOptions {
  timeout: number;
  maxBuffer: number;
}

export interface ChafaRunResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export type ChafaRunner = (
  command: string,
  args: readonly string[],
  options: ChafaRunOptions,
) => ChafaRunResult;

export type SixelPreviewResult =
  | {
      ok: true;
      sequence: string;
      widthPx: number;
      heightPx: number;
      rows: number;
    }
  | { ok: false; error: string };

interface ValidatedSixel {
  sequence: string;
  widthPx: number;
  heightPx: number;
}

const defaultChafaRunner: ChafaRunner = (command, args, options) => {
  const result = spawnSync(command, [...args], {
    encoding: "utf8",
    maxBuffer: options.maxBuffer,
    shell: false,
    timeout: options.timeout,
  });

  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
};

function validateSixelBody(
  body: string,
  widthPx: number,
  heightPx: number,
): boolean {
  let column = 0;
  let row = 0;
  let index = 0;
  let sawData = false;

  const advance = (count: number, data: string): boolean => {
    if (!Number.isSafeInteger(count) || column + count > widthPx) {
      return false;
    }
    const dataHeight = 32 - Math.clz32(data.charCodeAt(0) - 63);
    if (row + dataHeight > heightPx) {
      return false;
    }
    column += count;
    sawData = true;
    return true;
  };

  while (index < body.length) {
    const command = body[index];
    if (!command) {
      return false;
    }
    if (command >= "?" && command <= "~") {
      if (!advance(1, command)) {
        return false;
      }
      index++;
      continue;
    }
    if (command === "!") {
      const repeat = /^!([1-9][0-9]*)([?-~])/.exec(body.slice(index));
      if (!repeat || !repeat[2] || !advance(Number(repeat[1]), repeat[2])) {
        return false;
      }
      index += repeat[0].length;
      continue;
    }
    if (command === "$") {
      column = 0;
      index++;
      continue;
    }
    if (command === "-") {
      column = 0;
      row += 6;
      if (row >= heightPx) {
        return false;
      }
      index++;
      continue;
    }
    if (command === "#") {
      const color = /^#([0-9]+)((?:;[0-9]+){4})?/.exec(body.slice(index));
      const colorIndex = Number(color?.[1]);
      if (
        !color ||
        !Number.isSafeInteger(colorIndex) ||
        colorIndex > MAX_SIXEL_COLOR_INDEX
      ) {
        return false;
      }
      if (color[2]) {
        const [colorSpace, ...components] = color[2]
          .slice(1)
          .split(";")
          .map(Number);
        if (
          (colorSpace !== 1 && colorSpace !== 2) ||
          components.length !== 3 ||
          components.some((component) => component > 100)
        ) {
          return false;
        }
      }
      index += color[0].length;
      continue;
    }
    return false;
  }

  return sawData;
}

function validateSixelOutput(
  output: string,
  columns: number,
  maxRows: number,
): ValidatedSixel | undefined {
  const sequence = output.endsWith("\n") ? output.slice(0, -1) : output;
  if (!sequence.startsWith(SIXEL_PREFIX) || !sequence.endsWith(SIXEL_SUFFIX)) {
    return undefined;
  }

  const payload = sequence.slice(SIXEL_PREFIX.length, -SIXEL_SUFFIX.length);
  if (!/^[0-9;]*q[!-~]+$/.test(payload) || payload.includes("\x1b")) {
    return undefined;
  }

  const raster = /^[0-9;]*q"1;1;([1-9][0-9]*);([1-9][0-9]*)/.exec(payload);
  if (!raster) {
    return undefined;
  }
  const widthPx = Number(raster[1]);
  const heightPx = Number(raster[2]);
  if (
    !Number.isSafeInteger(widthPx) ||
    !Number.isSafeInteger(heightPx) ||
    widthPx > columns * MAX_SIXEL_WIDTH_PER_COLUMN ||
    heightPx > maxRows * MAX_SIXEL_HEIGHT_PER_ROW
  ) {
    return undefined;
  }

  const body = payload.slice(raster[0].length);
  if (!validateSixelBody(body, widthPx, heightPx)) {
    return undefined;
  }

  return { sequence, widthPx, heightPx };
}

export function renderSixelPreview(
  imagePath: string,
  width: number,
  maxRows = DEFAULT_CONFIG.maxRows,
  runner: ChafaRunner = defaultChafaRunner,
  quality: SixelQuality = DEFAULT_CONFIG.quality,
): SixelPreviewResult {
  const normalizedWidth = Number.isFinite(width) ? Math.floor(width) : 8;
  const normalizedRows = Number.isFinite(maxRows)
    ? Math.floor(maxRows)
    : DEFAULT_CONFIG.maxRows;
  const safeWidth = Math.max(8, Math.min(MAX_COLUMNS, normalizedWidth));
  const safeRows = Math.max(1, Math.min(MAX_ROWS, normalizedRows));
  const result = runner(
    "chafa",
    [
      "--format=sixels",
      `--size=${safeWidth}x${safeRows}`,
      "--animate=off",
      "--polite=on",
      ...QUALITY_ARGS[quality],
      "--",
      imagePath,
    ],
    {
      timeout: DEFAULT_TIMEOUT_MS,
      maxBuffer: DEFAULT_MAX_BUFFER_BYTES,
    },
  );

  if (result.error || result.status !== 0) {
    return { ok: false, error: PREVIEW_ERROR };
  }

  const sixel = validateSixelOutput(result.stdout, safeWidth, safeRows);
  if (!sixel) {
    return { ok: false, error: PREVIEW_ERROR };
  }

  return { ok: true, ...sixel, rows: safeRows };
}

export const _test = {
  validateSixelOutput,
};
