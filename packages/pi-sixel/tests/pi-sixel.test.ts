import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  type Component,
  Container,
  type Terminal,
  TUI,
} from "@earendil-works/pi-tui";

import { type ChafaRunner, renderSixelPreview } from "../src/chafa.ts";
import { createConfiguredPiSixel, createPiSixel, _test } from "../src/index.ts";

const SIXEL_SEQUENCE = '\x1bP0;1;0q"1;1;400;240#0;2;0;0;0#0!4?\x1b\\';
const SIXEL_OUTPUT = `${SIXEL_SEQUENCE}\n`;
const ITERM_IMAGE_MARKER = "\x1b]1337;File=inline=1:\x07";

function assertSixelComponent(lines: string[], label: string, rows = 36): void {
  assert.equal(lines.length, rows + 2);
  assert.equal(lines[0], label);
  assert.ok(lines.slice(1, -1).every((line) => line === ""));
  assert.equal(
    lines.at(-1),
    `\x1b[${String(rows - 1)}A${ITERM_IMAGE_MARKER}${SIXEL_SEQUENCE}`,
  );
}

class RecordingTerminal implements Terminal {
  columns = 80;
  rows = 40;
  readonly kittyProtocolActive = false;
  readonly writes: string[] = [];

  start(): void {}
  stop(): void {}
  drainInput(): Promise<void> {
    return Promise.resolve();
  }
  write(data: string): void {
    this.writes.push(data);
  }
  moveBy(): void {}
  hideCursor(): void {}
  showCursor(): void {}
  clearLine(): void {}
  clearFromCursor(): void {}
  clearScreen(): void {}
  setTitle(): void {}
  setProgress(): void {}
}

function temporaryImagePath(
  prefix = "pi-clipboard",
  extension = "png",
): string {
  const path = join(tmpdir(), `${prefix}-${randomUUID()}.${extension}`);
  writeFileSync(path, Buffer.from("image fixture"));
  return path;
}

test("renders one bounded native SIXEL stream using fixed arguments", () => {
  let invocation:
    | {
        command: string;
        args: readonly string[];
        timeout: number;
        maxBuffer: number;
      }
    | undefined;
  const runner: ChafaRunner = (command, args, options) => {
    invocation = { command, args, ...options };
    return {
      status: 0,
      stdout: SIXEL_OUTPUT,
      stderr: "",
    };
  };

  const result = renderSixelPreview("/tmp/image.png", 40, 12, runner);

  assert.deepEqual(result, {
    ok: true,
    sequence: SIXEL_SEQUENCE,
    widthPx: 400,
    heightPx: 240,
    rows: 12,
  });
  assert.deepEqual(invocation, {
    command: "chafa",
    args: [
      "--format=sixels",
      "--size=40x12",
      "--animate=off",
      "--polite=on",
      "--work=9",
      "--color-space=din99d",
      "--",
      "/tmp/image.png",
    ],
    timeout: 5_000,
    maxBuffer: 4 * 1024 * 1024,
  });
});

test("accepts a Chafa-style 120×36 high-quality raster", () => {
  const body = `#0;2;0;0;0#0!1080?${"-#0!1080?".repeat(119)}`;
  const sequence = `\x1bP0;1;0q"1;1;1080;720${body}\x1b\\`;
  const runner: ChafaRunner = () => ({
    status: 0,
    stdout: `${sequence}\n`,
    stderr: "",
  });

  assert.deepEqual(renderSixelPreview("/tmp/image.png", 120, 36, runner), {
    ok: true,
    sequence,
    widthPx: 1080,
    heightPx: 720,
    rows: 36,
  });
});

test("uses deterministic balanced Chafa settings when configured", () => {
  let args: readonly string[] | undefined;
  const runner: ChafaRunner = (_command, invocationArgs) => {
    args = invocationArgs;
    return {
      status: 0,
      stdout: SIXEL_OUTPUT,
      stderr: "",
    };
  };

  assert.equal(
    renderSixelPreview("/tmp/image.png", 40, 12, runner, "balanced").ok,
    true,
  );
  assert.deepEqual(args, [
    "--format=sixels",
    "--size=40x12",
    "--animate=off",
    "--polite=on",
    "--work=5",
    "--color-space=rgb",
    "--",
    "/tmp/image.png",
  ]);
});

