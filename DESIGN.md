# Design Decisions

This document explains WHY this config is built the way it is. Read this before making changes.

## Origin

This config was built in May 2026 after analyzing 4 Claude Code sessions (4,528 total tool calls, 61MB + 11MB + 7.6MB + 6.5MB of logs) and researching 21+ articles and 10+ community configs about pi.

## Evidence from Claude Code sessions

### Session 1: Platform performance audit (61MB, 2,754 tool calls, 8 days)
- RunResult.tsx was read **160 times** and edited **172 times** — micro-edit loops instead of batching
- **547 subagents, ALL dispatched serially** — zero parallel batches despite user demanding it
- **Zero MCP tools used** — tree-sitter, context7, claude-mem all available, all ignored
- **86 grep/rg via Bash** instead of the Grep tool
- **12 full file rewrites** of one component via Write instead of Edit
- **101 frustration messages from user** (11% of all messages)

### Session 2: Benchmark export pipeline (6.5MB, 645 tool calls, 3 days)
- **Zero MCP tools used** again — CLAUDE.md said "use tree-sitter first," ignored
- pipeline.py read **34 times**
- **46 bash greps** instead of Grep tool
- Agent guessed facts — user: "stop being lazy and guessing"
- Searched the wrong repository for 10+ commands

### Session 3: Token retrier architecture (11MB, 596 tool calls, 32 hours)
- token.py read **98 times**
- **Destructive git disaster**: agent ran `git checkout --` → `git stash` → `git stash drop`, destroying uncommitted work
- **187 direct Edit calls** despite CLAUDE.md saying "delegate to subagents"
- No plan before complex background loop redesign → 50+ messages of iterative design-through-code
- **35 basedpyright runs** in one session

### Session 4: GA performance audit (7.6MB, 533 tool calls, 31 hours)
- **268 subagents**, ~40 were trivial bookkeeping (STATUS.md updates, file moves)
- Zero MCP tools used (4th session in a row)
- 11 consecutive bash attempts to organize markdown files
- 19 Write calls where Edit would suffice

### Patterns across ALL 4 sessions
- **Zero MCP tool usage** in every session (tree-sitter, context7, LSP all ignored)
- **Catastrophic file re-reading** (160x, 98x, 34x on single files)
- **Guessing instead of looking up** facts, library behavior, API surfaces
- **Implementation without planning** leading to reverts and wasted work
- **Serial agent dispatch** when parallel was possible

## Community configs studied

