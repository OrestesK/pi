---
name: review
description: Use for reviewing code, plans, and implementations against requirements and project standards
---

# Review

Review is evidence gathering, not rubber-stamping

## Independent review routing

For every nontrivial plan review, nontrivial review request, and nontrivial code change, require current independent coverage of all six base angles below before final readiness. Build a coverage map before fanout

An explicit deep code-quality review uses the same six angles over the wider user-approved target

Count an angle as covered only when:
- a fresh independent reviewer was explicitly assigned that exact angle, with its complete description and a distinct evidence target
- the result addresses the current approved behavior and the exact item or effective change relevant to that angle
- its conclusion and evidence remain usable
- no later correction changed that angle’s approved contract, evidence target, relevant item or effective change, conclusion, or proof

Treat uncertain, implicit, parent-only, combined-angle, stale, inaccessible, or superseded evidence as uncovered. Launch one fresh independent reviewer for each uncovered base angle, assigned to exactly that one angle. One reviewer cannot satisfy two uncovered base angles. Do not relaunch an angle with valid current coverage only because the overall diff changed outside the evidence it covers. When no angle has valid coverage, launch six base reviewers. Record each angle’s status, evidence boundary, and review artifact before synthesizing `PASS`, `FAIL`, or `INCONCLUSIVE`

The parent also inspects the target, validates findings, synthesizes the result, and owns every decision

Every selected reviewer receives the approved behavior, non-goals, relevant decisions, actual target/effective change, required proof and available evidence, a distinct evidence target, and a stop condition. Each base reviewer additionally receives exactly one complete assigned base angle description, its defect target, and review questions. Each specialist receives exactly one additional-surface assignment. Reviewers never edit, become writers, vote, amend the behavioral contract, authorize scope expansion, or invent findings to fill a lane

The parent may launch a reviewer at any point when its exact target is ready. Prefer background execution and keep unrelated work moving. Early coverage remains valid only while its contract, target, evidence, and conclusion remain unchanged

### Six base angles

1. **Contract, user impact, and approved scope**
   - Defect target: work that is plausible or correct in isolation but solves the wrong problem or expands scope
   - Evidence: approved requirements, non-goals, user/caller behavior, public contracts, and reached compatibility effects
   - Questions: Does the result match the approved intent? Is behavior missing or extra? Are reached user, caller, API, or compatibility consequences intentional?
   - Stop: conclude when the approved contract and every reached public consequence are accounted for

2. **Reachable correctness**
   - Defect target: behavior that fails under states the inspected producers and contracts can create
   - Evidence: real producers, call paths, types, state transitions, consumers, failure evidence, and concurrency when reached
   - Questions: Does ordinary behavior remain correct? Are state changes coherent? Does the change introduce a real regression or violate an established invariant?
   - Stop: conclude when the changed behavior and its reachable consequences are accounted for

3. **Fail-fast and defensive code**
   - Defect target: unapproved validation, fallback, retry, recovery, coercion, normalization, compatibility, sanitization, security hardening, optionality, defaults, filtering, repair, or custom error wrapping in the changed logic
   - Evidence: the approved contract, real producers, owned types and invariants, raw failure behavior, and the effective change
   - Questions: Which defensive mechanisms were newly added by this change? Which are required by the approved contract? Which unapproved new mechanisms should be removed? Does the change modify or remove existing approved defensive behavior without user approval?
   - Stop: conclude when every new defensive mechanism is required or identified for removal, and every proposed change to existing approved defensive behavior is a user choice

4. **Architecture, ownership, integration, and consumers**
   - Defect target: locally correct work placed at the wrong owner or not reached by the real system
   - Evidence: canonical sources of truth, effective runtime/discovery/activation paths, callers, consumers, dependencies, and integration seams
   - Questions: Does the effective resource win at runtime? Is this the canonical owner? Are all real consumers covered? Does the change create or broaden an abstraction, move responsibility, or choose between materially different owners without user approval?
   - Stop: conclude when ownership, reachability, integration, and consumers are established from current evidence

5. **Simplicity, maintainability, and local fit**
   - **Simplicity and cleanliness:** inspect unnecessary concepts, abstraction, duplication, indirection, wrappers, branches, weak type boundaries, AI slop, and future-change cost
   - Defect target: correct work that creates avoidable structural cost or conflicts with repository patterns
   - Evidence: the named structural surface, current code patterns, ownership boundaries, and effective diff
   - Questions: Is this the smallest coherent design? Can a concept, branch, layer, or duplicate owner be deleted without losing behavior? Does it fit local style and architecture?
   - Stop: conclude at concrete behavior-preserving findings
     - do not manufacture style comments

6. **Claim-bound tests and proof**
   - **Test and evidence quality:** inspect whether tests, live/integration/manual evidence, static checks, and artifacts prove the changed claim
   - Defect target: implementation accepted on stale, partial, non-rerunnable, wrong-boundary, or implementation-only evidence
   - Evidence: proof contract, exact commands/flows, outputs, unavailable boundaries, and current claim identity
   - Questions: Could this evidence disprove a wrong implementation? Does it reach the claimed boundary? Are operational, rollback, or readiness checks needed on this path?
   - Stop: conclude when every material claim has sufficient current evidence or an explicit unavailable boundary