test("rejects malformed or compound SIXEL streams", () => {
  const invalidOutputs = [
    SIXEL_SEQUENCE.slice(0, -2),
    `${SIXEL_SEQUENCE}\ntrailing`,
    `${SIXEL_SEQUENCE}${SIXEL_SEQUENCE}`,
    '\x1bP0;1;0q"1;1;400;240?\x1b[31m\x1b\\',
    '\x1bP0;1;0q"1;1;400;240?\u009b\x1b\\',
    "\x1bP0;1;0q?\x1b\\",
    '\x1bP0;1;0q"1;1;99999;99999?\x1b\\',
    '\x1bP0;1;0q"1;1;1;1?"1;1;99999;99999?\x1b\\',
    '\x1bP0;1;0q"1;1;1;1!999999999?\x1b\\',
    `\x1bP0;1;0q"1;1;1;1${"?".repeat(100_000)}\x1b\\`,
    `\x1bP0;1;0q"1;1;1;1${"-".repeat(10_000)}?\x1b\\`,
  ];

  for (const stdout of invalidOutputs) {
    const runner: ChafaRunner = () => ({ status: 0, stdout, stderr: "" });
    assert.deepEqual(renderSixelPreview("/tmp/image.png", 40, 12, runner), {
      ok: false,
      error: "SIXEL preview unavailable.",
    });
  }
});

test("rejects oversized rasters when dimensions are non-finite", () => {
  const oversizedWidth: ChafaRunner = () => ({
    status: 0,
    stdout: '\x1bP0;1;0q"1;1;99999;1?\x1b\\',
    stderr: "",
  });
  const oversizedHeight: ChafaRunner = () => ({
    status: 0,
    stdout: '\x1bP0;1;0q"1;1;1;99999?\x1b\\',
    stderr: "",
  });

  assert.deepEqual(
    renderSixelPreview("/tmp/image.png", Number.NaN, 12, oversizedWidth),
    { ok: false, error: "SIXEL preview unavailable." },
  );
  assert.deepEqual(
    renderSixelPreview("/tmp/image.png", 40, Number.NaN, oversizedHeight),
    { ok: false, error: "SIXEL preview unavailable." },
  );
});

test("does not expose Chafa stderr", () => {
  const runner: ChafaRunner = () => ({
    status: 1,
    stdout: "",
    stderr: "\x1b]52;c;malicious\x07",
  });

  assert.deepEqual(renderSixelPreview("/tmp/image.png", 40, 12, runner), {
    ok: false,
    error: "SIXEL preview unavailable.",
  });
});

test("registers on every terminal because installation is the opt-in", () => {
  const events: string[] = [];
  const rendererTypes: string[] = [];
  const pi = {
    on(event: string) {
      events.push(event);
    },
    registerMessageRenderer(type: string) {
      rendererTypes.push(type);
    },
    sendMessage() {},
  };

  createPiSixel()(pi as never);

  assert.deepEqual(rendererTypes, [
    "pi-sixel-preview",
    "image_generation_call",
  ]);
  assert.deepEqual(events, [
    "before_agent_start",
    "tool_execution_end",
    "agent_end",
  ]);
});

