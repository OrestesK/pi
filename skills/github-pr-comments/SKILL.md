---
name: github-pr-comments
description: Use for drafting, verifying, or posting actionable GitHub PR review comments
---

# GitHub PR Comments

Use this skill to turn reviewed findings into useful GitHub comments. It covers drafting, formatting, verification, and authorized posting; it does not replace code review. Load `review` for the review itself and `github` for GitHub CLI rules.

## Core Rules

- Use `gh` only for GitHub operations. Never use GitHub MCP.
- Before a GitHub mutation, the user must request and explicitly approve the exact tool (`gh`), command, action, target, and expected effect. Follow `github` for the remaining disclosure and wait requirements
- Recheck the PR head immediately before quoting or posting comments
- Verify every finding from source, diff, checks, docs, prior comments, and the proof method selected through `github` → `behavioral-proof`
- Use the proof method that `github` selects through `behavioral-proof`. Do not run a live, external, credentialed, or effectful probe until its approval gate allows it. If a meaningful live check does not run, name the strongest non-live evidence and say what live behavior remains unchecked
- State assumptions. If a finding depends on one, ask it as a question; drop it when the assumption is weak or unverifiable
- Drop speculative "what if" nits unless the user explicitly asks for exhaustive hypotheticals
- Prioritize concrete, evidence-backed comments about simplification, design, architecture, structure, source-of-truth ownership, deduplication, typing boundaries, and existing-pattern reuse
- Other minor nits require the user's explicit selection before posting
- Keep language casual, direct, and code-focused. No filler, praise padding, or performative politeness.

These rules combine GitHub review conventions with the user's preference for concise, evidence-backed comments.

## Preflight Checklist

Before drafting comments:

1. Load `github` and `review` skills if not already loaded.
2. Identify repo and PR number.
3. Recheck PR metadata:

   ```bash
   gh pr view <PR> --json headRefOid,state,updatedAt,changedFiles,additions,deletions,title,url
   ```

4. Recheck checks when relevant:

   ```bash
   gh pr checks <PR>
   ```

5. Get the diff/patch for inline anchor validation:

   ```bash
   gh pr diff <PR> --patch > /tmp/pr-<PR>.diff
   ```

6. Read relevant current files at the reviewed head, not stale local assumptions. Use one of these read-only paths:

   ```bash
   # First compare local HEAD to the fetched PR headRefOid:
   LOCAL_HEAD=$(git rev-parse HEAD)
   test "$LOCAL_HEAD" = "<HEAD_SHA>"

   # Only if that equality check passes, local file reads are valid.
   # Otherwise read a file from the PR head without checkout:
   git show <HEAD_SHA>:path/to/file

   # Or, for remote-only review:
   gh api 'repos/<owner>/<repo>/contents/path/to/file?ref=<HEAD_SHA>' --jq .content | base64 -d
   ```

   If `git rev-parse HEAD` does not equal the fetched PR `headRefOid`, do not trust local file reads for PR-head evidence. Do not use `git checkout`, `git switch`, `git reset`, or other mutating git commands just to inspect PR contents.

7. Read existing comments by default to avoid duplicate/noisy feedback:

   ```bash
   gh api --paginate 'repos/<owner>/<repo>/pulls/<PR>/comments?per_page=100'
   gh api --paginate 'repos/<owner>/<repo>/pulls/<PR>/reviews?per_page=100'
   gh api --paginate 'repos/<owner>/<repo>/issues/<PR>/comments?per_page=100'
   ```

   Skip this only when the user explicitly says duplicate checking is unnecessary.

8. If the PR head changes while drafting, restart verification against the new head.

## Finding Filter

Post only findings that pass all gates:

- **Evidence:** Direct source/diff/test/docs/CI evidence exists.
- **Claim-bound proof:** The method selected through `github` → `behavioral-proof` directly supports the claim. If live proof did not run, name the strongest non-live evidence and the live behavior that remains unchecked.
- **Impact:** The comment explains why it matters.
- **Actionability:** The author can fix it, answer a focused question, or intentionally decline it.
- **Scope:** The issue belongs to this PR, not unrelated old code.
- **Signal:** The comment is worth the notification/noise cost. Architecture/design/simplification issues get higher priority than cosmetic or preference nits.
- **No speculation:** The comment does not rely on an invented "what if" unless the risk is direct and realistic.
- **Assumptions listed:** Any assumption is explicit, separated from evidence, and phrased as a question instead of a fact.

Drop or downgrade:

- linter/style issues that automation should catch,
- personal taste without a repo pattern,
- minor non-architecture/non-design/non-simplification nits unless the user explicitly approves posting them,
- huge refactors not required for the current PR,
- generic architecture essays that can be split into specific comments,
- uncertain claims that cannot be verified; ask a question or mark as not 100% instead,
- claims whose selected proof method was skipped or replaced with weaker evidence without justification,
- assumption-led comments where the assumption is likely wrong, unimportant, or not worth asking about.

