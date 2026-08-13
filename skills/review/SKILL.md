---
name: review
description: Use for reviewing code, plans, and implementations against requirements and project standards
---

# Review

Review is evidence gathering, not rubber-stamping.

## Independent review routing

For every nontrivial plan review, nontrivial review request, and first implementation-readiness review, require current independent coverage of all five base angles below. Build a coverage map before fanout.

An explicit code-quality review uses the five code-quality reviewers below instead of the five base angles.

Count an angle as covered only when:

- a fresh independent reviewer was explicitly assigned that exact angle, with its complete description and a distinct evidence target
- the result addresses the current approved behavior and the exact item or effective change relevant to that angle
- its conclusion and evidence remain usable
- no later correction changed that angle’s approved contract, evidence target, relevant item or effective change, conclusion, or proof

Treat uncertain, implicit, parent-only, combined-angle, stale, inaccessible, or superseded evidence as uncovered. Launch one fresh independent reviewer for each uncovered base angle, assigned to exactly that one angle. One reviewer cannot satisfy two uncovered base angles. Do not relaunch an angle with valid current coverage only because the overall diff changed outside the evidence it covers. When no angle has valid coverage, launch five base reviewers. Record each angle’s status, evidence boundary, and review artifact before synthesizing `PASS`, `FAIL`, or `INCONCLUSIVE`.

The parent also inspects the target, validates findings, synthesizes the result, and owns every decision.

Every selected reviewer receives the approved behavior, non-goals, relevant decisions, actual target/effective change, required proof and available evidence, a distinct evidence target, and a stop condition. Each base reviewer additionally receives exactly one complete assigned base angle description, its defect target, and review questions. Each specialist receives exactly one additional-surface assignment. Reviewers never edit, become writers, vote, amend the behavioral contract, authorize scope expansion, or invent findings to fill a lane.

### Five base angles

1. **Contract, user impact, and approved scope**
   - Defect target: work that is plausible or correct in isolation but solves the wrong problem or expands scope
   - Evidence: approved requirements, non-goals, user/caller behavior, public contracts, and reached compatibility effects
   - Questions: Does the result match the approved intent? Is behavior missing or extra? Are reached user, caller, API, or compatibility consequences intentional?
   - Stop: conclude when the approved contract and every reached public consequence are accounted for

2. **Reachable correctness, producers, and boundaries**
   - **Correctness:** inspect logic, states, regressions, real failure paths, concurrency, and consumer effects
   - **Defensive-boundary discipline:** trace each value to its real producer. Ask to remove checks, fallbacks, conversions, cleanup, or error handling for states that producer cannot create. Keep required handling at genuine user-input, external-service, trust, lifecycle, protocol, persistence, configuration, platform, or other demonstrated boundaries. When the producer or ownership is unclear, investigate before deciding
   - Defect target: behavior that breaks under real reachable conditions, hides an established invariant violation, or keeps defensive code for impossible producer-owned states
   - Evidence: real producers, call paths, types, runtime states, failure evidence, and demonstrated boundaries
   - Questions: What can the producer actually create? Does ordinary behavior remain correct? Which defensive handling should be kept, removed, or marked as needing more information? Is required boundary handling missing, duplicated, or placed downstream of its owner?
   - Stop: conclude when ordinary correctness and defensive-boundary discipline have each been assessed explicitly and every relevant defensive guard is classified as keep, remove, or needs more information

3. **Architecture, ownership, integration, and consumers**
   - Defect target: locally correct work placed at the wrong owner or not reached by the real system
   - Evidence: canonical sources of truth, effective runtime/discovery/activation paths, callers, consumers, dependencies, and integration seams
   - Questions: Does the effective resource win at runtime? Is this the canonical owner? Are all real consumers and demonstrated compatibility or migration needs covered?
   - Stop: conclude when ownership, reachability, integration, and consumers are established from current evidence

