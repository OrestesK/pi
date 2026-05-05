---
name: learn-codebase
description: First-session project orientation — scan conventions, structure, and instruction files. Use when starting work in a new or unfamiliar project, when asked to "learn the codebase", "onboard", "check project rules", or "what's this project".
---

# Learn Codebase

Scan the project to orient yourself before doing any work.

## Steps

1. **Check for instruction files**: AGENTS.md, CLAUDE.md, .cursorrules, README.md, CONTRIBUTING.md
2. **Check for build system**: Makefile, package.json scripts, pyproject.toml scripts
3. **Project structure**: Use tree-sitter `codebase_overview` and `codebase_map` for a structural overview
4. **Dependencies**: Read pyproject.toml, package.json, requirements.txt
5. **Test infrastructure**: Find test directories, check for conftest.py, jest.config, pytest markers
6. **Conventions**: Look at recent commits (`git log --oneline -20`) to understand naming patterns

## Output
Present a brief summary:
- What the project does
- Key directories and their purpose
- Build/test/lint commands available
- Conventions observed
- Instruction files found and key rules from them
