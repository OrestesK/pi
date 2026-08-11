---
name: github-issues
description: Use for triaging, drafting, or improving GitHub issues from verified evidence
---

# GitHub Issue Authoring

Turn a verified problem into a useful GitHub issue without inventing product decisions or implementation details.

Load `github` for GitHub operations. For a nontrivial draft or batch, load `review`. Load `manager-workflow` when its global trigger applies. This skill does not authorize GitHub mutations.

## Core Contract

- The user decides the issue's goal, scope, high-level direction, completion outcomes, and metadata
- Research facts before asking questions; ask the user only for decisions evidence cannot answer
- Before drafting the final issue, confirm the goal, scope, any high-level direction, and observable completion outcomes
- Do not ask again about a decision the request already makes
- If a decision is still missing, interview before drafting; never use a finished draft to obtain it
- Ask one focused question at a time
- Work on one viable issue at a time unless the user explicitly requests a batch
- Prefer an existing canonical issue over creating a duplicate
- Keep the issue detailed enough to act on, but leave detailed design and execution to the assignee
- Preserve uncertainty instead of converting it into a cause, impact, requirement, or owner

When triaging many findings, report all findings that should **not** become issues together first. Then discuss viable new issues one at a time.

## Ticketability Gate

Before drafting a new issue, establish:

1. **Actual problem:** A current observable failure, gap, or missing behavior exists
2. **Impact:** Evidence establishes why it matters; volume alone is not impact
3. **Current state:** The problem is not already fixed or only historical
4. **Ownership:** The proposed repository and subsystem own the affected boundary
5. **Evidence strength:** The title, context, and goal do not exceed what the evidence proves
6. **No duplicate:** No existing issue already owns the same outcome
7. **Right artifact:** A new issue is better than an evidence comment, telemetry cleanup, configuration correction, existing issue update, or no action

Do not recommend a new issue when the evidence shows only:

- an already-fixed defect
- an expected or correctly handled validation failure
- duplicate or noisy telemetry without a separate product failure
- stale, local, user-provided, or unsupported configuration
- one generic error group containing unrelated lower causes
- an existing canonical owner that only needs new evidence
- a product or workflow the user explicitly excluded

State the no-ticket disposition plainly and explain the better destination.

## Research and Interview

Before asking the user:

- Read the current issue or planning source completely
- Inspect current source, docs, types, tests, logs, runs, and external evidence needed to establish behavior and ownership
- For an operational or reliability issue, inspect each available source that could prove or disprove the claim. This can include Slack, Sentry, service logs, run evidence, current source, and existing issues or PRs
- Do not inspect an irrelevant source just to complete a checklist
- Keep a short scratch record of the sources and time periods checked, unavailable evidence, and what the evidence establishes about scope and ownership. Put only material proof in the issue body
- Search titles and bodies in the proposed repository and in every repository that the evidence identifies as a plausible canonical or implementation owner
- Read every issue, PR, document, or discussion before proposing it as related work
- Distinguish current behavior from historical proposals, partial fixes, and stale evidence
- Establish whether grouped telemetry represents unique incidents, wrappers, polling amplification, or heterogeneous causes

Ask the user, one decision at a time, only when unresolved:

- What outcome the issue should require
- Which high-level implementation direction, if any, the author wants to record
- Which observable completion outcomes are intended
- Which owner, repository, and title prefix are correct when evidence does not settle them
- Whether the action should be a new issue, body update, evidence comment, title-only change, or no ticket
- Whether to assign, label, add to a project, create hierarchy, or synchronize a planning document

## Title

Follow the target repository's established convention. When bracketed ownership titles are used, prefer:

```text
[Product][Subsystem] <concise outcome>
```

- Use the proven owning boundary, not a suspected dependency
- Prefer an action or outcome over a vague topic
- Keep exact GitHub titles synchronized elsewhere only when that separate update is requested and approved

## Body Format

Use this default shape. Omit empty sections and unnecessary subsections.

```markdown
## Context

<What is happening, why it matters, the affected boundary, and material unknowns.>

## Verified evidence

- <Direct observation or source link and exactly what it establishes>

## Goal

<High-level observable outcome supplied by the user or established by the agreed scope.>

## Implementation

TODO — the assignee will review the evidence and propose the implementation before coding.

## Done when

- <Agreed, observable completion outcome>

## Related work

- [<Issue or PR>](<url>) — <the exact overlap, dependency, distinction, or ownership boundary>
```

Formatting rules:

- Use short paragraphs, bullets, and small useful subsections instead of prose walls
- Keep the issue understandable without copying the full research record
- Put source links beside the claims they support
- Use `Verified evidence` only for claims actually verified
- Put material unknowns in Context or Evidence; do not invent a separate section to fill space
- Omit `Related work` when nothing materially relevant exists
- Do not add standalone `Technical constraints`, `Risks`, `Recommendations`, `Open questions`, or `References` sections by default

