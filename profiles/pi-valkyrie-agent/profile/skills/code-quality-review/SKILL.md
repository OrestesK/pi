---
name: code-quality-review
description: Deep code-quality and simplification review for explicit review requests or concrete useful background quality checks. Reviews simplicity, structure, maintainability, behavior-preserving cleanup, over-engineering, and AI slop; stays read-only unless fixes are explicitly authorized.
---

# Full Code Quality Review

Review completed work for the best behavior-preserving implementation: correct, direct, cohesive, well-owned, easy to reason about, and free of accidental complexity.

This is not a style pass and not a contest to minimize lines. “Simple” means the fewest justified concepts, branches, states, layers, and invariants—not compressed or clever code.

Use this specialized skill when the user explicitly requests a deep structural/simplification review; that request makes behavior-preserving simplification the primary in-scope target. It may also run opportunistically during ordinary nontrivial work when a concrete useful quality, structure, simplicity, or ownership question warrants a read-only background lane. Opportunistic review is nonblocking, does not require a known defect, stops when no novel useful target remains, and cannot authorize fixes or delay readiness unless the parent validates and accepts a concrete finding into the primary scope.

Use `review` alone for ordinary claim-bound code review and `pi-subagents`’ cleanup workflow for cleanup-only requests. Load and follow `review` for finding partitions and standards, `pi-subagents` for orchestration, and `manager-workflow` before any fix pass.

## Default boundary

- Review-only by default. Do not edit project/source files or perform mutating VCS/filesystem operations.
- Treat `autofix`, “fix the findings,” “apply the cleanup,” or equivalent explicit wording as a request to enter fix mode for validated, in-scope findings. It does not bypass `manager-workflow` approval, stage, or scope requirements.
- Keep the requested behavior and approved product scope fixed. Question the implementation, not the product decision.
- Ask before any change to behavior, architecture, schema, config, security policy, data, compatibility, public API, or user workflow.
- Default scope is the total effective diff plus directly affected callers, callees, tests, contracts, and docs—not the whole repository.
- Review the whole repository only when explicitly requested.
- Ignore staging hygiene, dirty-tree state, untracked scratch artifacts, and pre-existing defects unless they affect the reviewed behavior or the user asked for repository hygiene.

## Core standard

A quality finding must be more than preference. It needs:

1. a concrete location or symbol;
2. the actual reachable code path or structural relationship;
3. a specific correctness, reasoning, ownership, testability, maintenance, or operational cost;
4. a smaller safe direction;
5. evidence that the direction preserves intended behavior, or an explicit statement of what remains unverified.

“No finding” is valid. Never manufacture issues to make the review look thorough.

## Workflow

### 1. Establish scope and intent

Before judging code:

- Read project instructions, the task/plan/spec, and relevant prior decisions.
- Inventory the full effective diff:
  - tracked changes against the correct base or `HEAD`;
  - staged and unstaged changes together;
  - in-scope untracked file bodies separately.
- State the intended behavior in one sentence.
- Identify the behavior owner: entrypoint, canonical module/layer, outputs, side effects, and proof surface.
- For each changed section or newly introduced concept, state what it does, why it exists, who owns it, and what would break if it were removed. If its purpose or necessity is not justified by the approved behavior, treat it as a deletion or simplification candidate.
- List changed files and directly affected unchanged code that must be traced.
- Distinguish intended feature work from cleanup/refactor work.

If intent or review range cannot be established, ask one focused question. When the answer is unavailable, return `INCONCLUSIVE` and name the missing fact. Do not guess a base, contract, or desired behavior.

### 2. Lock behavior before proposing simplification

Build a compact behavior-preservation contract from code, tests, docs, and live evidence where safe:

- inputs and accepted shapes;
- outputs and public contracts;
- reachable errors and failure semantics when the affected path or contract defines them;
- side effects and persistence;
- ordering, retries, concurrency, and atomicity;
- observability that callers/operators rely on;
- compatibility requirements proven to exist.

Trace each changed behavior end to end through the real path: entrypoint → branches → state changes → output/side effect. Inspect unchanged seams around the diff.

Do not add or preserve defensive logic for imagined values. Verify live/runtime shapes when tools can answer. A fallback, guard, shim, or compatibility path is justified only by a reachable case, explicit contract, released consumer, or observed failure.

When a producer, feature, state transition, or persisted contract was removed, trace every dependent consumer, flag, branch, test, comment, and compatibility path. Delete machinery whose source and reachable consumers no longer exist; do not preserve dormant paths for hypothetical restoration.

