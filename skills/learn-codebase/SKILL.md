---
name: learn-codebase
description: Use for first-session orientation in an unfamiliar repository or when explicitly asked to learn the codebase
---

# Learn Codebase

Before you start work in an unfamiliar repository, scan it to understand how it is organized

## Steps

1. Read the repository instructions: AGENTS.md, CLAUDE.md, .cursorrules, README.md, and CONTRIBUTING.md
2. Identify the build system in the Makefile and package.json or pyproject.toml scripts
3. Map the project with file discovery and `ast_grep_outline`. Then use `symbol_search` and `module_report` for modules related to the task
4. Read the dependency manifests: pyproject.toml, package.json, and requirements.txt
5. Find test directories and inspect conftest.py, jest.config, and pytest markers
6. Read recent commits with `git log --oneline -20` to learn the project's naming and change patterns

## Output

Briefly explain:

- what the project does
- which directories matter and what they own
- the available build, test, and lint commands
- the conventions you found
- the instruction files and their key rules
