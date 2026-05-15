---
name: verification-before-completion
description: Use before claiming work is done, fixed, passing, reviewed, or ready. Requires fresh evidence from commands, diffs, or explicit inspection and prevents trusting stale or subagent-only success claims.
---

# Verification Before Completion

Do not claim success without fresh evidence.

## Gate Function

Before saying work is done, fixed, passing, ready, clean, or complete:

1. **Identify** what evidence proves the claim.
2. **Run or inspect** the evidence after the latest relevant edit.
3. **Read** the output/result, including exit code and failures.
4. **Compare** evidence to the actual claim.
5. **Report** the claim with evidence, or state the limitation directly.

If you cannot run a check, say so. Do not convert inability to verify into confidence.

## Evidence by Claim

| Claim                   | Required evidence                                            |
| ----------------------- | ------------------------------------------------------------ |
| Tests pass              | Fresh test command output after edits                        |
| Typecheck/lint clean    | Fresh command output after edits                             |
| Bug fixed               | Reproduction or regression test passes                       |
| Feature complete        | Requirements/task checklist plus relevant tests              |
| Subagent completed task | Parent inspected subagent summary, diff, and verification    |
| Config/skill valid      | Frontmatter/path/reference validation or explicit inspection |
| No behavior change      | Diff inspection showing prompt/docs/config-only change       |

## Subagent Verification

Do not trust “worker says done” by itself.

Parent must inspect at least one of:

- changed files/diff,
- test output captured by worker,
- reviewer findings,
- relevant command output rerun by parent.

If parent cannot verify directly, report “worker reported X; I did not independently verify Y.”

## Completion Report Format

Use this shape:

```text
Changed: <files/areas>
Verification: <commands/evidence and results>
Review: <review status or not run>
Risks: <remaining risks or none known>
Next: <user-run git/PR steps if needed>
```

## Red Flags

Stop before claiming success if you are about to say:

- should work
- probably fixed
- seems fine
- all good
- done
- ready
- tests should pass

Replace with evidence or uncertainty.

## Config/Prompt Work

For agent config, skills, and prompts, verification may be inspection-based. Still make it explicit:

- skill directory name matches `name`,
- frontmatter has `name` and `description`,
- referenced skill names/files exist,
- JSON parses,
- package/resource discovery command ran if safe.
