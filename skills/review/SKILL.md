---
name: review
description: Code, plan, and implementation review against requirements and configured project standards. Use for review requests, after non-trivial implementation, or when dispatching reviewer subagents in spec-compliance or code-quality mode.
---

# Review

Review is evidence gathering, not rubber-stamping.

## Independent review routing

`manager-workflow` decides when review occurs inside an implementation stage. Standalone reviews enter this skill directly. This skill owns review method. `delegation` dispatches the selected roles, and the Pi Subagents package executes them.

For every nontrivial plan review, nontrivial review request, and first implementation-readiness review, use at least three fresh parallel reviewers with genuinely different evidence targets. Add more only for another useful surface. The parent also inspects the target, validates findings, synthesizes `PASS`, `FAIL`, or `INCONCLUSIVE`, and owns every decision.

Every reviewer receives the approved behavior, non-goals, relevant decisions, actual target/effective change, required proof and available evidence, one assigned angle/evidence target, and a stop condition. Reviewers never edit, become writers, amend the behavioral contract, or authorize scope expansion.

After a coherent review-fix group, choose the follow-up by effective risk:

- **Tiny mechanical fix:** no behavior, contract, reachability, or proof meaning changed. The parent inspects the final diff and runs the narrowest check; no child reviewer is required
- **Contained correction:** one localized behavior, correctness, or proof defect changed without a public contract, security/data boundary, shared abstraction, cross-owner behavior, or new reachable consumer. Use one fresh targeted reviewer or validator
- **Broad or high-risk correction:** architecture or ownership, public contracts, security/data boundaries, concurrency, compatibility, shared abstractions, several consumers, or a materially changed proof strategy. Run a new review with at least three fresh reviewers and distinct targets

Use the broader tier when classification is unclear. Continue only while a new validated primary finding produces a material correction. Stop when review is clean, only incidental or rejected findings remain, evidence stalls, a blocker appears, or another approval is required.

A final `PASS` requires every accepted primary in-scope `must-fix` and `should-fix` finding to be fixed or explicitly deferred by the user. Incidental optional cleanup and background quality exploration remain nonblocking.

Only validated, mechanically local, non-material fixes inside the approved behavior may be automatic. Final claim-bound verification is still required.

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
6. Do not apply fixes from a standalone review-only request. In an approved implementation review/fix stage, the parent may automatically apply validated, mechanically local, non-material fixes inside the approved behavior, then return control to `manager-workflow`. Other fixes route through a reviewed behavioral amendment

Structural feedback is not automatically correct. Verify that the proposed simplification is concrete, behavior-preserving, and compatible with approved scope. If it changes architecture, behavior, schema, config, security, data mutation, or public contracts, ask before implementing.

Do not use filler such as “great catch,” “good point,” or “you're absolutely right.” Report technical action and evidence instead.

## Finding partitions

Review output always keeps these partitions distinct:

1. **In-scope required findings:** the actively reviewed behavior/angle; the only partition that can block readiness or drive automatic fixes
2. **Incidental material adjacent risks:** report separately only when encountered; do not proactively hunt them unless explicitly assigned as primary
3. **Incidental optional cleanup/polish:** report separately only when encountered; never let it block readiness or extend a review/fix loop

An explicit cleanup/code-quality request makes the requested cleanup or simplification surface primary. Ordinary review does not dispatch dedicated cleanup/polish hunters.

Within each populated partition, use `must-fix`, `should-fix`, `nit`, `note`, or `needs-discussion` as appropriate. Omit empty incidental partitions rather than manufacturing findings.

## How to Review

- Read the approved behavior/non-goals, relevant decisions, plan/spec, proof/evidence, and actual target/effective change before judging
- Follow the active global instructions already in context, specifically the procedure in the `Changed files and diffs` section, before reviewer dispatch. Review the resulting total effective diffs and the bodies of every in-scope untracked file
- Treat ownership/navigation, LSP semantics/relationships, AST structure/search/refactor, and diagnostics as separate relevance-gated evidence groups. Use every materially relevant group and state why an expected group is unavailable or inapplicable; do not call irrelevant groups mechanically
- Run or inspect tests whenever they materially improve review confidence and are safe/proportionate
- Cite file paths and line numbers for findings
- Categorize findings: `must-fix`, `should-fix`, `nit`, `note`, or `needs-discussion`
- Follow the active global instructions already in context, specifically the artifact permission and override policy in the `.scratch/ workspace` section. Return findings inline unless an explicit output path or wrapper capture is provided; use `.scratch/reviews/` for allowed review artifacts. Do not use shell writes to create them

## Delegated Reviewer Subagents

When dispatching a reviewer subagent, treat `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/agents/reviewer.md` as the authoritative child contract. The reviewer agent does not inherit this skill by default, so standards that must apply inside delegated reviews must exist in the reviewer agent prompt or be included explicitly in the subagent task.

For delegated review, give each selected reviewer a distinct packet: approved behavior, non-goals, relevant decisions, target/effective change, proof/evidence, assigned angle/evidence target, and stop condition.

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