4. **Simplicity, maintainability, and local fit**
   - **Simplicity and cleanliness:** inspect unnecessary concepts, abstraction, duplication, indirection, wrappers, branches, weak type boundaries, AI slop, and future-change cost
   - Defect target: correct work that creates avoidable structural cost or conflicts with repository patterns
   - Evidence: the named structural surface, current code patterns, ownership boundaries, and effective diff
   - Questions: Is this the smallest coherent design? Can a concept, branch, layer, or duplicate owner be deleted without losing behavior? Does it fit local style and architecture?
   - Stop: conclude at concrete behavior-preserving findings; do not manufacture style comments

5. **Claim-bound proof and validation**
   - **Test and evidence quality:** inspect whether tests, live/integration/manual evidence, static checks, and artifacts prove the changed claim
   - Defect target: implementation accepted on stale, partial, non-rerunnable, wrong-boundary, or implementation-only evidence
   - Evidence: proof contract, exact commands/flows, outputs, unavailable boundaries, and current claim identity
   - Questions: Could this evidence disprove a wrong implementation? Does it reach the claimed boundary? Are operational, rollback, or readiness checks needed on this path?
   - Stop: conclude when every material claim has sufficient current evidence or an explicit unavailable boundary

### Explicit code-quality review

When the user asks for a deep code-quality, structure, or simplification review, launch five fresh instances of the same generic reviewer in parallel. Give all five the same approved behavior, target, and available proof. Give each reviewer one complete focus below.

Hold the approved behavior fixed. Read beyond the diff when ownership, duplication, or integration cannot be judged from changed lines alone. A finding needs a real location or relationship, a concrete cost, a smaller safe direction, and evidence that the direction preserves behavior or a clear statement of what remains unverified.

Do not report cosmetic or formatter-only comments, speculative rewrites, generic patterns with no current need, or changes with no concrete benefit. **No findings** is valid.

The parent sends these five focuses unchanged, one per reviewer:

1. **Can we remove anything?** Is code unnecessary, duplicated, or already provided elsewhere?
2. **Is the code in the right place?** Does the natural module own it, or is the behavior spread across layers, paths, or sources of truth?
3. **Is this harder than needed?** Are flags, wrappers, branches, casts, guards, types, states, or abstractions hiding a simpler model?
4. **Does it fit the codebase?** Is it easy to understand, test, debug, and change safely?
5. **What did the others miss?** Review the whole target independently for the most important remaining behavior-preserving simplification.

Each focus is a starting point, not a fence. A reviewer may report a stronger in-scope code-quality problem found outside its focus. Reviewers never need to produce a finding. After they return, deduplicate findings by root cause, not wording, and apply the normal validation, follow-up, synthesis, and verdict rules in this skill.

The same five-reviewer pass is optional during a normal review or ordinary work. Use it when the change raises a concrete question about unnecessary code, duplication, ownership, complexity, or fit with the codebase. Do not run it just because code changed. Send the five focuses above unchanged.

This optional pass is read-only and nonblocking. It cannot authorize fixes or delay readiness. Stop when no useful target remains.

### Conditional specialists

Add a fresh specialist only for a demonstrated additional surface, such as:

- security, privacy, or supply chain
- runtime operations, deployment, rollback, performance, capacity, or observability
- data/schema migration or persisted compatibility
- concurrency or distributed protocols
- accessibility or internationalization
- domain or regulatory correctness
- platform lifecycle or API behavior
- ML/data quality, evaluation, or fairness

Specialists are not standing sixth or seventh reviewers and remain outside base-angle coverage reuse.

Before fanout, confirm that every selected reviewer can independently access the exact target. Supply the complete target inline, an identified readable repository or scratch path with its validity boundary, fixed Git refs and the effective diff, or an existing artifact with retrieval instructions. A reference only to visible or latest parent-session content is not a target. If the exact target cannot be supplied, return `INCONCLUSIVE` before fanout. Do not create a manifest or receipt only for this preflight.

After a coherent review-fix group, choose the follow-up by effective risk:

