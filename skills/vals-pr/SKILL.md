---
name: vals-pr
description: Prepare or review a Vals pull request. Use this when putting a PR up for human review, checking whether it is ready, responding to feedback, or reviewing someone else's PR.
---

# Vals Pull Requests

## Inspect the PR

Inspect the PR. Note its number, URL, state, head branch and commit, base branch and commit, template, required checks, and existing comments.

Use GitHub and Git to inspect the full diff, history, repository rules, and relevant source. Confirm the same PR, head commit, and base commit before saying it is ready or making an approved change. If any changed, discard stale evidence and review the current PR.

Follow the repository's template, checks, ownership rules, and release process. Equivalent description headings are enough; do not duplicate sections just to use different names.

Use Slack, Notion, observability, linked documents, or other direct sources when they help explain intent, behavior, impact, or earlier decisions. Keep only what matters to the review. If an optional source is unavailable, say what could not be checked. Continue when the remaining evidence is enough; stop when the missing source is needed to review responsibly.

Make every PR easy to understand and review.

When the user wants human review or is reviewing someone else's PR, use this process. Leave draft PRs and merge queues alone. Follow the repository's own data and release rules.

A PR is ready for human review only when its author believes it can merge safely without the reviewer finding a required change.

Write for the reviewer:

- Prefer the simplest clean solution that fully solves the problem
- Use concise, well-organized language for people
- Explain the problem and change before low-level details
- Use short paragraphs, clear headings, and bullets only when they help
- Cut filler, canned praise, repeated summaries, process jargon, giant checklists, and unnecessary sections
- Avoid AI slop in descriptions, comments, replies, documentation, and diagrams

## Shared Rules

### Keep author and reviewer roles separate

- The author reads, addresses, and replies to every comment, even after changing the code
- The user reads every agent-drafted reply before it is posted
- The author never resolves a reviewer's thread
- The reviewer checks the response or fix and resolves their own thread only when the concern is addressed

### Choose the review depth

- **Stamp:** a very small, clean, well-understood change with an obvious effect
- **Focused:** a narrow change with a small, clear area of risk
- **Deep:** a core or sensitive production path, public contract, broad behavior, or architectural change

Human review is optional for prototype or unshipped work and should be used when useful. When the user asks for human review, the same readiness rules apply at every depth.

### Ask before changing anything external

Reading never authorizes a change.

Before creating or editing a PR, changing its state, posting a comment or review, requesting a reviewer, approving, resolving, or merging, tell the user the exact repository, PR, action, fields, and lasting effect. Wait for exact approval. One approval covers only the named action.

After an approved change, read back the result. Stop on stale state, pending required reviewer output, timeout, partial failure, or ambiguity. Never retry a change blindly. Follow the same rule for Slack, Notion, and every other external system.

## Prepare Your PR for Review

### 1. Explain the PR to the author

Explain:

- the problem or need
- what the diff changes and how the main flow works
- why the change solves the problem
- important scope, compatibility, and operational effects supported by the diff
- available evidence and remaining uncertainty
- the best places for a reviewer to start

For a bug fix, make sure the author can explain the cause and why the PR fixes it. For other changes, make sure they can explain the need and why the PR meets it. If the evidence does not establish this, say so instead of inventing an explanation.

### 2. Run the review loop

Follow this order before requesting human review.

#### Run fresh agent reviews

Assign these five angles to five fresh, independent reviewers:

1. **Simplicity and cleanliness — primary:** unnecessary concepts, abstraction, duplication, indirection, or AI slop
2. **Correctness:** intended behavior, reachable states, regressions, and consumer effects
3. **Defensive coding:** only failures and boundary states the real producers can reach; no invented hypotheticals
4. **Spec and intent:** whether the diff matches the stated problem and approved scope without extra behavior
5. **Test and evidence quality:** whether the evidence plan will prove the changed behavior and what live validation must cover

Give each reviewer the current PR, head commit, base commit, actual diff, stated intent, scope, repository rules, and one angle. Keep the angles separate and do not invent findings to fill a slot.

Prioritize simplicity. Keep findings within the PR's scope. Mark optional or adjacent feedback as a non-blocking `nit:` and do not expand the PR silently. Ask the user before adopting a suggestion that meaningfully changes scope or design.

Check each finding before acting. Fix supported in-scope findings and explain with evidence when feedback is wrong.

#### Address AI-reviewer comments

Some repository AI reviewers run only after the PR leaves draft. When needed, explain which state change will trigger them and get separate approval before making it.

Wait for required checks and, when the repository uses them, AI reviewers to finish. Read every comment and follow the shared author/reviewer rules above. Continue until no required AI-review finding remains and every comment has a user-reviewed response.

#### Run live tests

Run a live test of the changed user or system path. Record the scenario or command, observed result, and where it ran. Put that result in the PR description.

