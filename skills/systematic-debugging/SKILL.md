---
name: systematic-debugging
description: Structured debugging workflow — observe, hypothesize, verify, fix. Use when investigating bugs, test failures, crashes, unexpected behavior, or when asked to "debug this", "why is this failing", "investigate this error". Do not use for casual discussion about errors.
---

# Systematic Debugging

When something fails, DO NOT guess. Follow this sequence:

## 1. Observe
- Read the FULL error message and stack trace
- Identify the exact file, line, and function where it fails
- Use tree-sitter `symbol_definition` to read the failing function
- Check recent changes with `git diff` and `git log --oneline -10`

## 2. Hypothesize
- Form ONE specific theory based on the evidence
- State it explicitly: "I believe the error occurs because X"
- Mark uncertainty: **[ASSUMPTION: ...]**

## 3. Verify
- Test the hypothesis BEFORE implementing a fix
- Read the relevant code. Check the actual values. Trace the data flow.
- If the hypothesis is wrong, go back to step 1 with new information
- Do NOT skip this step

## 4. Fix
- Target the root cause, not the symptom
- Make the minimal change that fixes the issue
- Add a test that covers this failure case
- Run checks to verify the fix

## Anti-Patterns (DO NOT DO)
- Shotgun debugging — making random changes hoping something works
- Guessing at runtime values without checking
- "This should work" without running verification
- Searching the wrong codebase/module (ask if unsure)
- Multiple fix attempts without understanding the problem
- Fixing symptoms while the root cause remains