test("applies configured preview bounds and quality", () => {
  const clipboardPath = temporaryImagePath();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  let args: readonly string[] | undefined;
  const runner: ChafaRunner = (_command, invocationArgs) => {
    args = invocationArgs;
    return { status: 0, stdout: SIXEL_OUTPUT, stderr: "" };
  };
  const pi = {
    on() {},
    registerMessageRenderer(
      type: string,
      renderer: (...args: unknown[]) => unknown,
    ) {
      renderers.set(type, renderer);
    },
    sendMessage() {},
  };
  createPiSixel({
    config: {
      maxColumns: 40,
      maxRows: 12,
      maxImages: 4,
      quality: "balanced",
    },
    runner,
  })(pi as never);

  try {
    const renderer = renderers.get("pi-sixel-preview");
    assert.ok(renderer);
    const component = renderer(
      { details: { paths: [clipboardPath], source: "clipboard" } },
      {},
      {},
    ) as { render(width: number): string[] };
    assertSixelComponent(component.render(80), "Pasted image preview", 12);
    assert.ok(args?.includes("--size=40x12"));
    assert.ok(args?.includes("--work=5"));
    assert.ok(args?.includes("--color-space=rgb"));
  } finally {
    rmSync(clipboardPath, { force: true });
  }
});

test("applies settings-file values through the package entrypoint", () => {
  const root = join(tmpdir(), `pi-sixel-settings-${randomUUID()}`);
  const agentDir = join(root, "agent");
  const clipboardPath = temporaryImagePath();
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  let args: readonly string[] | undefined;
  const runner: ChafaRunner = (_command, invocationArgs) => {
    args = invocationArgs;
    return { status: 0, stdout: SIXEL_OUTPUT, stderr: "" };
  };
  const pi = {
    on() {},
    registerMessageRenderer(
      type: string,
      renderer: (...args: unknown[]) => unknown,
    ) {
      renderers.set(type, renderer);
    },
    sendMessage() {},
  };

  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "settings.json"),
    JSON.stringify({
      "pi-sixel": {
        maxColumns: 40,
        maxRows: 12,
        quality: "balanced",
      },
    }),
  );
  process.env.PI_CODING_AGENT_DIR = agentDir;

  try {
    createConfiguredPiSixel({ runner })(pi as never);
    const renderer = renderers.get("pi-sixel-preview");
    assert.ok(renderer);
    const component = renderer(
      { details: { paths: [clipboardPath], source: "clipboard" } },
      {},
      {},
    ) as { render(width: number): string[] };
    assertSixelComponent(component.render(80), "Pasted image preview", 12);
    assert.ok(args?.includes("--size=40x12"));
    assert.ok(args?.includes("--work=5"));
    assert.ok(args?.includes("--color-space=rgb"));
  } finally {
    if (previousAgentDir === undefined) {
      delete process.env.PI_CODING_AGENT_DIR;
    } else {
      process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    }
    rmSync(root, { recursive: true, force: true });
    rmSync(clipboardPath, { force: true });
  }
});

test("recognizes regular Pi clipboard image files up to the configured limit", () => {
  const clipboardPath = temporaryImagePath();
  const secondClipboardPath = temporaryImagePath();
  const thirdClipboardPath = temporaryImagePath();
  const unrelatedPath = temporaryImagePath("unrelated");

  try {
    assert.deepEqual(
      _test.findClipboardImagePaths(
        `describe ${clipboardPath}, ${secondClipboardPath}, ${thirdClipboardPath}, and ${unrelatedPath}`,
        2,
      ),
      [clipboardPath, secondClipboardPath],
    );
  } finally {
    rmSync(clipboardPath, { force: true });
    rmSync(secondClipboardPath, { force: true });
    rmSync(thirdClipboardPath, { force: true });
    rmSync(unrelatedPath, { force: true });
  }
});

