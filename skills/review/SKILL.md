---
name: review
description: Code review against plan and coding standards — flag real issues, don't rubber-stamp. Use when asked to "review code", "code review", or after completing an implementation step.
---

# Code Review

## What to Check
1. **Correctness**: Does the code do what the plan/spec says?
2. **Edge cases**: What happens with empty inputs, nulls, errors, timeouts?
3. **Tests**: Are behavioral changes covered by tests? Are tests meaningful (not just mirrors of implementation)?
4. **Security**: Auth bypass, injection, data exposure, secrets in code?
5. **Complexity**: Could this be simpler? Three lines > premature abstraction.
6. **Artifacts**: console.log, commented-out code, hardcoded values, TODO comments?
7. **Patterns**: Does this match existing codebase patterns?
8. **Scope**: Did the change stay within what was asked?

## How to Review
- Dispatch a reviewer subagent with the diff and the plan
- Reviewer writes findings to `.scratch/reviews/`
- Categorize: **must-fix** | **should-fix** | **nit**
- Be specific: file:line, what's wrong, what to do instead

## What NOT to Do
- Don't rubber-stamp ("looks good!")
- Don't rewrite the code yourself during review
- Don't flag intentional design choices as bugs
- Don't expand scope beyond what was changed
