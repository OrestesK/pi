# Skill Activation Profile

Use fresh contexts to evaluate whether a skill description routes the intended requests without capturing adjacent work.

## Define cases

Include only decision-relevant cases:

- Direct trigger: names the owned capability clearly
- Synonym: requests the capability in ordinary language without naming the skill
- Near miss: resembles the trigger but belongs to another owner
- Negative control: clearly unrelated work
- Boundary case: requires an explicit handoff between owners

Record the exact catalog descriptions and available competing skills for every run.

## Observable contract

A positive activation case succeeds when:

- The candidate `SKILL.md` is read successfully
- Its workflow is applied to the owned request
- Required handoffs and exclusions are preserved

A near-miss or negative case succeeds when the candidate `SKILL.md` is not read.

Do not require one exact broader tool trajectory. Catalog presence, a matching description, or a textual mention of the skill does not prove activation.

## Conditions

Use equivalent fresh-context conditions for baseline and candidate:

- Same model and provider
- Same harness and version
- Same tools and other catalog entries
- Same user request and project state
- Same instruction boundary

Disclose unavailable controls and provider variance.

## Evidence

Capture the smallest evidence that proves the contract:

- Catalog row and winning path
- Successful or absent `SKILL.md` read
- Owned workflow behavior or incorrect capture
- Relevant diagnostics or provider failure

Retain failed, invalid, and disagreeing runs. Do not retry only one side or discard unfavorable results.

## Interpretation

Classify each case as pass, regression, improvement, invalid, or inconclusive. Report false negatives and false positives separately. A structural loader check proves discoverability only; behavioral activation requires the fresh model run and remains unverified when that protected action is unavailable.