test("adds submitted clipboard previews up to the configured limit", async () => {
  const clipboardPath = temporaryImagePath();
  const secondClipboardPath = temporaryImagePath();
  const thirdClipboardPath = temporaryImagePath();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  const sentMessages: unknown[] = [];
  let runnerCalls = 0;
  const runner: ChafaRunner = () => {
    runnerCalls++;
    return {
      status: 0,
      stdout: SIXEL_OUTPUT,
      stderr: "",
    };
  };
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerMessageRenderer(
      type: string,
      renderer: (...args: unknown[]) => unknown,
    ) {
      renderers.set(type, renderer);
    },
    sendMessage(message: unknown) {
      sentMessages.push(message);
    },
  };
  createPiSixel({
    config: {
      maxColumns: 120,
      maxRows: 36,
      maxImages: 2,
      quality: "high",
    },
    runner,
  })(pi as never);

  try {
    const handler = handlers.get("before_agent_start");
    assert.ok(handler);
    const result = await handler(
      {
        prompt: `describe ${clipboardPath}, ${secondClipboardPath}, and ${thirdClipboardPath}`,
      },
      { cwd: process.cwd() },
    );
    assert.deepEqual(result, {
      message: {
        customType: "pi-sixel-preview",
        content: [{ type: "text", text: "Pasted image preview" }],
        display: true,
        details: {
          paths: [clipboardPath, secondClipboardPath],
          source: "clipboard",
        },
      },
    });

    const renderer = renderers.get("pi-sixel-preview");
    assert.ok(renderer);
    const component = renderer(
      {
        ...(result as { message: { details: unknown } }).message,
        details: {
          label: "\x1b]52;c;malicious\x07",
          paths: [clipboardPath, secondClipboardPath],
          source: "clipboard",
        },
      },
      {},
      {},
    ) as { invalidate(): void; render(width: number): string[] };
    const rendered = component.render(80);
    assert.equal(
      rendered.filter((line) => line.includes(SIXEL_SEQUENCE)).length,
      2,
    );
    assert.deepEqual(component.render(80), rendered);
    assert.equal(component.render(5)[0], "Paste");
    component.invalidate();
    assert.equal(component.render(80)[0], "Pasted image preview");
    assert.equal(runnerCalls, 4);
    assert.deepEqual(sentMessages, []);
  } finally {
    rmSync(clipboardPath, { force: true });
    rmSync(secondClipboardPath, { force: true });
    rmSync(thirdClipboardPath, { force: true });
  }
});

test("native SIXEL survives Pi TUI redraw and image lifecycle changes", () => {
  const clipboardPath = temporaryImagePath();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  let output = SIXEL_OUTPUT;
  const runner: ChafaRunner = () => ({
    status: 0,
    stdout: output,
    stderr: "",
  });
  const pi = {
    on() {},
    registerMessageRenderer(
      type: string,
      renderer: (...args: unknown[]) => unknown,
    ) {
      renderers.set(type, renderer);
    },
    sendMessage() {},
  };
  createPiSixel({ runner })(pi as never);

  try {
    const renderer = renderers.get("pi-sixel-preview");
    assert.ok(renderer);
    const component = renderer(
      {
        details: {
          paths: [clipboardPath],
          source: "clipboard",
        },
      },
      {},
      {},
    ) as Component;
    const lowerLine: Component = {
      invalidate() {},
      render: () => ["after image"],
    };
    const root = new Container();
    root.addChild(component);
    root.addChild(lowerLine);
    const terminal = new RecordingTerminal();
    const tui = new TUI(terminal);
    tui.addChild(root);
    const render = () => (tui as unknown as { doRender(): void }).doRender();

    render();
    const initial = terminal.writes.at(-1) ?? "";
    assert.ok(initial.includes(`${ITERM_IMAGE_MARKER}${SIXEL_SEQUENCE}`));
    assert.ok(initial.indexOf(SIXEL_SEQUENCE) < initial.indexOf("after image"));

    const appendedLine: Component = {
      invalidate() {},
      render: () => ["appended redraw"],
    };
    root.addChild(appendedLine);
    render();
    const appended = terminal.writes.at(-1) ?? "";
    assert.ok(appended.includes("appended redraw"));
    assert.equal(appended.includes(SIXEL_SEQUENCE), false);

    const replacementSequence = SIXEL_SEQUENCE.replace("!4?", "!4@");
    output = `${replacementSequence}\n`;
    component.invalidate();
    render();
    assert.ok((terminal.writes.at(-1) ?? "").includes(replacementSequence));

    root.removeChild(component);
    render();
    const removed = terminal.writes.at(-1) ?? "";
    assert.ok(removed.includes("\x1b[2K"));
    assert.equal(removed.includes(replacementSequence), false);

    root.addChild(component);
    terminal.columns = 72;
    terminal.rows = 12;
    component.invalidate();
    render();
    const resized = terminal.writes.at(-1) ?? "";
    assert.ok(resized.includes("\x1b[2J\x1b[H\x1b[3J"));
    assert.ok(resized.includes(replacementSequence));

    const overlayComponent: Component = {
      invalidate() {},
      render: () => ["overlay line"],
    };
    const overlay = tui.showOverlay(overlayComponent, {
      width: 20,
      row: 3,
      col: 3,
      nonCapturing: true,
    });
    render();
    assert.ok((terminal.writes.at(-1) ?? "").includes("overlay line"));
    overlay.hide();
    render();
    assert.ok((terminal.writes.at(-1) ?? "").includes("\x1b[2K"));
  } finally {
    rmSync(clipboardPath, { force: true });
  }
});

