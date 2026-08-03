# Coding environment

## Package and tool preferences

- Clipboard: `wl-copy` and `wl-paste`. To copy an exact command: `printf '%s\n' '<command>' | wl-copy`
- Structural Git analysis: `sem`
- Broad text replacement: `sd`
- YAML and JSON: `yq` or targeted scripts
- GitHub: `gh`
- PR stacking: `git-spice`
- Benchmarks: `hyperfine`
- Disk usage: `dua`
- Python environments and packages: `uv`
- TypeScript packages: `pnpm`
- Host packages: `yay`

## Language conventions

### Python

- Keep imports at the top except to resolve a circular dependency
- Prefer Pydantic

### TypeScript

- Use strict mode
- Do not use `any`
- Import types with `type`