## Assignee-Owned Implementation

Use the exact TODO shown in the default body above.

If the user supplies a high-level direction, include only that conceptual direction before the TODO. Do not invent:

- architecture or detailed technical design
- schemas, fields, APIs, or storage models
- thresholds, timeouts, retry counts, models, load sizes, or matrices
- sequencing, rollout, migration, or backfill steps
- edge cases or defensive behavior not established by reachable states
- exact tests or validation procedures unless they are part of the agreed observable contract

Research and best practices are evidence, not authority to turn a suggestion into a requirement. Historical proposals, rejected designs, partial fixes, and patches stay labeled as such and do not become Implementation or Done-when requirements.

## Evidence Integrity

- Match each factual claim to a direct source
- Separate issue-event counts, log rows, requests, runs, tasks, and users
- Do not treat direct and wrapper errors as independent incidents without correlation
- Do not generalize one representative event to an entire dynamic group
- Distinguish issue-lifetime timestamps from the investigated period
- Do not infer a shared cause from proximity, naming, or grouped telemetry
- Do not claim resolution from later non-recurrence unless the later load is equivalent; say when it is not
- Describe an existing PR as partial, local, undeployed, historical, or for a different boundary when that is what the evidence shows
- Do not include credentials, secrets, or unnecessary personal data

## Related Work Test

Include a link only when it materially affects at least one of:

- the exact problem or evidence
- ownership or duplication
- a required dependency
- the implementation boundary
- completion or closure

Read the linked material completely enough to verify the relationship. Explain in the issue what it covers and, when useful, what it does not cover. Remove thematic, duplicate, placeholder, stale, or merely adjacent links.

## Existing Issue Updates

Choose the smallest useful update:

- **New evidence only:** add a concise evidence comment; omit audit-process boilerplate and date-window prose unless material
- **Strong body already exists:** preserve it; do not rewrite only to enforce formatting
- **Ownership/title correction only:** prefer a title-only change when the body remains correct
- **Body rewrite requested:** preserve verified facts, agreed outcomes, comments, history, metadata, and native relationships

Immediately before proposing an update, read the live issue. Record its current title, body, and protected metadata. Immediately before an approved mutation, read those fields again. Abort if any field differs. Do not silently change title, state, assignee, labels, project status, parent/subissues, or planning documents.

## Drafting and Review

Before presenting a complete draft, establish or confirm with the user:

- the issue goal and scope
- high-level implementation direction, or the explicit choice to leave it TODO-only
- intended observable completion outcomes
- unresolved owner or metadata decisions that affect the draft

Once these decisions are established, present:

1. Target repository
2. Proposed exact title
3. Complete proposed body
4. Separately listed metadata changes, only when explicitly established
5. One focused decision: create, revise, or skip

For a nontrivial issue or batch, independently review:

- evidence and causal boundaries
- duplicate and ownership checks
- user-supplied versus invented requirements
- Done-when observability
- Related-work relevance
- title and body consistency

Show the revised exact draft before requesting mutation approval.

## GitHub Mutation

Use `gh`, never GitHub MCP. Follow the `github` skill and active authorization rules.

Before mutation, state:

- exact tool and repository
- create, edit, or comment action
- exact targets and fields
- expected persistent effects
- authentication, internal-data, and metadata boundaries

Then wait for exact approval. Approval for one action does not authorize another.

When approved:

- Repeat the bounded cross-repository duplicate search immediately before creation
- For an update, compare the live title, body, and protected metadata with the recorded expected fields immediately before mutation and abort on mismatch
- Preflight the target repository and current issue state
- Use a body file for multiline content
- Apply only approved fields
- Do not assign, label, add to a project, create hierarchy, close, reopen, or update planning docs unless separately included
- Immediately read back the canonical URL, title, body, state, and any approved metadata
- Stop on a stale precondition, concurrent edit, timeout, partial failure, or ambiguous result; never retry a mutation blindly

## Final Checklist

Before calling an issue ready:

- The user supplied or approved the goal and high-level behavior
- Every factual claim has current evidence
- Unknown causes and impacts remain unknown
- The proposed owner and title prefix are supported
- Existing issues were checked by title and body across the bounded plausible-owner repositories
- Operational evidence coverage and investigated time periods are recorded outside the issue body
- A new issue is the right artifact
- Implementation is TODO-only except for user-approved high-level direction
- Done when contains observable outcomes, not an invented design
- Every related-work link was read and its direct relevance is stated
- Empty and ceremonial sections are omitted
- No metadata or adjacent external update is implied
- The issue is concise, structured, and understandable