### Explicit deep code-quality review

When the user asks for a deep code-quality, structure, or simplification review, use the same six base angles over the complete user-approved target

Hold the approved behavior fixed. Read beyond the diff when ownership, duplication, or integration cannot be judged from changed lines alone. Require a real location or relationship, a concrete cost, a smaller safe direction, and evidence that the direction preserves behavior or a clear statement of what remains unverified

Do not report cosmetic or formatter-only comments, speculative rewrites, generic patterns with no current need, or changes with no concrete benefit. **No findings** is valid

Do not launch a second overlapping quality-reviewer set. Increase the target depth of the relevant six angles instead

### Conditional specialists

Add a fresh specialist only after user approval for a demonstrated additional surface, such as:
- security, privacy, or supply chain
- runtime operations, deployment, rollback, performance, capacity, or observability
- data/schema migration or persisted compatibility
- concurrency or distributed protocols
- accessibility or internationalization
- domain or regulatory correctness
- platform lifecycle or API behavior
- ML/data quality, evaluation, or fairness

Specialists are not part of the six base angles and remain outside base-angle coverage reuse

Before fanout, confirm that every selected reviewer can independently access the exact target. Supply the complete target inline, an identified readable repository or scratch path with its validity boundary, fixed Git refs and the effective diff, or an existing artifact with retrieval instructions. A reference only to visible or latest parent-session content is not a target. If the exact target cannot be supplied, return `INCONCLUSIVE` before fanout. Do not create a manifest or receipt only for this preflight

After a coherent review-fix group, choose the follow-up by effective risk:
- **Tiny mechanical fix:** no behavior, contract, reachability, or proof meaning changed. The parent inspects the final diff and runs the narrowest check
  - no child reviewer is required
- **Contained correction:** one localized behavior, correctness, or proof defect is corrected without changing a public contract, security/data boundary, shared abstraction, cross-owner behavior, or new reachable consumer. Use one fresh targeted reviewer or validator
- **Broad or high-risk correction:** architecture or ownership, public contracts, security/data boundaries, concurrency, compatibility, shared abstractions, several consumers, or a materially changed proof strategy. Reassess which base-angle coverage the correction invalidated, launch one fresh reviewer for each now-uncovered base angle, and add any fresh change-triggered specialists

Use the broader tier when classification is unclear. Continue only while a new validated required finding produces a material correction. Stop when review is clean, only user choices or rejected suggestions remain, evidence stalls, a blocker appears, or another approval is required

A final `PASS` requires current coverage of all six base angles and every validated required finding to be fixed or explicitly deferred by the user

Only validated, mechanically local, non-material fixes inside the approved behavior may continue automatically. Automatic continuation does not select the writer. Final claim-bound verification is still required

A validated user choice does not fail the implementation and does not authorize work. Present it to the user before final completion

## Review Modes

Choose the mode explicitly

### 1. Spec Compliance Review

Check whether the implementation matches the approved task/plan exactly

Flag:
- missing requirements,
- extra behavior beyond scope,
- logic at the wrong canonical owner or the wrong public API shape,
- tests that do not prove the specified behavior,
- deviations from explicit constraints

Implementation in another necessary file is not itself a scope defect when it remains inside the approved behavior

In this mode, extra cleverness is a defect

### 2. Code Quality Review

Check whether the implementation is safe, simple, tested, and maintainable

Review:
- Correctness and reachable states
- Meaningful behavioral proof
- Security, auth, privacy, data, secret, or injection behavior only when the user approved that review surface
- Error/failure behavior only when the producer or contract makes it reachable
- Simplicity/YAGNI and unnecessary abstraction
- Existing codebase patterns
- Artifacts inside the reviewed change: debug logs, commented experiments, hardcoded values, stray TODOs
- Scope control
- Structural maintainability:
  - scattered special cases, mode flags, or one-off conditionals in busy flows,
  - missed behavior-preserving simplifications that delete concepts, branches, or layers,
  - logic outside the canonical owner layer,
  - duplicate helpers instead of canonical utilities,
  - loose type or object boundaries hiding invariants,
  - non-atomic related state updates,
  - unnecessary wrappers or generic mechanisms,
  - AI-slop patterns such as unnecessary comments, abnormal defensive checks, cast-to-escape typing, or nesting/wrappers inconsistent with local style,
  - files crossing roughly 1000 lines without a decomposition reason

Do not relitigate approved product scope unless the implementation creates risk

Do not treat git-index or working-tree hygiene as normal code-review findings. Ignore staged/unstaged mismatches, untracked files, dirty working trees, and tracking status unless the user explicitly asks for commit/release/staging hygiene or the issue is a real secret/destructive artifact risk. Repo-local `progress.md` files are scratch/memory files
do not ask to remove them or add `.gitignore` rules just because they are untracked

### 3. Plan Review

