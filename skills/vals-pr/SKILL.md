---
name: vals-pr
description: Prepare a pull request for human review, review someone else's pull request, or respond to pull-request feedback
---

# Pull Request Review

Make the pull request easy to understand and review

This skill owns PR-specific state, live-test suggestions, the human review handoff, proposed PR comments, comment-resolution ownership, and user-approved GitHub mutations

Live tests, supporting artifacts, stacked PRs, and the author handoff are recommendations, not blockers. If the author wants to request review without them, explain what is missing and continue

## Prepare Your PR for Human Review

### Before involving the author

1. Inspect the current PR, diff, checks, comments, intent, and repository rules
2. Run a fresh review of the current PR change and any AI-reviewer feedback
3. Identify and suggest a representative live test when one would add useful evidence
   - Draft how its result would be reported in the PR description
   - If no useful live test is possible, say why
   - Keep PR checks and static checks separate from live-test evidence
4. Decide from the change whether it needs:
   - a diagram for an architectural change
   - a design document for a large change
   - stacked PRs when clear dependent slices would be easier to review
5. After meaningful changes, run a fresh review of the current PR, then refresh the suggested tests and checks

Continue until the code and evidence are current. Ask the author earlier only when a real decision or approval is needed

### Finish with the author

After the review:
1. Have the author read every changed line in the GitHub UI
2. Have the author write one short section explaining why the change is needed and how it works
   - Check it for accuracy
   - Do not silently rewrite it
3. Show any remaining recommendations, then draft a short review request with:
   - the PR link
   - a one-sentence purpose
   - the requested review level: `stamp`, `focused`, or `deep`
   - the live-test status
   - the most useful area to inspect

Draft PR-description changes and update GitHub only with the user’s approval

## Review Someone Else's PR

1. Read the description, full diff, checks, comments, relevant code, and repository rules
2. Explain the change to the user in plain language
3. Run a fresh review of the change and synthesize the result
4. Turn validated findings into proposed comments labeled `blocking`, `question`, `suggestion`, or `nit`
5. Show every proposed comment to the user
6. Post only comments the user approves

## Respond to Feedback

- Read every comment and relevant code change
- Evaluate each comment against the current code and available evidence
- Give every comment an explicit response
- Recheck the original concern after a fix
- Show every proposed reply to the user
- Post only replies the user approves
- The author or their agent may resolve AI-reviewer comments after addressing them
- Only the human reviewer may resolve comments left by that reviewer