When a value comes from a known internal source and its shape is enforced by an inspected type, validator, or invariant owner, trust that contract downstream. Do not duplicate validation or add fallback branches for shapes the source cannot produce. Validate once at the real boundary.

### 3. Run the mandatory simpler-design pass

Keep behavior fixed and ask, in order:

1. Can code be deleted because the problem is already solved elsewhere?
2. Can an existing canonical helper, type, module, or framework path replace new machinery?
3. Can the same goal be solved at the natural owner layer instead of through cross-layer plumbing?
4. Can branches, modes, nullable flags, wrappers, adapters, or intermediate representations disappear?
5. Can state or data flow be modeled so invalid combinations are unrepresentable?
6. Can one direct flow replace duplicated or divergent paths?
7. Does an abstraction reduce what callers must know, or merely rename/move complexity?

Prefer structural simplification that deletes concepts over cosmetic extraction. Prefer direct, boring code over magic. The best solution is not automatically the smallest diff or fewest lines.

Do not recommend:

- an abstraction solely because two or three snippets look similar;
- a design pattern from textbook purity rather than local need;
- file splitting based only on a line threshold;
- broad rewrites without a concrete behavior-preserving migration;
- moving complexity between files while preserving the same cognitive load;
- generic configurability, compatibility, or extensibility without a current consumer.

When proposing a major simplification, show the current concepts that disappear and the resulting ownership/control flow. If that cannot be stated concretely, do not report it as a finding.

### 4. Review by distinct lenses

Assess the applicability of each lens before reviewing it so broad checklists do not blur evidence. Correctness, simplicity, and structure are presumptively applicable to code changes; investigate other lenses only when the affected path reaches them. Do not output empty checklist sections.

Core lenses:

1. **Correctness and behavior preservation**
   - invariants, reachable states/failures, relevant transitions or concurrency, and unintended behavior drift;
2. **Simplicity and accidental complexity**
   - unnecessary branches, modes, wrappers, layers, fallback paths, indirection, configuration, or generalization;
3. **Structure and ownership**
   - cohesion, dependency direction, canonical layer, source of truth, boundaries, naming, data/control flow;
4. **Types and contracts**
   - casts, `any`/`unknown`, loose object bags, avoidable optionality, duplicated representations, hidden invariants;
5. **Tests and proof quality**
   - behavior assertions, reachable boundary cases relevant to the change, over-mocked paths, and fresh diagnostics;
   - tests that merely copy hardcoded values, restate constants or configuration, or verify guarantees already owned by the type system, schema, validator, or framework. A useful test must prove observable behavior, a meaningful invariant or wiring relationship, an edge case, or a failure mode;
6. **Slop and clarity**
   - narration comments, speculative defensive checks, dead helpers, pass-through wrappers, stale rationale, noisy prose, debug artifacts, compressed cleverness.

Preserve still-valid comments that explain why a non-obvious choice or value exists. Update or relocate them with the owning code. Remove only narration, stale rationale, and comments made false by the change.

Add only applicable domain lenses: security/privacy, performance/hot paths, API compatibility, data/migrations, UI/accessibility, infrastructure/operations, or developer experience. For agent/runtime/config work, prioritize actual runtime behavior, reliability, evidence quality, context/tool boundaries, recovery, and completion over peripheral analytics or wrapper-only concerns.

Use `module_report`, `read_symbol`, and `read_enclosing` for code structure and symbols, ast-grep for structural patterns, and LSP for types/references/diagnostics. Use the codebase’s local patterns as evidence, not generic best practice.

### 5. Use independent reviewers without outsourcing judgment

After the parent locks scope, intent, and the behavior-preservation contract, launch at least three fresh parallel read-only reviewers with genuinely distinct evidence targets—for example by subsystem, affected path, caller/callee set, contract/test surface, safe runtime evidence, or simplification lens. Keep dependent traces sequential, avoid duplicate coverage, and fan in before parent validation.

Every reviewer receives the approved behavior/non-goals, relevant decisions, target/effective change, proof/evidence, assigned angle/evidence target, and stop condition. Add more reviewers only for another distinct material surface. The parent's direct inspection is mandatory but does not replace the three independent reviewers.

Scale beyond the minimum by risk and shape:

- broad or cross-cutting diff: sectioned reviewers by subsystem and concern;
- high-risk or disputed findings: targeted validators or skeptics;
- large fanout: reducer/validator stage before parent synthesis.

Every reviewer must inspect the actual repository and effective diff, cite evidence, and return `no_findings` when appropriate. Reviewers do not edit. Parallel output is evidence, never the verdict.