## General vs Inline Placement

Use **inline comments** for:

- a concrete issue on a changed line,
- a local simplification/refactor at one spot,
- a type/API problem visible at a specific declaration,
- a test/doc issue anchored to a new/changed line.

Use the **review body / general PR comment** for:

- cross-cutting architecture feedback,
- comments spanning multiple files,
- scope/product questions,
- findings whose exact best anchor is not changed/commentable,
- summary of verification and review rubric.

Do not force an inline comment onto a bad line. If the anchor is not commentable in the diff, move it to the review body.

## Comment Shape

Use this shape for each postable comment. Keep it concise but complete.

```markdown
<casual opening sentence / focused question>

What’s wrong:
- <specific issue>

Evidence:
- <file:line or direct source/check evidence>

Assumptions:
- <only include if the comment depends on an assumption; phrase it as "Assuming X is intended...">

Verification done:
- <live command/check result first when available; otherwise what was inspected and why a live check was not practical>

Proposed fix:
- <specific direction>
```

If unsure, assumption-dependent, or the decision is product/architecture preference, replace `Proposed fix` with:

```markdown
Proposed fix/question:
- Assuming <specific assumption>, should we <recommended direction>? If that assumption is wrong, what should this path optimize for instead?
```

For tiny comments, it is okay to collapse bullets into short paragraphs, but do not omit evidence or verification when the user asked for verified comments. Include a live test, build, import, or runtime result only when the proof method selected through `github` → `behavioral-proof` includes that probe; otherwise report the selected non-live evidence and any applicable unverified boundary.

## Claim Verification Examples

The preflight loads `github`, which reaches `behavioral-proof`. Use its selected method for each falsifiable claim. These examples show possible probes; they do not authorize or require one:

- packaging/import claims: build or inspect the wheel/sdist, or run an installed-package import probe;
- type/schema claims: run the relevant typecheck, schema generation, OpenAPI generation, or a small serialization/validation probe;
- runtime behavior claims: run the narrow unit test, endpoint test, request/response probe, or minimal reproducer;
- config/docs availability claims: run the command/example/import shown in docs, or inspect generated artifacts produced by the documented flow;
- dead-code claims: combine source search with an import/test run when removal would otherwise be risky;
- test-quality claims: run the relevant test and state what it does and does not prove.

Follow the proof rule in Core Rules before any live, external, credentialed, or effectful probe. If live proof cannot or should not run, use the strongest named non-live evidence and name the live behavior left unchecked. Do not force a live prompt when no meaningful runtime path exists.

## Language Style

Prefer:

- "Can we move this into the existing helper?"
- "I think this is doing the same job as ..."
- "This looks scaffold-only right now."
- "What’s wrong: ..."
- "Evidence: ..."
- "Verification done: ..."
- "Assuming this is meant to ..., should we ...?"
- "Proposed fix/question: ..."

Avoid:

- "Great catch", "awesome", "nitpick" filler.
- Blame language: "you forgot", "you should have".
- Overstating severity: do not call something broken if it is a simplification preference.
- Vague comments: "this is weird", "clean this up", "bad architecture".
- Speculative nits: "what if X and Y collide someday" unless evidence shows this is a direct current risk.
- Assumption-as-fact phrasing: "this is for X" when the evidence only supports "assuming this is for X...".

## Severity and Review Event

Default to `event: "COMMENT"` unless the user explicitly asks to approve or request changes.

Only use `REQUEST_CHANGES` when:

- the user explicitly asks for a blocking review, and
- at least one verified blocker/must-fix exists.

Do not approve unless the user explicitly asks and readiness has been verified.

In comment text, use lightweight severity only when useful:

- `must-fix`: correctness/security/package breakage/API contract failure.
- `should-fix`: maintainability, architecture, tests, typing, avoidable duplication.
- `question`: product/scope/architecture decision that cannot be decided from evidence alone.
- `nit`: allowed by default only for concrete simplification/design/architecture/structure/deduplication/typing-boundary issues. For other minor nits, ask the user before posting.

## Drafting Workflow

1. List candidate findings, sorted with simplification/design/architecture/structure/source-of-truth/deduplication/typing-boundary issues first.
2. For each candidate, write a one-line falsifiable claim.
3. Verify it from source/diff/checks.
4. Use the proof method selected through `github` → `behavioral-proof`. If a meaningful live check does not run, record the strongest non-live evidence, name the unchecked live behavior, and lower confidence when that gap matters.
5. List every assumption the claim depends on. If the finding only works when an assumption is true, phrase the comment as a question; if the assumption is weak or not worth asking, drop it.
6. Mark it:
   - `post-inline`,
   - `post-general`,
   - `not-100-percent-question`,
   - `ask-user-first-minor-nit`,
   - `drop`.
7. Remove duplicates and merge findings with the same root cause. Drop ordinary minor nits unless the user has explicitly approved posting that category or that exact comment.
8. Rewrite in casual language using the comment shape.
9. Present the list to the user before posting unless the user already explicitly asked to post a specific prepared set.