Check feasibility before implementation:
- previous behavior, proposed delta, recommendation, and outcome are explicit
- all material phases, changed and unchanged behavior, assumptions, uncertainties, risks, alternatives, tradeoffs, reversibility, evidence, and focus points are present
- tasks are ordered and small
- likely owners and commands are specific enough without turning them into the user approval boundary
- protected-action triggers, exclusions, and stop conditions are identified
- no mutating Git instructions are included

Review the visible draft asynchronously. The parent integrates supported findings before asking implementation approval

### 4. Review Feedback Evaluation

Treat review feedback as evidence to evaluate, not an order to obey blindly

For each item:
1. Read the full feedback before reacting
2. Verify it against code, tests, plan, and constraints
3. Apply the three-way classification:
   - required fix
   - user choice
   - rejected suggestion
4. Push back with evidence when feedback is wrong or conflicts with approved scope
5. Present every validated user choice with a recommendation, evidence, and material pros and cons, then ask one focused question

Structural feedback is not automatically correct. Verify that the proposed simplification is concrete, behavior-preserving, and compatible with approved scope. If it changes architecture, behavior, schema, config, security, data mutation, or public contracts, ask before implementing

Do not use filler such as “great catch,” “good point,” or “you're absolutely right.” Report technical action and evidence instead

## Finding groups

Review output keeps these groups distinct:
1. **Required findings:** defects inside the approved behavior and assigned angle
   - the only group that can fail the implementation or drive automatic fixes
2. **Choices for the user:** concrete supported material additions or changes outside the approved contract
   - never treat them as defects or authorization
3. **Outside-angle pointers:** concrete potentially material issues encountered outside the assigned angle
   - keep them short and do not investigate them in that review
4. **Nonblocking extras:** small concrete observations encountered incidentally
   - do not hunt or investigate them, request action, block readiness, or extend a review loop

The verdict covers only the assigned angle. A validated user choice, outside-angle pointer, or nonblocking extra does not change `PASS` to `FAIL`. The parent must present user choices before final completion

Use `must-fix` or `should-fix` only for required findings. Report a minor concrete observation only as a nonblocking extra when it is already encountered. Omit empty groups rather than manufacturing content

## Fix explicit Git targets before review

When the user explicitly names a branch, tag, commit, or range:
1. Resolve each named ref once to an immutable commit ID with read-only Git commands
2. Resolve the merge base when that matches the requested comparison semantics
3. Record the fixed base and head IDs plus the included commit list
4. Give every reviewer the same fixed target and effective diff
5. Stop when a ref does not resolve or the comparison is unexpectedly empty

Do not fetch or mutate Git to resolve a target. Ordinary working-tree review is unchanged. `github` owns remote pull-request identity and metadata
`semantic-git` owns structural Git analysis

## How to Review

- Read the approved behavior/non-goals, relevant decisions, plan/spec, proof/evidence, and actual target/effective change before judging
- Before reviewer dispatch, review the total effective diffs and the bodies of every in-scope untracked file
- Treat ownership/navigation, LSP semantics/relationships, AST structure/search/refactor, and diagnostics as separate relevance-gated evidence groups. Use every materially relevant group and state why an expected group is unavailable or inapplicable
  - do not call irrelevant groups mechanically
- Inspect available test evidence when it materially improves review confidence
- Cite file paths and line numbers for findings
- Categorize reported items as a required fix, user choice, outside-angle pointer, or nonblocking extra
- Return findings inline unless an explicit output path or wrapper capture is provided
  - use `.scratch/reviews/` for allowed review artifacts. Do not use shell writes to create them

## Delegated Reviewer Subagents

The reviewer agent does not inherit this skill by default, so standards that must apply inside delegated reviews must exist in the reviewer agent prompt or be included explicitly in the subagent task

For delegated reviews, send the reviewer packet required above. Give each reviewer one angle or specialist surface only and state that its verdict covers only that assignment

If a reviewer encounters a concrete issue outside its assignment, it returns one short pointer without investigating it

The parent session owns synthesis and decisions. It validates every candidate finding against scope, producer/reachability, concrete impact, proof, local fit, and behavior preservation. Reviewer findings are evidence, not orders. Do not let a reviewer expand scope, approve architecture changes, or trigger implementation. Feedback requiring a material behavior, architecture, schema, config, security, data, or public-contract decision returns to the user

## Finding Standard

Report only issues supported by evidence. Return `no findings` with inspected evidence when the assigned angle is clean
never create findings to fill a reviewer slot or group

A useful reported item includes:

```text
Disposition: required fix | user choice | outside-angle pointer | nonblocking extra
Severity: must-fix | should-fix
Location: path:line
Problem: what is wrong
Why it matters: concrete impact
Fix: specific direction for a required fix or the decision needed for a user choice
Evidence: code/test/plan reference
```

Omit `Severity` unless the disposition is `required fix`
Omit `Fix` for an outside-angle pointer or nonblocking extra

## What Not To Do

- Do not rubber-stamp
- Do not rewrite the code during review
- Do not flag intentional approved decisions as bugs
- Do not expand scope beyond the change
- Do not invent hypothetical issues without plausible impact
- Do not investigate outside the assigned angle
- Do not turn security, sanitization, compatibility, recovery, abstraction, or cleanup into requirements unless the approved contract already requires them