Avoid duplicate generic prompts. Each reviewer needs a named angle, evidence target, and stop condition.

### 6. Validate every candidate finding

Before reporting a finding, the parent verifies:

- **Scope:** introduced or made relevant by the reviewed change;
- **Reality:** cited code exists and line/symbol is accurate;
- **Reachability:** the path or structural cost is real, not hypothetical;
- **Intent:** requirements/tests/comments do not establish it as deliberate;
- **Impact:** concrete consequence, not a slogan such as “violates SOLID”;
- **Local fit:** suggested direction matches existing architecture and conventions;
- **Preservation:** the fix keeps required behavior or is marked `needs-discussion`;
- **Value:** the fix removes enough risk or complexity to justify churn.

Deduplicate by root cause, not wording. Resolve reviewer disagreement by reading the code and evidence. Reject or downgrade unsupported findings; do not average confidence scores.

Do not duplicate formatter/linter output unless it reveals a semantic issue those tools cannot fix.

### 7. Synthesize a verdict

Return one parent-owned verdict:

- `PASS`: no blockers or fixes worth doing now; reviewed behavior and quality bar are supported by fresh evidence.
- `FAIL`: at least one validated must-fix/should-fix issue or concrete behavior-preserving simplification is worth doing now.
- `INCONCLUSIVE`: missing scope, intent, code, runtime shape, or verification prevents a responsible judgment.

## Finding format

Lead with high-signal findings. Omit cosmetic nits unless requested.

```text
Severity: must-fix | should-fix | needs-discussion | nit | note
Location: path:line or symbol
Problem: exact defect or accidental complexity
Impact: concrete behavior, reasoning, ownership, testability, or operational cost
Evidence: traced path, source relation, test, diagnostic, or live observation
Smallest safe direction: specific fix or restructuring
Behavior preservation: why behavior stays fixed, or what decision/proof is missing
Confidence: high | moderate | low
```

A `should-fix` structural finding requires a concrete simpler design. Use `needs-discussion` when the better design changes an approved boundary or when preservation is not proven.

## Final review output

Avoid tables in Markdown output. Use the general `review` partitions:

```text
Verdict: PASS | FAIL | INCONCLUSIVE
Behavior contract: what was held fixed
Evidence inspected: owners, paths, tests, diagnostics, or live observations

In-scope required findings:
- validated requested quality/simplification findings in severity order, or no findings

Incidental material adjacent risks:
- only material risks encountered outside the requested quality target

Incidental optional cleanup/polish:
- only optional ideas encountered outside the requested quality target; never blocking

Best in-scope simplification:
- highest-leverage behavior-preserving simplification, only when concrete

Rejected/deferred reviewer ideas:
- false positives, taste-only refactors, scope expansion, or low-value churn, with reason

Verification:
- checks run or inspected
- missing evidence and residual risk
```

When there are no findings, state which paths, contracts, callers, tests, and diagnostics were inspected. Do not return a bare “looks good.”

## Explicit fix mode

When fixes are explicitly authorized:

1. Finish review and disposition every finding before editing.
2. Separate:
   - fixes worth doing now;
   - optional improvements;
   - rejected/deferred feedback;
   - decisions requiring approval.
3. The parent applies one coherent fix group at a time. Use write children only under the configured exclusive-file policy.
4. For behavior-preserving refactors, capture focused baseline evidence first; do not invent new behavior tests for purely mechanical cleanup unless existing proof is insufficient.
5. For behavior changes or bug fixes, use `behavioral-proof` to select proportionate evidence.
6. After each meaningful fix group, run the narrowest proof that can detect drift, then relevant broader checks.
7. Inspect the new effective diff for accidental churn.
8. Run a fresh focused re-review after material fixes.
9. Continue re-review only while validated in-scope findings yield material progress. Stop when clean, incidental-only, stalled/repeated, blocked, or approval-gated; if validated findings remain unresolved, return `FAIL` with residual risks. Do not stop merely at an arbitrary round count or loop for optional polish.

Never claim “behavior preserved” from intention alone. Cite tests, traces, contracts, diagnostics, or live observations.

## Stop conditions

Ask one focused question rather than improvising when user input can resolve the blocker. Otherwise stop with `INCONCLUSIVE` and name the missing evidence when:

- the review target or base is ambiguous;
- “simplification” would alter behavior or a public contract;
- compatibility need is unknown and cannot be verified;
- a proposed cleanup crosses ownership or architecture boundaries;
- tests disagree with the stated intent;
- runtime values/shapes are needed but unavailable;
- reviewers disagree and direct evidence does not resolve it.