## Posting Workflow

Use one atomic review payload. Do not post one comment at a time unless the user explicitly asks for a single one-off comment or atomic review fails after retries.

1. Re-fetch head SHA immediately before building payload:

   ```bash
   gh pr view <PR> --json headRefOid --jq .headRefOid
   ```

2. Verify inline anchors are on changed/commentable diff lines, not merely present in the file:

   ```bash
   gh pr diff <PR> --patch > /tmp/pr-<PR>.diff
   ```

   For each planned inline comment, confirm the `{path, line, side}` appears in a current diff hunk on the correct side. Practical checks:

   - Added/modified new-file lines use `side: "RIGHT"` and a `+` hunk line matching that new-file line number.
   - Deleted old-file lines use `side: "LEFT"` and a `-` hunk line matching that old-file line number.
   - Multi-line comments include `start_line`, `start_side`, `line`, and `side`, and the whole range is inside the same commentable hunk.
   - If a finding is true but the anchor is not commentable, move it to the review body/general comment instead of forcing a bad inline anchor.

3. Build `/tmp/pr-<PR>-review.json`:

   ```json
   {
     "commit_id": "<HEAD_SHA>",
     "event": "COMMENT",
     "body": "<short review summary + verification>",
     "comments": [
       {
         "path": "path/to/file.ext",
         "line": 123,
         "side": "RIGHT",
         "body": "<comment markdown>"
       }
     ]
   }
   ```

4. State the mutation before running it:

   ```text
   Posting one GitHub PR review to <owner>/<repo>#<PR> with <N> inline comments, event=COMMENT.
   ```

5. Submit and capture the response:

   ```bash
   gh api repos/<owner>/<repo>/pulls/<PR>/reviews \
     --method POST \
     --input /tmp/pr-<PR>-review.json \
     > /tmp/pr-<PR>-review-response.json
   ```

   Extract the review ID and URL from the response:

   ```bash
   REVIEW_ID=$(jq -r '.id' /tmp/pr-<PR>-review-response.json)
   REVIEW_URL=$(jq -r '.html_url' /tmp/pr-<PR>-review-response.json)
   ```

6. Verify after posting with the captured review ID:

   ```bash
   gh api --paginate 'repos/<owner>/<repo>/pulls/<PR>/comments?per_page=100' \
     --jq "[.[] | select(.pull_request_review_id == ${REVIEW_ID})] | length" \
     | awk '{sum += $1} END {print sum}'
   ```

   Compare the returned count to the number of inline comments in the submitted payload. Also inspect at least the paths/first lines if exact placement matters:

   ```bash
   gh api --paginate 'repos/<owner>/<repo>/pulls/<PR>/comments?per_page=100' \
     --jq ".[] | select(.pull_request_review_id == ${REVIEW_ID}) | {path,line,body:(.body|split(\"\\n\")[0])}"
   ```

7. Report:

   - `${REVIEW_URL}`,
   - number of inline comments submitted and verified,
   - event type,
   - any comments moved to review body because anchors were not commentable.

## Failure Handling

- If GitHub rejects the payload due to stale commit, re-fetch head SHA and re-verify anchors once.
- If a specific inline anchor is invalid, move that finding to the review body or ask the user before dropping it.
- If auth fails, run `gh auth status` and report the result.
- Stop after two failed posting attempts; do not spam partial comments.

## Example Comment

```markdown
Can we move this lookup into the existing helper layer?

What’s wrong:
- This route does config dump + cache lookup + normalization + model factory inline. The other gateway routes use helper functions for that.

Evidence:
- `model_gateway/routes/speech.py:49` calls `cache.get_or_create(...)` inline.
- `model_gateway/model_helpers.py` already owns `get_cached_llm()` / `get_query_llm()`.

Verification done:
- Read the speech route, query route, provider routes, and model helpers at the PR head. No narrow live check would prove this ownership issue directly, so this stays an architecture question.

Proposed fix:
- Add `get_cached_speech_model()` or similar and keep the route focused on request/response behavior.
```

## Done Criteria

Before claiming the review comments are ready or posted:

- PR head was checked after the latest relevant change, and any local file reads were used only after `git rev-parse HEAD` equaled the fetched PR `headRefOid`; otherwise files were read by `git show <HEAD_SHA>:...` or the GitHub contents API.
- Every comment is verified or explicitly marked as not 100% / question.
- Every comment used its selected claim-bound proof; for any meaningful live path that did not run, the comment gives the strongest non-live evidence and names the unchecked live behavior.
- Every assumption is listed; assumption-dependent comments are phrased as questions, not facts.
- Speculative findings were dropped.
- Simplification/design/architecture/structure/deduplication/typing-boundary comments were prioritized; ordinary minor nits were either user-approved or omitted.
- Inline anchors were validated against the diff.
- Posting, if performed, used one atomic `gh api .../reviews` payload.
- Posted comments were counted/verified after submission.
