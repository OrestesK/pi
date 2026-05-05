# Environment

## System

- ThinkPad X1 Carbon Gen 13, x86_64, Arch Linux
- Wayland (sway) — use `wl-copy`/`wl-paste` not xclip/xsel; sway config syntax not i3
- IDE: Neovim, Terminal: Foot
- Package manager: `pacman`/`yay` (not apt/brew)
- When a command needs sudo, copy it to clipboard via `wl-copy` instead of just printing it

## Stack

- **Python**: uv, basedpyright, ruff
- **TypeScript**: pnpm, vtsls, eslint, prettier
- **Bash**: shellcheck
- **Containers**: docker + docker-compose + docker-buildx
- **Database**: PostgreSQL (installed locally, not just Docker)
- **Node**: nvm + pnpm
- **Git workflow**: git-spice (`gs`) for stacked PRs — use `gs` commands for branch stacking, not raw git
- **Cloud**: aws-cli for AWS operations (S3, ECS, Secrets Manager, CloudFormation, logs)
- **Parsing**: tree-sitter-cli for AST inspection

## Language Conventions

### Python
- No local imports — always import at the top of the file. Only exception: circular dependency resolution.
- Logging: DEBUG for lifecycle details, INFO for state changes, WARNING for real problems.

### TypeScript
- Strict mode. No `any`. Import types with `type` keyword.

### Bash
- Run shellcheck on any script you write or edit.

## Code Quality

- Run checks (lint, typecheck, format) batched after a logical group of edits, not after each individual edit.
- Worker agents run checks before reporting done.
- Auto-format with `ruff format` / `prettier` after edits.
- Typecheck and lint only at end of task or when explicitly asked.

## Testing

- Every behavioral change gets a test.
- Implement first, then write tests covering what was built.
- Reviewer flags untested behavioral changes.
- Match existing test format — check for conftest auto-applied markers before adding decorators.
- Prefer plain helper functions over `@pytest.fixture` when a fixture isn't needed.
- No trivial tests that just verify type behavior, field existence, or simple map lookups — tests should exercise real logic.

## Documentation

- Always know where project docs are (docs/, README, docstrings).
- Read relevant docs before modifying behavior.
- Update all affected documentation after modifying behavior — project docs, inline comments, docstrings, type annotations.
- Preserve all comments when refactoring. Ask before removing commented-out code.
- Update comments when changing the behavior they describe.
