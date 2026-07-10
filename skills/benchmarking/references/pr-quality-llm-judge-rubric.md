# PR-quality LLM judge rubric

Use this rubric when benchmark scoring is primarily model- or human-judgment-based. The judge evaluates whether a candidate output would be accepted as a high-quality pull request for the task, using the original merged PR/source commit as a private gold reference when available.

This rubric is task-independent. Task-specific details belong in a task-specific rubric supplement.

## Primary verdict semantics

The primary benchmark result is the adjudicated judgment verdict from rubric-based review.

Recommended single-candidate verdicts:

- `excellent`: clearly solves the task, fits the codebase, needs no material maintainer changes.
- `acceptable`: solves the task well enough to merge after at most minor cleanup.
- `weak`: partially addresses the task but has material correctness, integration, quality, or verification gaps.
- `reject`: does not solve the task, is unsafe, is too incomplete, or would not be accepted by a maintainer.

Recommended PR-readiness labels:

- `merge`
- `minor_changes`
- `major_changes`
- `reject`

Judges should emit confidence: `high`, `medium`, or `low`.

## Required evidence posture

Every major claim needs evidence from at least one of:

- candidate implementation diff/output;
- candidate final answer;
- frozen task statement;
- private task-specific rubric supplement;
- private original PR/source reference;
- relevant process or transcript summary;
- process or verification summaries when available.

Do not claim correctness from model identity, self-reported success, style alone, or exact implementation-shape similarity.

## Gold reference use

When the benchmark is PR-derived, judges should receive the original merged PR/source commit or an equivalent private gold reference. Use it to understand:

- the real intent and behavior that was accepted upstream;
- important integration surfaces;
- edge cases the original implementation handled;
- tests, docs, migrations, or compatibility changes expected by the original change;
- acceptable implementation variation versus missing behavior.

The gold reference is not a byte-for-byte patch target. A candidate can be acceptable with a different implementation if it satisfies the same intent cleanly and safely.

## Public-contract and equivalence discipline

A smart review model should compare the original PR and the candidate output to decide whether the candidate solved the same maintainer problem. It must not reject merely because the candidate used different helper names, module boundaries, decomposition, or control flow.

For every rejection-critical finding, classify the expectation source:

- `public_task_stated`: explicitly stated in the public task packet.
- `task_specific_outcome_rubric`: required by the judge-private task rubric as an outcome, behavior, integration result, or scope boundary.
- `repo_discoverable`: required by existing candidate-visible code, imports, or stable local contracts.
- `gold_reference_intent`: required by the original PR/source intent, without requiring exact implementation shape.
- `not_applicable`: process, risk, or informational finding that is not a task expectation.

Findings that require a specific file name, helper name, method name, call order, module boundary, or internal decomposition are shape-biased unless that shape is explicitly required by public task text or repo-discoverable behavior. Shape-biased findings must not count against the verdict.

Gold/reference material must not be exposed to candidate agents before candidate output is frozen. Normal public reports should summarize judge conclusions without publishing raw gold diffs unless explicitly approved.

## Verification summaries

Candidate-reported checks, logs, and process summaries are confidence evidence only. For PR-derived LLM-judge scoring, reviewers judge the candidate against the broad rubric, task-specific outcome rubric, original PR/source intent, and candidate artifacts.

## Dimensions

### Goal fulfillment and semantic correctness

Question: Does the candidate satisfy the actual task goal and the original PR intent?

Look for:

- correct behavior on the core user path;
- preservation of existing behavior;
- correct handling of data/API/schema contracts;
- alignment with the gold/reference implementation intent;
- no benchmark-gaming or superficial patching.

### Completeness and edge cases

Question: Does it handle the important cases a maintainer would expect?

Look for:

- edge cases present in the original PR or task-specific supplement;
- failure paths and error handling;
- integration across every affected surface;
- migrations, config, docs, tests, or generated artifacts required by the change;
- no missing adjacent layer when the task requires producer/consumer coordination.

### Code quality, simplicity, and maintainability

Question: Is the implementation clean, local, understandable, and durable?

Look for:

- simple direct control flow;
- idiomatic local patterns;
- clear naming and cohesive ownership;
- no unnecessary abstractions, compatibility shims, fallback paths, registries, or broad rewrites;
- readable types/interfaces;
- comments updated when behavior changed;
- complexity justified by concrete requirements.

### Integration fit and architecture

Question: Does it belong in the right layer and preserve dependency boundaries?

Look for:

- changes in the canonical owner surface;
- no leaky abstractions or duplicated sources of truth;
- compatibility with existing runtime/deployment/test flows;
- correct handling of provider/gateway/client/server boundaries;
- no accidental exposure of internals or secrets.

### Tests and verification quality

Question: Did the candidate provide evidence a maintainer should trust?

Look for:

- relevant tests for new behavior or bug fixes;
- regression coverage for old behavior;
- meaningful manual/live/smoke verification when tests cannot cover the change;
- honest reporting of failed/skipped/unavailable checks;
- no fabricated verification;
- no disabling or weakening tests to pass.

### Scope control

Question: Did the candidate solve the requested task without unnecessary churn?

Look for:

- minimal changed surface consistent with a complete fix;
- no unrelated formatting, rewrites, generated residue, or broad refactors;
- no edits to benchmark, task, or rubric files unless explicitly allowed;
- no private/gold material contamination in candidate-facing artifacts.

### Safety, security, and privacy

Question: Could this cause harm or leak sensitive data?

Look for:

- no secrets, credentials, tokens, private paths, or gold references leaked publicly;
- no destructive or production-affecting operations unless explicitly in scope;
- safe error handling and validation for untrusted inputs;
- no unsafe permissions, cloud mutations, or external side effects;
- privacy-safe artifact/report handling.

### Documentation and user-facing behavior

Question: Are docs, examples, comments, and user-visible behavior aligned with the change?

Look for:

- docs updated when behavior/API/config changes;
- comments updated instead of becoming stale;
- examples match runtime behavior;
- no over-documentation of private migration history;
- clear upgrade/compatibility notes when relevant.

### PR readiness

Question: Would a maintainer merge this PR?

Weigh all dimensions into a maintainer-style decision:

- `merge`: correct, complete, clean, verified, low risk.
- `minor_changes`: fundamentally good; small cleanup or evidence gaps remain.
- `major_changes`: promising but material correctness/quality/integration gaps remain.
- `reject`: wrong direction, unsafe, too incomplete, or unmaintainable.

## Vetoes

Mark `reject` or require `major_changes` for:

- fabricated validation or unsupported success claims;
- secrets/private data/gold reference leakage;
- destructive or unsafe side effects;
- disabling tests/assertions or weakening behavior to appear correct;
- unrelated rewrites that obscure risk;
- ignoring explicit task constraints;
- candidate inspection or use of private benchmark, rubric, or gold artifacts before output freeze;
- changes that only game the benchmark instead of solving the task.

## Panel and adjudication guidance

For high-rigor runs, use at least three independent judges or review lanes, then adjudicate.

Leaf judges:

- review independently;
- cite evidence;
- state missing evidence;
- avoid reducer/adjudicator work;
- stay within assigned lane if a lane is specified.

Adjudicator:

- clusters duplicate findings;
- discounts unsupported claims;
- preserves supported minority high-severity findings;
- resolves verdict disagreement;
- reports agreement metrics, confidence, and missing evidence.

## Optional anchored 0-10 secondary score

The primary output remains qualitative verdict plus readiness and evidence. A benchmark may also request a 0-10 score only when the prompt/schema includes anchors:

- `0`: no usable answer/artifact or impossible to judge.
- `1-2`: reject; wrong surface, broken public contract, unusable, or mostly missing.
- `3-4`: weak; meaningful partial work but major behavior/integration gaps remain.
- `5`: substantial partial that can guide repair, still major changes.
- `6-7`: acceptable; solves the task with minor or moderate maintainer changes.
- `8`: mergeable with minor cleanup or evidence gaps.
- `9`: excellent; clean, well-integrated, well-tested.
- `10`: exceptional; gold-intent-equivalent or better with superior clarity and evidence.

Report median/range and reducer rationale for numeric scores. Do not average unlabeled numeric scores. The primary output is qualitative verdict plus evidence.