test("adds generated-image previews from any matching tool result", async () => {
  const generatedRoot = join(tmpdir(), `generated-images-${randomUUID()}`);
  const generatedPath = join(generatedRoot, "generated.png");
  const secondGeneratedPath = join(generatedRoot, "second.png");
  const outsidePath = temporaryImagePath("outside-generated");
  const symlinkPath = join(generatedRoot, "symlink.png");
  mkdirSync(generatedRoot, { recursive: true });
  writeFileSync(generatedPath, Buffer.from("image fixture"));
  writeFileSync(secondGeneratedPath, Buffer.from("second image fixture"));
  symlinkSync(outsidePath, symlinkPath);

  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const renderers = new Map<string, (...args: unknown[]) => unknown>();
  const sentMessages: unknown[] = [];
  const runner: ChafaRunner = () => ({
    status: 0,
    stdout: SIXEL_OUTPUT,
    stderr: "",
  });
  const pi = {
    on(event: string, handler: (...args: unknown[]) => unknown) {
      handlers.set(event, handler);
    },
    registerMessageRenderer(
      type: string,
      renderer: (...args: unknown[]) => unknown,
    ) {
      renderers.set(type, renderer);
    },
    sendMessage(message: unknown) {
      sentMessages.push(message);
    },
  };
  createPiSixel({
    runner,
    schedule: (callback) => callback(),
  })(pi as never);

  try {
    assert.equal(_test.validatedRegularImage(outsidePath), outsidePath);
    assert.equal(_test.validatedRegularImage(symlinkPath), undefined);

    const commandRenderer = renderers.get("image_generation_call");
    assert.ok(commandRenderer);
    const commandComponent = commandRenderer(
      { details: { saved_path: generatedPath } },
      {},
      {},
    ) as { render(width: number): string[] };
    assertSixelComponent(
      commandComponent.render(80),
      "Generated image preview",
    );

    const handler = handlers.get("tool_execution_end");
    assert.ok(handler);
    await handler({
      toolName: "image_generation",
      isError: false,
      result: { details: { saved_path: outsidePath } },
    });
    await handler({
      toolName: "image_generation",
      isError: false,
      result: { details: { saved_path: secondGeneratedPath } },
    });
    assert.deepEqual(sentMessages, []);

    const agentEndHandler = handlers.get("agent_end");
    assert.ok(agentEndHandler);
    await agentEndHandler({}, { isIdle: () => false });
    assert.deepEqual(sentMessages, []);
    await agentEndHandler({}, { isIdle: () => true });
    assert.deepEqual(sentMessages, [
      {
        customType: "pi-sixel-preview",
        content: [{ type: "text", text: "Generated image preview" }],
        display: true,
        details: {
          paths: [outsidePath],
          source: "generated",
        },
      },
    ]);

    await handler({
      toolName: "read",
      isError: false,
      result: { details: { saved_path: generatedPath } },
    });
    await handler({
      toolName: "image_generation",
      isError: true,
      result: { details: { saved_path: generatedPath } },
    });
    assert.equal(sentMessages.length, 1);
  } finally {
    rmSync(generatedRoot, { recursive: true, force: true });
    rmSync(outsidePath, { force: true });
  }
});