The testing section is only for live-test evidence. Do not put unit or automated tests, lint, formatting, type checks, CI checks, or other static results there.

#### Have the author review the diff

Have the author read every changed line in GitHub and ask at least one genuine question about the diff. Answer from the current diff and evidence, then confirm they understand.

#### Repeat until good

If the code changes in a meaningful way, start this loop again: rerun all five fresh reviews, address new AI-reviewer comments, rerun the live test, and have the author reread the changed lines. Repeat every affected test and evidence check. Continue until the evidence is current and clean.

### 3. Write the PR description

After the review loop is clean, write the normal PR body from the current diff and evidence. Follow the repository's existing format. Keep it concise, simple, and easy to scan.

Start with a short model-written summary of the observable change. Add what changed, reviewer context, or rollout and risk notes only when they help. Do not add empty sections, repeated summaries, or a large boilerplate template.

Write only reviewer-facing context. Do not narrate the agent, its tools, the internal review process, or how the description was produced. Include rollout or setup instructions when the reviewer needs them.

The agent writes every part of the description except the short Why and How. Add this section unless the repository template already has clearly equivalent author-only fields:

```markdown
## Human Description

### Why
[Written by the author]

### How
[Written by the author]
```

Have the author fill in a **short Why** and **short How**. Do not draft, suggest, autocomplete, paraphrase, or provide candidate Why or How text, even if the author asks.

Preserve the author's exact wording. Check it against the requirements, diff, and evidence. If it is inaccurate, incomplete, misleading, or not concise, explain the problem and ask the author to revise it. Never rewrite it silently.

Use the live-test result from the review loop in the repository's testing section. Do not put unit or automated tests, lint, formatting, type checks, CI checks, or other static results there.

If revising the description reveals a code problem or leads to a meaningful code change, run the complete review loop again.

### 4. Check the design context

Ask the user whether the change is architectural. Do not decide silently.

If it is architectural:

- Require a simple diagram showing only the relationships or flow needed to understand the change
- Use concise, human-readable labels
- Follow the repository's diagram and design-document conventions

Also check that earlier design work matched the size of the change:

- Large changes had a design document before implementation
- Medium changes with meaningful approach uncertainty had a short team discussion
- Small, clear changes could proceed directly

If required design work was skipped, report it as a blocker. Do not invent retrospective justification.

Use stacked PRs when clear dependent slices are easier to understand separately. Do not split one coherent change just to create a stack.

If this step leads to a meaningful code change, run the complete review loop again.

### 5. Report whether the PR is ready

Use this format:

```text
READY | NOT READY — <stamp, focused, or deep>

Blockers:
- <only unresolved blockers; omit when ready>

Evidence:
- <live-test result>
- <five-review status>
- <AI-comment status>
- <author diff-review and question status>
- <required checks status>

Next:
- <one exact next action>
```

`READY` requires:

- short, accurate, author-written Why and How
- a passing live test whose result is in the description
- all five reviews are clean for the current diff
- every AI and human comment has a user-reviewed response
- no required check is failing or pending
- the author completed the full-diff read and asked a genuine question
- any design document or diagram required by the user-confirmed architecture and size classification is present
- the PR, head commit, and base commit still match the reviewed version

When ready, draft a short review request with:

- the PR link and one-sentence purpose
- stamp, focused, or deep review
- the live-test result
- the smallest useful area for the reviewer to focus on

## Review Someone Else's PR

### 1. Understand it before judging it

Inspect the PR under the shared rules. Read its description, full diff, checks, comments, relevant code and docs, and repository rules. Explain it clearly to the user before proposing comments or approval.

Choose stamp, focused, or deep review from the actual change. A quick review is focused, not careless. Do not approve code you do not understand.

### 2. Review it

Use fresh, independent reviewers. Inspect the code, tests, docs, and live behavior needed to judge the change.

- Check that the diff does what the description says
- Prioritize correctness, simplicity, and the stated scope
- Check compatibility, integration, and evidence only where the changed path reaches them
- Do not invent edge cases or hunt unrelated code
- Do not post low-value nits
- Use live evidence when it can safely and directly verify a claim

Keep optional adjacent feedback separate and non-blocking. If adopting it would meaningfully expand scope or change design, ask the user before requesting it.

Use exactly one label on every proposed comment:

- `blocking:` — must be addressed before merge
- `question:` — needs an answer before the reviewer can conclude
- `suggestion:` — useful but optional
- `nit:` — trivial, rare, non-blocking polish that may be out of scope

Write concise, specific comments backed by evidence and easy to act on. Put line-specific findings inline and cross-cutting findings in the review summary.

Have the user read every proposed comment before posting it.

### 3. Finish the response loop

When the author responds:

- Read every response and relevant new diff
- Check the response or fix against the original concern
- Reply when clarification remains
- Resolve the thread only after the concern is addressed
- Confirm the PR, head commit, and base commit before approval