- **Tiny mechanical fix:** no behavior, contract, reachability, or proof meaning changed. The parent inspects the final diff and runs the narrowest check; no child reviewer is required
- **Contained correction:** one localized behavior, correctness, or proof defect is corrected without changing a public contract, security/data boundary, shared abstraction, cross-owner behavior, or new reachable consumer. Use one fresh targeted reviewer or validator
- **Broad or high-risk correction:** architecture or ownership, public contracts, security/data boundaries, concurrency, compatibility, shared abstractions, several consumers, or a materially changed proof strategy. Reassess which base-angle coverage the correction invalidated, launch one fresh reviewer for each now-uncovered base angle, and add any fresh change-triggered specialists

Use the broader tier when classification is unclear. Continue only while a new validated primary finding produces a material correction. Stop when review is clean, only incidental or rejected findings remain, evidence stalls, a blocker appears, or another approval is required.

A final `PASS` requires every accepted primary in-scope `must-fix` and `should-fix` finding to be fixed or explicitly deferred by the user. Incidental optional cleanup and background quality exploration remain nonblocking.

Only validated, mechanically local, non-material fixes inside the approved behavior may continue automatically. Automatic continuation does not select the writer; use the active global ownership rules. Final claim-bound verification is still required.

## Review Modes

Choose the mode explicitly.

### 1. Spec Compliance Review

Check whether the implementation matches the approved task/plan exactly.

Flag:

- missing requirements,
- extra behavior beyond scope,
- logic at the wrong canonical owner or the wrong public API shape,
- tests that do not prove the specified behavior,
- deviations from explicit constraints

Implementation in another necessary file is not itself a scope defect when it remains inside the approved behavior.

In this mode, extra cleverness is a defect.

### 2. Code Quality Review

Check whether the implementation is safe, simple, tested, and maintainable.

Review:

- Correctness and reachable states
- Meaningful behavioral proof
- Security, auth, privacy, data, secret, or injection behavior only when the affected path reaches that boundary
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

Do not relitigate approved product scope unless the implementation creates risk.

Do not treat git-index or working-tree hygiene as normal code-review findings. Ignore staged/unstaged mismatches, untracked files, dirty working trees, and tracking status unless the user explicitly asks for commit/release/staging hygiene or the issue is a real secret/destructive artifact risk. Repo-local `progress.md` files are scratch/memory files; do not ask to remove them or add `.gitignore` rules just because they are untracked.

### 3. Plan Review

Check feasibility before implementation:

- previous behavior, proposed delta, recommendation, and outcome are explicit
- all material phases, changed and unchanged behavior, assumptions, uncertainties, risks, alternatives, tradeoffs, reversibility, evidence, and focus points are present
- tasks are ordered and small
- likely owners and commands are specific enough without turning them into the user approval boundary
- the selected behavioral-proof strategy matches each material claim
- protected-action triggers, exclusions, and stop conditions are identified
- no mutating Git instructions are included

Review the visible draft asynchronously. The parent integrates supported findings and re-presents the complete revised plan before asking implementation approval.

### 4. Review Feedback Evaluation

Treat review feedback as evidence to evaluate, not an order to obey blindly.

For each item:

1. Read the full feedback before reacting
2. Verify it against code, tests, plan, and constraints
3. Classify it:
   - `must-fix`: correctness, requirement mismatch, broken proof, or a demonstrated reachable boundary failure that blocks the approved outcome
   - `should-fix`: maintainability, likely bug, insufficient test coverage, avoidable complexity
   - `nit`: naming, wording, minor formatting, small cleanup
   - `note`: useful observation that does not require action, including feedback that is invalid because it conflicts with requirements, violates YAGNI, or lacks necessary context
   - `needs-discussion`: unclear feedback or feedback that would change behavior, architecture, tests, security, or scope
4. Push back with evidence when feedback is wrong or conflicts with approved scope
5. Ask one focused question when feedback changes behavior, architecture, tests, security, or scope

