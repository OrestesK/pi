---
name: verification-before-completion
description: Use before claiming work is done, fixed, passing, reviewed, or ready. Requires fresh evidence from commands, diffs, or explicit inspection and prevents trusting stale or subagent-only success claims.
---

# Verification Before Completion

Do not claim success without fresh evidence.

## Gate Function

Before saying work is done, fixed, passing, ready, clean, or complete:

- [ ] **Identify** what evidence proves the claim
- [ ] **Assess** every materially relevant completion category below
- [ ] **Run or inspect** the evidence after the latest relevant edit
- [ ] **Read** the output/result, including exit code and failures
- [ ] **Compare** evidence to the actual claim
- [ ] **Report** `PASS`, `FAIL`, or `INCONCLUSIVE` with evidence and limitations

Run all relevant read-only verification automatically. Store temporary data and scripts under `.scratch/`. For mutating verification, follow the active global instructions already in context, specifically the authorization policy.

If you cannot run a required check, say so. Do not convert inability to verify into confidence.

## Relevance-gated completion categories

Assess each category when it can materially change the readiness claim; do not perform speculative security/data hardening or irrelevant ritual to fill the list:

- **Requested observable behavior:** the approved outcome and non-goals are satisfied
- **Canonical ownership and reachable consumers:** the behavior lives at its actual owner and every materially affected caller/consumer is accounted for
- **Real boundaries and failure states:** demonstrated trust, lifecycle, concurrency, protocol, platform, or external-service boundaries behave correctly; impossible producer-owned states are not invented
- **Simplicity:** no avoidable concept, branch, mode, wrapper, fallback, compatibility path, or duplicated owner was added
- **Fresh claim-bound evidence:** proof was captured after the latest relevant edit with a method proportionate to the claim
- **Public representations:** affected API/schema/config/docs/comments/user-facing names and examples match behavior that actually exists
- **Final effective change and delegated-work disposition:** the parent inspected the final change, every readiness-relevant output, accepted/rejected findings, and remaining incidental/background work

A materially expected category may be inapplicable, but state why. Do not silently skip it.

## Claim Binding

Bind every completion claim to the exact thing being completed:

- current approved behavioral contract and requested outcome/non-goals,
- final repository root/worktree and effective implementation locations,
- current observable implementation route when it is material to the claim,
- evidence captured after the latest relevant edit or correction.

Evidence from a superseded direction, different checkout, replaced implementation path, or pre-fix run is stale. A passing test proves only the behavior it exercises; it does not justify unrelated work. Return `INCONCLUSIVE` when the claim cannot be bound to the current requested behavior and final target.

## Claim Verification

When the user asks to verify a specific claim, restate it in falsifiable form before testing it.

Use this loop:

1. State the claim with condition, expected result, metric, or threshold.
2. Pick the smallest local surface that can disprove it.
3. Capture baseline evidence when available without mutating git state. Baseline may be existing failure output, logs, screenshots, a repro before the latest edit, prior artifacts, or a user-run command.
4. Capture treatment evidence after the relevant change using the same command, data, environment, and measurement surface when practical.
5. Compare artifacts directly.
6. Return one verdict: `VERIFIED`, `NOT VERIFIED`, or `INCONCLUSIVE`.

Do not use claim verification for vague claims such as “cleaner” or “better architecture”; ask for a measurable claim or use review mode instead.

## Evidence by Claim

- **Tests pass:** fresh test command output after edits.
- **Typecheck/lint clean:** fresh command output after edits.
- **Bug fixed:** reproduction or regression test passes.
- **Feature complete:** approved behavior checklist plus relevant proof.
- **CLI/TUI behavior:** repo-native harness, tmux/PTY transcript, or screen capture showing the expected state change.
- **Subagent completed task:** parent inspected the child output, actual target/effective change, and verification.
- **Config/skill valid:** run the relevant parse, frontmatter, path, reference, and effective-discovery checks.
- **Behavioral boundary preserved:** final effective change supports the approved outcome/non-goals; new material behavior is reported rather than hidden behind implementation-location bookkeeping.
- **No behavior change:** effective change inspection and relevant proof show the observable contract is unchanged.

For interactive CLI/TUI claims, prefer the repo's own harness first. If none exists, use a bounded tmux or PTY probe: capture the screen before acting, send one action, wait for a concrete prompt or screen pattern, then capture the result. Prefer deterministic waits over sleeps.

## Subagent and review verification

Do not trust “worker/reviewer says done” by itself.

The parent inspects the actual target/effective change, relevant child outputs, and fresh claim-bound evidence. For nontrivial readiness, the review/fix stage required by `manager-workflow` must be complete. Reviewer packet and fanout details are outside this skill.

The parent validates candidate findings for scope, producer/reachability, impact, proof, and behavior preservation before disposition. `review` owns review method and finding partitions; accepted in-scope required findings must be fixed or explicitly user-deferred before `PASS`. If the parent cannot verify directly, report the exact unverified boundary and return `INCONCLUSIVE` where it affects the claim.

## Completion Report Format

Use this shape:

```text
Contract: <approved behavior/non-goals or not applicable>
Outcome: <observable result>
Implementation: <owners/areas used as evidence, not approval boundaries>
Verification: <commands/evidence and results>
Completion categories: <material categories and any inapplicable reason>
Review: <required review and follow-up status for nontrivial work, with finding dispositions>
Risks: <remaining risks or none known>
Next: <protected or user-run action if needed>
```

For quantitative summaries, add a short evidence line before finalizing counts/totals/coverage:

- denominator and scope/time window,
- latest source artifact/table/check inspected,
- whether each key number was directly verified or inferred,
- any stale draft or unverified count explicitly excluded.

For explicit claim verification, include the verdict:

```text
Verdict: VERIFIED | NOT VERIFIED | INCONCLUSIVE
Claim: <falsifiable claim>
Evidence: <baseline/treatment/comparison>
Confounds: <none or specific limitation>
```

## Red Flags

Stop before claiming success if you are about to say:

- should work
- probably fixed
- seems fine
- all good
- done
- ready
- tests should pass

Replace with evidence or uncertainty.
