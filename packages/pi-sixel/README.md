# pi-sixel

SIXEL image previews in [Pi](https://github.com/earendil-works/pi) for pasted and generated images, rendered locally with [Chafa](https://hpjansson.org/chafa/).

- Works in any terminal with SIXEL enabled.
- Shows pasted images after prompt submission.
- Shows supported `image_generation` results and optional Carter image-generation messages.

> **Status:** This package is local and is not published to npm.

## Quick start

### 1. Check the prerequisites

- A terminal with SIXEL support enabled.
- `chafa` on `PATH` with SIXEL output support.

On Arch Linux, install the `chafa` package. On macOS with Homebrew, run `brew install chafa`.

Test Chafa and the current terminal with an existing image:

```sh
chafa --format=sixels --size=40x20 --animate=off --polite=on --work=9 --color-space=din99d -- /path/to/image.png
```

The command should display an image, not raw escape-sequence text.

### 2. Install the package

> **Security:** Pi packages execute with full local permissions. Review the source before installing third-party packages.

From the `pi-sixel` package directory:

```sh
pi install "$PWD"
```

### 3. Reload and test

1. Run `/reload` in an existing Pi session.
2. Paste an image into the prompt and submit it.
3. Confirm that the SIXEL preview appears below the submitted prompt.

## Optional configuration

Defaults: 120 columns, 36 rows, up to 4 pasted images, and high quality.

- Global: `$PI_CODING_AGENT_DIR/settings.json` when that variable is set; otherwise `~/.pi/agent/settings.json`.
- Project: `.pi/settings.json`.
- Project keys override matching global keys.

```json
{
  "pi-sixel": {
    "maxColumns": 120,
    "maxRows": 36,
    "maxImages": 4,
    "quality": "high"
  }
}
```

| Setting      |  Default | Accepted values           | Effect                                                                |
| ------------ | -------: | ------------------------- | --------------------------------------------------------------------- |
| `maxColumns` |    `120` | Integer from `8` to `120` | Maximum width in terminal columns, capped by the available TUI width. |
| `maxRows`    |     `36` | Integer from `1` to `40`  | Reserved preview height in terminal rows.                             |
| `maxImages`  |      `4` | Integer from `1` to `32`  | Maximum pasted images rendered for one submitted prompt.              |
| `quality`    | `"high"` | `"balanced"` or `"high"`  | `balanced` favors speed; `high` favors color quality.                 |

Width and height are terminal cells, not fixed pixel dimensions. The final raster depends on terminal cell geometry and source aspect ratio.

Run `/reload` after changing settings. Invalid supplied values stop extension loading with a configuration error.

## Optional Carter integration

For Carter previews, list `pi-sixel` before `@carter-mcalister/pi-codex-image-gen`; both use the `image_generation_call` renderer:

```json
{
  "packages": [
    "/absolute/path/to/pi-sixel",
    "npm:@carter-mcalister/pi-codex-image-gen"
  ]
}
```

Standard `image_generation` results need no Carter setup.

## Troubleshooting

- **No image, or raw escape text from the Chafa test:** SIXEL is unsupported or disabled in the current terminal.
- **`SIXEL preview unavailable.`:** confirm `chafa` is on `PATH`, rerun the Chafa test, and verify that the source is a supported image up to 20 MiB.
- **Configuration error:** validate the JSON and the accepted values in the table above.
- **No pasted preview:** use Pi's built-in image paste and submit the prompt; the preview does not appear while editing.
- **No standard generated preview:** the successful `image_generation` result must expose a supported regular file at `details.saved_path`.
- **No Carter preview:** confirm that `pi-sixel` appears before Carter in the `packages` list.

## Compatibility and limits

- Verified with Pi 0.80.3 and Chafa 1.18.2; retest after Pi upgrades because image-line handling is internal.
- Pasted previews accept up to `maxImages` regular, non-symlink PNG, JPEG, GIF, or WebP files, each up to 20 MiB. Generated-image preview batches remain limited to one image. GIF previews are static.
- Rendering stays local; Chafa uses fixed arguments, a 5-second timeout, and a 4 MiB output cap.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
npm pack --dry-run
```

## License

MIT