### HazAT/pi-config (325 stars) — most popular shared config
- 254-line AGENTS.md with 6 named agent roles (spec, planner, scout, worker, reviewer, researcher)
- Clean separation: AGENTS.md = orchestration, skills = execution workflows, agents/*.md = role definitions
- No content duplication between AGENTS.md and skills
- "Think Forward" philosophy — no backwards-compat shims
- Extensions auto-discover from ~/.pi/agent/extensions/
- **What we took**: Agent role architecture, AGENTS.md structure pattern, self-improve skill, session-reader skill, todos extension, skill description conventions

### danchamorro/pi-agent-toolkit (480 lines)
- "Agent-Legible Code" 5-section framework
- "Human Review Triggers" checklist for high-risk changes
- "Trace data to boundaries" — follow data through external systems
- Detailed commit/PR format with examples
- **What we took**: Human Review Triggers list, completion verification pattern

### Mansoor Majeed (75-line system prompt)
- "Supervised autonomy" — discussion-first, explicit green-light required
- `.scratch/` workspace with organized subdirectories
- "Distill, don't accumulate" — raw research to files, not context
- "One approval doesn't generalize"
- 200k context budget, proactive compaction at 150k
- Programmatic workflow-guard via input interceptor (appends reminder, doesn't block)
- **What we took**: .scratch/ workspace, "distill don't accumulate," "one approval doesn't generalize," continue.ts extension, compact-advisor.ts extension

### Armin Ronacher / mitsuhiko (Flask creator, uses pi "almost exclusively")
- Zero npm packages — writes all extensions himself
- "Ask the agent to extend itself" philosophy
- Session branching (/tree) for side-quests
- No MCP — replaces with custom skills
- todos.ts extension for file-based todo management
- **What we took**: todos extension (via HazAT's fork), self-extension philosophy (aspirational)

## Key design decisions

### Why tree-sitter as direct tools (not behind MCP adapter)

**Problem**: Claude Code ignored MCP tools across ALL 4 sessions (4,528 tool calls, zero MCP usage). The tools existed but the model never reached for them.

**Root cause**: Claude Code's 10,000+ token system prompt drowns out user instructions. CLAUDE.md saying "use tree-sitter first" competed with product logic.

**Solution**: In pi, the system prompt is <1,000 tokens. AGENTS.md instructions carry 50x more relative weight. Making tree-sitter tools `directTools` means they appear in the system prompt alongside Read/Grep — the model sees them every turn. Combined with explicit "use symbol_definition instead of Read" instructions in AGENTS.md.

**Alternative considered**: Keeping tree-sitter behind the MCP adapter (like context7). Rejected because the whole point is making these tools reflexive, not on-demand. The ~800 token cost for 6 direct tools is justified — pi's total system prompt with all direct tools is still 3.5x leaner than bare Claude Code.

### Why read-only git

**Problem**: Session 3 — agent ran `git checkout --` → `git stash` → `git stash drop`, destroying uncommitted work. User lost significant time.

**Solution**: Double-layered enforcement:
1. AGENTS.md explicitly lists allowed git commands (log, diff, status, blame, show) and forbidden ones
2. guardrails.json `autoDenyPatterns` blocks all git mutations at the tool level

**Alternative considered**: "Stage + commit with approval hooks" (danchamorro's pattern). Rejected because the user explicitly prefers doing all git himself.

**How guardrails.json works**: The `@aliou/pi-guardrails` npm package reads `~/.pi/agent/extensions/guardrails.json` and merges it with defaults. Priority: memory > local > global > defaults. It uses shell AST parsing (not substring matching) via `@aliou/sh` for command detection.

### Why 4 agent roles (not 6)

**HazAT has 6**: spec, planner, scout, worker, reviewer, researcher.

**We use 4**: scout, worker, reviewer, general-purpose. No spec or planner roles.

**Reasoning**: Spec and planner are planning activities that need user dialogue. Delegating planning to a subagent means the subagent can't ask follow-up questions or respond to user feedback naturally. The main agent (gpt-5.5) is the best planner because it has the full conversation context. HazAT's spec and planner agents are marked `interactive: true` to work around this, but that's extra complexity for marginal benefit.

### Why model roles per agent

| Role | Model | Why |
|------|-------|-----|
| main | gpt-5.5 | Best reasoning for planning, architecture, user interaction |
| worker | gpt-5.4 | Good enough for well-specified implementation. Faster. |
| scout | gpt-5.4-mini | Just reading and summarizing. Fastest. |
| reviewer | gpt-5.4 | Needs judgment but not frontier reasoning |

User is on OpenAI Codex subscription (not per-token billing). Speed is the primary variable, not cost. Scouts should return in seconds, not minutes.

### Why .scratch/ workspace (from Mansoor)

**Problem**: Session 1 — subagent results flowed into main context, consuming tokens. User feedback: "these agents should be writing results to a file, not to you."

**Solution**: `.scratch/` directory (gitignored) with typed subdirectories. Scouts write to research/, workers write results, reviewers write to reviews/. Main agent reads the files when needed, not when they're produced.

**Why not just context-mode?**: context-mode sandboxes tool output (98% reduction). `.scratch/` is for agent-produced artifacts (plans, research summaries, reviews). Different problem — context-mode handles raw data, `.scratch/` handles structured analysis.

### Why 11 npm packages (vs Ronacher's 0, HazAT's ~8, Mansoor's ~5)

Each package maps to a specific problem or community-proven capability:

| Package | Why it's here | Could we drop it? |
|---------|--------------|-------------------|
| pi-subagents | Core delegation mechanism for scout/worker/reviewer | No — central to workflow |
| pi-mcp-adapter | Needed for context7 lazy loading | No — without it, context7 burns tokens every turn |
| pi-lens | AST-enhanced reads + auto-lint/format pipeline | Maybe — overlaps with tree-sitter MCP, but adds formatting |
| pi-web-access | Web search, content extraction, video understanding | Maybe — could use context7 + curl, but this is more capable |
| pi-memory-md | Cross-session memory as git-backed markdown | Maybe — could use AGENTS.md only (Ronacher's approach) |
| @aliou/pi-guardrails | Reads guardrails.json, enforces safety policies | No — safety critical |
| @aliou/pi-toolchain | Deterministic CLI enforcement (uv not pip, etc.) | Maybe — AGENTS.md instructions might suffice |
| pi-rewind | Per-turn git checkpoints, /rewind recovery | No — direct response to Session 3 disaster |
| context-mode | Sandboxes tool output, 98% context reduction | No — 12K stars, proven, handles data bloat |
| claude-ui (local) | Custom Claude-style terminal rendering | No — aesthetic preference, built specifically for this |

Total token cost: ~2,600 tokens for all 11. Pi's base prompt is ~200 tokens. So the fully loaded config is ~2,800 tokens — still 3.5x leaner than bare Claude Code (10,000+).

### Why skills have no `triggers:` field

Pi skills don't have a `triggers:` mechanism. The skill `description` IS the trigger — pi injects all skill descriptions into the system prompt as XML, and the LLM decides when to load a skill based on semantic matching. This is confirmed by pi source code and the Agent Skills spec.

Skill descriptions follow HazAT's pattern: include "Use when..." phrases with specific examples (e.g., "Use when asked to 'debug this', 'why is this failing', 'investigate this error'").

`disable-model-invocation: true` hides a skill from the system prompt entirely — it can only be invoked via `/skill:name` (e.g., self-improve is slash-command-only).

### Why AGENTS.md defers to skills (no duplication)

HazAT's pattern: AGENTS.md says "use the commit skill" but never contains commit instructions. Same for delegation — AGENTS.md says "load the manager-workflow skill" but doesn't repeat the tier details.

This avoids paying double token cost when a skill loads (AGENTS.md content + skill content). AGENTS.md provides a brief summary (3 lines on tiers, 1 line per agent role) so the model knows what exists without needing the full instructions until implementation time.

### Why self-improve is slash-command-only

HazAT's design: `disable-model-invocation: true` means the agent never auto-triggers self-improve. The user explicitly invokes it with `/skill:self-improve` at the end of a session. This prevents the agent from spending time on retrospectives when the user wants to keep working.

The workflow: analyze 10 areas → present numbered suggestions table → user picks which to apply → create todos → execute → commit. Human approval gate before any config change.

### Why continue.ts and compact-advisor.ts (from Mansoor)

**Problem**: Long sessions hit context limits. Session 1 had a context exhaustion event. The "Dumb Zone" (40-60% context utilization) is documented by multiple independent sources — model quality degrades before you hit the wall.

**compact-advisor.ts**: Hooks `agent_end`, checks context usage, suggests compaction at 150k tokens with 5-minute cooldown. Preserves task context on compact.

**continue.ts**: `/continue` command distills conversation into a `.scratch/sessions/` markdown file, starts a fresh session pointing at the file. The new session reads it on demand — keeping it out of the token budget until referenced.

Both are proven extensions from Mansoor's Clawd config. Auto-discovered from `extensions/` directory (no registration needed).

## What we explicitly chose NOT to include

| Feature | Who has it | Why we skipped |
|---------|-----------|----------------|
| Programmatic workflow enforcement | Mansoor (input interceptor) | The interceptor only appends a reminder, doesn't block. Pi's small system prompt gives AGENTS.md enough weight. |
| Session branching (/tree) | Ronacher | Requires manual workflow. The .scratch/ + /continue approach achieves similar context isolation. |
| 6 agent roles (spec, planner) | HazAT | Planning needs user dialogue. Main agent plans better because it has full conversation context. |
| GitHub MCP server | Our old config | `gh` CLI does everything, costs zero tokens. Same for AWS MCP → `aws` CLI. |
| Notion MCP server | Our old config | Rarely used in coding sessions. |
| design-patterns MCP server | Our old config | Niche. Agent can discuss patterns without a database. |
| pi-superpowers-plus | Our old config | Replaced by custom skills (debugging, review) + self-improve from HazAT. |
| pi-ask-user | Our old config | Not essential. Model can ask in chat. |
| @plannotator/pi-extension | Our old config | Replaced by .scratch/plans/ + tier system. |
| pi-total-recall | Our old config | Replaced by pi-memory-md (more transparent, git-backed, editable). |
| pi-boomerang | Considered (168 stars) | Token-efficient context collapse for autonomous tasks. We already have 3 context management layers (context-mode + compact-advisor + .scratch/). Nobody in the popular configs uses boomerang. Deferred — add if context exhaustion remains a problem after using this config. |
| Code-simplifier skill | HazAT | Reviewer role covers this ("flag unnecessarily complex code"). |
| skill-creator skill | HazAT | Nice-to-have. Can add later. |
| write-todos skill | HazAT | Manager-workflow skill covers worker briefing. |
| Context budget (200k cap) | Mansoor | compact-advisor.ts handles this proactively at 150k. Hard cap not needed with proactive warning. |
| pi_agent_rust | Dicklesworthstone (837 stars) | Rust port of pi. <8MB binary, <100ms startup, 4-5x faster. **Rejected**: QuickJS runtime can't import from npm packages — our claude-ui (2,316 lines importing @mariozechner/pi-coding-agent internals), continue.ts, compact-advisor.ts, and todos extension all fail to load. Only 66.7% extension compatibility for npm-dependent extensions. Revisit when extension compat improves. |
| oh-my-pi / TTSR | can1357 (3,874 stars) | Fork with TTSR (zero-context rules that inject only when model output matches a pattern). **Rejected as fork**: would replace mainline pi. **TTSR as extension**: not possible — needs `abort()` + `replaceMessages()` + `continue()` APIs not exposed to extensions. A "poor man's TTSR" using steering messages is possible (~60% of value) but not worth the complexity given our AGENTS.md is only 135 lines (~500 tokens). |
| Gondolin micro-VM | Earendil (1,075 stars) | Linux micro-VM sandbox, boots <1 second. **Rejected**: pure security isolation, adds overhead, no context management benefit. Our guardrails.json + context-mode already handle safety and context. |
| rho (always-on AI operator) | mikeyobrien (355 stars) | Personal AI daemon built on pi. Uses your pi config, accessible via Telegram, proactive heartbeat. **Deferred**: interesting for "message pi from phone while away from desk" workflow, but separate service to set up and maintain. Not a pi extension. |
| pi-messenger | nicobailon (539 stars) | Multi-agent coordination across separate terminal sessions. **Rejected**: only useful when running multiple pi instances on the same codebase simultaneously. We use subagents within a single session + git worktrees for isolation. |
| pi-interactive-shell | nicobailon (470 stars) | Observable PTY for interactive CLIs (psql, vim, ssh). **Rejected**: one-off `docker exec psql -c "..."` commands work fine. Interactive sessions are a human workflow, not an agent workflow. |
| pi-powerline-footer | nicobailon (200 stars) | Powerline-style status bar. **Rejected**: claude-ui already handles our terminal rendering. |
| pi-intercom | nicobailon (107 stars) | Inter-session communication between pi instances. **Rejected**: same reasoning as pi-messenger — we don't run multiple instances. |
| pi-context-zone | arpagon (3 stars) | Visual context health bar. **Rejected**: stale (March 2026), only 3 stars, observability only. compact-advisor.ts provides actionable context monitoring instead. |
| multi-edit.ts | mitsuhiko (871 lines) | Replaces built-in edit tool with batch multi-edit. **Rejected**: conflicts with claude-ui which also registers the edit tool. Pi has no composed-edit protocol (only composed-bash). The micro-edit problem is addressed by manager-workflow forcing planning before implementation. |

## What we explicitly evaluated and adopted

### pi-gitnexus (tintinweb, 94 stars)
**What**: Auto-augments read/grep/find results with call chains, callers/callees, and execution flows from a pre-built knowledge graph. Also provides CLI tools (`gitnexus query`, `gitnexus impact`, `gitnexus context`).

**Why adopted**: Fills the gap between tree-sitter (per-file structure) and LSP (per-symbol references). GitNexus provides transitive impact analysis — "if I change this function, 47 functions across 3 subsystems are affected." LSP can only do one-level references. The pre-built graph (persists to `.gitnexus/`) means queries are instant vs LSP recomputing each time.

**Key for Tier 3 planning**: Before redesigning something, you want to know the blast radius BEFORE writing the plan. This is exactly what gitnexus provides.

**Token cost**: Auto-augments are deduped per session (each symbol once), capped at 8KB per augment, max 3 per result. Toggle off with `/gitnexus off`.

**Requires**: `npm i -g gitnexus` + `gitnexus analyze` in each project to build the initial graph. Re-indexes only changed files on subsequent runs.

**License**: pi-gitnexus wrapper is MIT. GitNexus CLI is PolyForm Noncommercial. Runs fully locally, no data sent anywhere. Using a dev tool for your job is personal use of the tool, not commercial use.

### answer.ts and files.ts (from mitsuhiko/Armin Ronacher)
**What**: `/answer` extracts questions from agent responses into a one-by-one TUI. `/files` and `/diff` show a fuzzy-searchable file browser with quick actions (reveal, open, diff).

**Why adopted**: Both HazAT and Ronacher have `/answer` — it solves the "agent asks 5 questions, user answers 3 and misses 2" problem. `/files` provides quick file navigation without typing paths.

**Source**: mitsuhiko/agent-stuff

### "Agents never refactor" principle (added to AGENTS.md)
**Source**: Mario Zechner and Armin Ronacher in the Pragmatic Engineer interview. Agents perpetually extend problematic structures because they don't feel maintenance pain.

**What we did**: Added to AGENTS.md Core Principles: "Suggest refactoring before extending. When existing code is getting complex, suggest refactoring before adding more to it."

### Todos extension (from mitsuhiko via HazAT)
**What**: File-based todo management stored in `.pi/todos/` as markdown files. Visual TUI via `/todos`. Used by self-improve skill to track approved improvements.

**Why adopted**: self-improve skill (from HazAT) depends on the `todo` tool. Without it, self-improve's Step 5 (create todos, track progress) doesn't work. Also useful as general task tracking within sessions.

**How it works**: Each todo is a markdown file with JSON frontmatter (id, title, tags, status). Lock files prevent concurrent editing. Auto-GC cleans closed todos after 7 days. Settings in `.pi/todos/settings.json`.

### nvim MCP (paulburgess1357/nvim-mcp)
**What**: MCP server exposing Neovim state — open buffers, cursor, selections, diagnostics. Connects via Neovim's native msgpack-RPC socket. No Neovim plugin needed (0.11+ auto-creates sockets).

**Why adopted**: User works in Neovim alongside pi in a separate terminal. Agent can query what the user is looking at without the user having to describe it.

**Lifecycle**: lazy (only starts when agent first queries it).

### permissions.json YOLO mode
**What**: `"mode": "yolo"` — all tool executions auto-approved without prompts.

**Why adopted**: Guardrails.json is the safety layer, not permission prompts. YOLO mode prevents friction on every bash command. This matches the community consensus (Mario Zechner: "security theater fails fundamentally").

## Behavioral insights (not actionable as config, but worth knowing)

### "Dumb Zone" at 40-60% context utilization
Multiple independent sources confirm model quality degrades at 40-60% context. Not gradual — a cliff. Our compact-advisor warns at 150k tokens (55% of 272k context), which is right at the boundary. This is by design.

### Harness effect: 5-40 percentage points
Same model scores differently in different harnesses (Pawel Jozefiak). Pi's lean system prompt means the model performs closer to its ceiling than in Claude Code. This is the thesis behind the migration.

### Subscription billing wall
Anthropic blocks third-party agents from using Claude subscriptions. Not relevant — we use OpenAI Codex.

## Sources

### Articles and blog posts
- Mario Zechner: "What I learned building an opinionated and minimal coding agent" (mariozechner.at)
- Armin Ronacher: "Pi: The Minimal Agent Within OpenClaw" (lucumr.pocoo.org)
- Pragmatic Engineer: "Building Pi, and what makes self-modifying software so fascinating"
- Mansoor Majeed: "Why I switched from Claude Code to a Custom Coding Agent" (blog.esc.sh)
- Daniel Koller: "Goodbye Claude Code. Why pi Is My New Coding Agent Pick"
- Pawel Jozefiak: "Claude Code vs Codex vs Aider vs OpenCode vs Pi 2026"
- Owain Lewis: "Is Pi better than Claude Code?" (newsletter)
- disler: pi-vs-claude-code GitHub comparison (929 stars)
- jprokay: "pi: The Coding Agent For Your Workflow"

### Configs referenced
- HazAT/pi-config (325 stars) — agent roles, self-improve, session-reader, todos, AGENTS.md pattern
- mitsuhiko/agent-stuff — todos extension, skill patterns
- MansoorMajeed/Clawd — continue.ts, compact-advisor.ts, .scratch/ workspace, system prompt
- danchamorro/pi-agent-toolkit — Human Review Triggers, Agent-Legible Code framework
- obra/superpowers — systematic-debugging skill pattern
- can1357/oh-my-pi — model roles concept, TTSR (not adopted)
- badlogic/pi-skills — {baseDir} path convention, cross-agent skill format
