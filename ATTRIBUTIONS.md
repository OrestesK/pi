# Attributions

This config combines original personal configuration with copied, adapted, and inspired work from the Pi community. See the [repository map](README.md#file-map) for the role of each local surface.

## Copied or closely adapted files

These files are copied verbatim or closely adapted from upstream repositories. They retain their upstream license terms.

| Local file                                      | Upstream source                                                                                         | Relationship                | Upstream license |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------- | ---------------- |
| [`extensions/answer.ts`](extensions/answer.ts) | [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/answer.ts` | Copied verbatim | Apache-2.0 |
| [`extensions/files.ts`](extensions/files.ts) | [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff) `extensions/files.ts` | Locally modified adaptation | Apache-2.0 |
| [`extensions/continue.ts`](extensions/continue.ts) | [`MansoorMajeed/Clawd`](https://github.com/MansoorMajeed/Clawd) `extensions/continue.ts` | Locally modified adaptation | Apache-2.0 |
| [`extensions/compact-advisor.ts`](extensions/compact-advisor.ts) | [`MansoorMajeed/Clawd`](https://github.com/MansoorMajeed/Clawd) `extensions/compact-advisor.ts` | Copied verbatim | Apache-2.0 |
| [`extensions/todos/index.ts`](extensions/todos/index.ts) | [`HazAT/pi-config`](https://github.com/HazAT/pi-config) `extensions/todos/index.ts` | Locally modified adaptation | MIT |
| [`skills/session-reader/scripts/read_session.py`](skills/session-reader/scripts/read_session.py) | [`HazAT/pi-config`](https://github.com/HazAT/pi-config) `skills/session-reader/scripts/read_session.py` | Copied verbatim | MIT |
| [`skills/self-improve/SKILL.md`](skills/self-improve/SKILL.md) | [`HazAT/pi-config`](https://github.com/HazAT/pi-config) `skills/self-improve/SKILL.md` | Closely adapted | MIT |
| [`skills/session-reader/SKILL.md`](skills/session-reader/SKILL.md) | [`HazAT/pi-config`](https://github.com/HazAT/pi-config) `skills/session-reader/SKILL.md` | Closely adapted | MIT |
| [`skills/tech-spec/SKILL.md`](skills/tech-spec/SKILL.md) | [`dmmulroy/skills`](https://github.com/dmmulroy/skills/blob/8603380821fee6a77c82639f364ce8fe4f5a92be/tech-spec/SKILL.md) | Locally modified adaptation | MIT |

## Local runtime surfaces

These paths are active local runtime surfaces. The exact upstream source is not recorded here unless listed in the copied/adapted table above.

| Local path                        | Provenance note                                                       |
| --------------------------------- | --------------------------------------------------------------------- |
| [`extensions/claude-ui/`](extensions/claude-ui/) | Original local extension for Claude-style UI rendering and tool wrappers. |
| [`extensions/subagent/config.json`](extensions/subagent/config.json) | Local runtime config for the enabled `packages/pi-subagents` package. |

## Design and workflow influences

These sources influenced the structure, workflow, or prompting patterns but were not copied verbatim unless listed above.

| Source                                                                            | Influence                                                                                                                          |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| [`HazAT/pi-config`](https://github.com/HazAT/pi-config)                           | Agent role architecture, AGENTS.md/skills separation, skill description style, self-improvement workflow, session-reader workflow. |
| [`danchamorro/pi-agent-toolkit`](https://github.com/danchamorro/pi-agent-toolkit) | Human review triggers, completion verification, agent-legible code ideas.                                                          |
| [`MansoorMajeed/Clawd`](https://github.com/MansoorMajeed/Clawd)                   | Supervised autonomy, `.scratch/` workspace pattern, continuation/compaction workflow.                                              |
| [`mitsuhiko/agent-stuff`](https://github.com/mitsuhiko/agent-stuff)               | `/answer`, `/files`, todo tooling patterns, self-extension philosophy.                                                             |
| [`obra/superpowers`](https://github.com/obra/superpowers)                         | Systematic debugging skill pattern.                                                                                                |
| [Agent Skills specification](https://agentskills.io/specification), [pproenca skill authoring](https://skills.sh/pproenca/dot-skills/skill-authoring), and [Anthropic skill creator](https://skills.sh/anthropics/skills/skill-creator) | Skill package structure, activation descriptions, progressive disclosure, and authoring workflow; accessed 2026-08-03. |
| [Google Gemini CLI behavioral evaluations](https://skills.sh/google-gemini/gemini-cli/behavioral-evals) and [NeoLab agent evaluation](https://skills.sh/neolabhq/context-engineering-kit/agent-evaluation) | Controlled cases, outcome rubrics, pairwise order bias, disagreement, and promotion evidence; accessed 2026-08-03. NeoLab is GPL-3.0 influence only; no source file or text was copied. |
| React documentation: [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect), [Sharing State Between Components](https://react.dev/learn/sharing-state-between-components), and [`Children`](https://react.dev/reference/react/Children) | Effects, state ownership, and composition guidance; accessed 2026-08-03. |
| W3C guidance: [Keyboard](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html), [Focus Visible](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html), [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html), and [ARIA APG](https://www.w3.org/WAI/ARIA/apg/) | Semantic controls, keyboard/focus behavior, programmatic status, and reduced-motion principles; accessed 2026-08-03. |
| [`sergiodxa/agent-skills`](https://github.com/sergiodxa/agent-skills/tree/40e21b46189d5c7de6610b68a25280af863f8775/skills/frontend-accessibility-best-practices), [`pproenca/dot-skills`](https://skills.sh/pproenca/dot-skills/react), and [`vercel-labs/agent-skills`](https://github.com/vercel-labs/agent-skills/tree/7c180d9044c9ae2b442b567aad4e42a28dd5ed62/skills) | Secondary comparison sources for vendor-neutral React, component API, accessibility, and measurement-gated performance guidance; accessed 2026-08-03. The Sergio and pproenca repositories are MIT. The reviewed Vercel skill frontmatter declares MIT; no repository-level license is asserted. No skill was copied wholesale. |
| Mario Zechner and Armin Ronacher interviews/articles                              | Pi design philosophy, small prompt surface, extension-first workflow, “agents extend instead of refactor” observation.             |

## Notes

- Upstream repositories checked did not include separate root `NOTICE` files at the time this attribution file was written.
- The repository's root license does not replace the upstream license obligations of copied or adapted files listed above.