Structural feedback is not automatically correct. Verify that the proposed simplification is concrete, behavior-preserving, and compatible with approved scope. If it changes architecture, behavior, schema, config, security, data mutation, or public contracts, ask before implementing.

Do not use filler such as “great catch,” “good point,” or “you're absolutely right.” Report technical action and evidence instead.

## Finding partitions

Review output always keeps these partitions distinct:

1. **In-scope required findings:** the actively reviewed behavior/angle; the only partition that can block readiness or drive automatic fixes
2. **Incidental material adjacent risks:** report separately only when encountered; do not proactively hunt them unless explicitly assigned as primary
3. **Incidental optional cleanup/polish:** report separately only when encountered; never let it block readiness or extend a review/fix loop

An explicit cleanup/code-quality request makes the requested cleanup or simplification surface primary. Ordinary review does not dispatch dedicated cleanup/polish hunters.

Within each populated partition, use `must-fix`, `should-fix`, `nit`, `note`, or `needs-discussion` as appropriate. Omit empty incidental partitions rather than manufacturing findings.

## Fix explicit Git targets before review

When the user explicitly names a branch, tag, commit, or range:

1. Resolve each named ref once to an immutable commit ID with read-only Git commands
2. Resolve the merge base when that matches the requested comparison semantics
3. Record the fixed base and head IDs plus the included commit list
4. Give every reviewer the same fixed target and effective diff
5. Stop when a ref does not resolve or the comparison is unexpectedly empty

Do not fetch or mutate Git to resolve a target. Ordinary working-tree review is unchanged. `github` owns remote pull-request identity and metadata; `semantic-git` owns structural Git analysis.

## How to Review

- Read the approved behavior/non-goals, relevant decisions, plan/spec, proof/evidence, and actual target/effective change before judging
- Follow the active global instructions already in context, specifically the procedure in the `Changed files and diffs` section, before reviewer dispatch. Review the resulting total effective diffs and the bodies of every in-scope untracked file
- Treat ownership/navigation, LSP semantics/relationships, AST structure/search/refactor, and diagnostics as separate relevance-gated evidence groups. Use every materially relevant group and state why an expected group is unavailable or inapplicable; do not call irrelevant groups mechanically
- Inspect available test evidence when it materially improves review confidence; follow the global command-execution policy for any new evidence collection
- Cite file paths and line numbers for findings
- Categorize findings: `must-fix`, `should-fix`, `nit`, `note`, or `needs-discussion`
- Follow the active global instructions already in context, specifically the artifact permission and override policy in the `.scratch/ workspace` section. Return findings inline unless an explicit output path or wrapper capture is provided; use `.scratch/reviews/` for allowed review artifacts. Do not use shell writes to create them

## Delegated Reviewer Subagents

The reviewer agent does not inherit this skill by default, so standards that must apply inside delegated reviews must exist in the reviewer agent prompt or be included explicitly in the subagent task.

For delegated reviews, send the reviewer packet required above. Keep each reviewer’s assigned angle or specialist surface and evidence target distinct.

The parent session owns synthesis and decisions. It validates every candidate finding against scope, producer/reachability, concrete impact, proof, local fit, and behavior preservation. Reviewer findings are evidence, not orders. Do not let a reviewer expand scope, approve architecture changes, or trigger implementation. Feedback requiring a material behavior, architecture, schema, config, security, data, or public-contract decision returns to the user.

## Finding Standard

Report only issues supported by evidence. Return `no findings` with inspected evidence when the assigned angle is clean; never create findings to fill a reviewer slot or partition.

A useful finding includes:

```text
Severity: must-fix | should-fix | nit | note | needs-discussion
Location: path:line
Problem: what is wrong
Why it matters: concrete impact
Fix: specific direction, or the decision needed before a fix is safe
Evidence: code/test/plan reference
```

## What Not To Do

- Do not rubber-stamp
- Do not rewrite the code during review
- Do not flag intentional approved decisions as bugs
- Do not expand scope beyond the change
- Do not invent hypothetical issues without plausible impact
