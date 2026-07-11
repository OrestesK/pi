# Design Decisions

This document records stable rationale. It does not define agent behavior. Use [`AGENTS.md`](AGENTS.md) for executable policy and the [README file map](README.md#file-map) for configuration ownership.

## Goals

- Keep always-loaded instructions concise.
- Keep executable behavior stronger and more precise than human guides.
- Load detailed workflows from skills instead of root prompt prose.
- Make risky operations explicit and hard to trigger accidentally.
- Keep large research, plans, and reviews in inspectable files.
- Give subagents narrow, self-contained contracts.

## Core choices

### Structural tools first

Code navigation starts from symbols and AST structure. Text search remains useful for logs, comments, configuration text, URLs, and fallback cases.

### Read-only Git by default

The agent can inspect Git state but does not mutate staging, history, refs, or branches. The user owns commits, branches, merges, rebases, pushes, and stacked-PR operations.

### Guardrails plus prompt policy

Prompt rules alone are insufficient for high-risk operations. `extensions/guardrails.json` blocks configured destructive shell patterns, common Git mutations, and protected paths while `AGENTS.md` defines the operating policy.

Guardrails are not a full sandbox or exhaustive command parser. Because `permissions.json` uses `yolo`, external/private MCP approval rules remain prompt policy rather than universal runtime confirmation dialogs.

### Skills over prompt bloat

Detailed procedures live in skills so the base prompt can focus on invariants. The key workflow owners cover implementation management, brainstorming, planning, debugging, TDD, review, completion evidence, and subagent orchestration. Their current locations are listed in the [file map](README.md#file-map).

### Self-contained subagent prompts

Local role prompts intentionally repeat selected safety and workflow boundaries because child agents may use replacement prompts and may not inherit all parent instructions.

### Scratch files for intermediate work

`.scratch/` is gitignored and holds research, plans, reviews, compaction artifacts, and continuation notes. Large intermediate evidence stays inspectable without filling the conversation.

### Lazy integrations by default

MCP servers and heavier workflows load on demand unless they require direct-tool availability. Tree-sitter stays direct because structural navigation is a core capability.

## Package selection rationale

The complete package inventory belongs in [`settings.json`](settings.json). Packages are selected by capability:

- **Delegation:** subagents, review gates, and research/decision workflows
- **Memory:** durable Markdown memory delivered into prompt context
- **Code intelligence:** structural search, refactoring, and direct tree-sitter tools
- **Large-output handling:** sandboxed analysis and local result virtualization
- **Research:** web/content access and library documentation
- **Safety and tooling:** guardrails and preferred CLI enforcement
- **Interaction:** structured questions, inter-session coordination, and session helpers
- **Resilience:** compaction, goal continuation, and recoverable transport retries

## Local-only assumptions

This is a personal configuration, not a turnkey distribution. Reuse requires reviewing every active surface shown in the [file map](README.md#file-map), especially host conventions, model/package paths, MCP OAuth dependencies, permissions, extensions, and guardrails.

## Repository hygiene

Tracked files exclude credentials, sessions, caches, logs, generated artifacts, and dependency installs. [`.gitignore`](.gitignore) is the canonical list; the README summarizes the important categories.

## Attribution

Copied, adapted, and influential sources are recorded in [`ATTRIBUTIONS.md`](ATTRIBUTIONS.md) with their relationships and licenses.
