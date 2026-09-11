---
name: pr-review-handoff
description: Use when the user asks to hand off their own pull request for human review
---

# PR Review Handoff

Use this only when the user asks to hand off their own PR for human review; no specific wording is required. It does not apply to normal PR preparation, reviewing another PR, or responding to feedback

The author handoff is a recommendation, not a blocker. If the author wants to request review without it, explain what is missing and continue

## Prepare the Handoff

1. Complete the applicable agent work in `github` and keep the PR code and evidence current
2. Draft the short human-review request before involving the user. Include:
   - the PR link
   - a one-sentence purpose
   - the requested review level: `stamp`, `focused`, or `deep`, followed by plain-language wording that explains the requested review
   - the live-test status, unless it adds no useful information
   - the most useful area to inspect

For `stamp`, say that it means a quick sanity check, then approve

## Finish with the User

1. Give the user a simple, direct summary of the PR and useful information, including an example. Show the prepared human-review request and any remaining recommendations
2. Have the user write their own short explanation of why the change is needed and how it works, then review it
   - If it has errors or gaps, explain them and ask the user to revise it
   - Do not substitute a corrected explanation or silently rewrite the user's explanation
3. Strongly suggest that the user read every changed line in the GitHub UI. This is the last handoff-preparation step
   - Ask once
   - If the user refuses, ask once more
   - If the user declines after the follow-up, explain that the readthrough was not completed and continue with the prepared review request. Do not ask again or push further
