# Excalidraw Quality Gates

Use these gates for every nontrivial new diagram. Tool success, valid JSON, and complete labels are not visual readiness evidence.

## Gate 1: Diagram Contract

Before drawing, establish:

- audience;
- one-sentence takeaway;
- target placement and rendered dimensions;
- overview or technical deep-dive mode;
- source of truth for semantics;
- supplied visual references;
- required claims and explicit non-goals.

If audience, target scale, or overview/detail intent materially changes the design and cannot be inferred, ask one focused question.

## Gate 2: Reference Style Contract

When references exist, record at least six traits:

- canvas/background;
- typography;
- shape vocabulary;
- connector vocabulary;
- color/fill behavior;
- spacing/composition;
- annotation style;
- grouping/panel behavior.

A consensus trait should be supported by at least two references. User references override generic palette and layout guidance.

## Gate 3: Semantic Cut

Do not equate source completeness with one-canvas completeness.

Create a semantic-cut manifest before scene elements:

| Source claim | Treatment | Scene ID/panel | Rationale |
|---|---|---|---|
| claim | `included` | node/edge | primary story |
| claim | `abstracted` | note/group | detail not needed at first glance |
| claim | `movedToDetail` | second panel/diagram | exceeds overview budget |
| claim | `omittedWithRationale` | — | outside audience goal |

A material omission or abstraction requires approval. If the user explicitly requests an overview, recommend reduction rather than silently shrinking text.

## Gate 4: Complexity Budget

### Overview defaults

- At most 9 primary semantic nodes.
- At most 11 primary semantic edges.
- At most 3 callouts.
- At most 5 accent color families.
- One dominant route.
- At most one feedback loop on the primary canvas.
- One clear endpoint.

If the required story exceeds a limit, split it into overview + detail rather than violating the budget. A user may approve an exception after seeing the tradeoff.

### Technical deep dive

No total element cap. The static audit always emits `technical-visual-review-required`; technical mode can never earn autonomous `PASS` because JSON cannot prove panel structure or local reading order. Require:

- coherent panels/lanes;
- one local flow per panel;
- a narrow repeated visual grammar;
- local connectors and few cross-panel edges;
- readable text at target scale.

## Gate 5: Staged Construction

Do not create a complex scene in one batch.

1. Draw only title, boundaries, and primary nodes.
2. Screenshot and verify hierarchy/whitespace.
3. Add the primary semantic arrows.
4. Screenshot and trace the main flow without reading supporting text.
5. Add optional branches and callouts one bounded cluster at a time.
6. Screenshot after each cluster.
7. Stop adding elements when the one-sentence takeaway is already complete.

Background zones are conditional. Do not begin with a canvas-wide decorative background.

## Gate 6: Native Scene Audit

Resolve the absolute skill directory from the loaded `SKILL.md`; do not assume the current repository contains the skill:

```bash
python /absolute/path/to/excalidraw-skill/scripts/audit_scene.py path/to/diagram.excalidraw --mode overview
```

Use `--mode technical` for panelized deep dives and `--json` for structured output. Exit codes: `0` clean, `1` errors/block, `2` invalid input, `3` warnings/review required.

The audit checks structural risks only:

- overview node/edge budgets;
- semantic-arrow bindings and missing endpoints;
- clean-default arrow width/style;
- over-complex routes;
- long overview arrows;
- text-size risks;
- long copy inside nodes;
- reduced opacity;
- overlapping semantic nodes;
- excessive accent colors and free lines.

Warnings produce `review-required`, never `PASS`; each must be accepted or resolved with visible evidence. Errors block completion. The audit is not an aesthetic judge, and technical mode is not a bypass for an overview that exceeds its budget.

## Gate 7: Rendered-Image Validation

Export the actual intended artifact, then inspect:

1. Native target size.
2. 50% scale.
3. 35% scale.
4. Grayscale.

Example temporary derivatives:

```bash
magick diagram.png -resize 50% /tmp/diagram-half.png
magick diagram.png -resize 35% /tmp/diagram-small.png
magick diagram.png -colorspace Gray /tmp/diagram-gray.png
```

Pass conditions:

- one primary route is visible in under three seconds;
- the endpoint is unambiguous;
- essential text remains readable at target placement;
- secondary paths remain visibly secondary;
- critical distinctions survive grayscale;
- no connector crosses an unrelated node;
- no false junctions;
- no floating route labels;
- no large empty void beside a congested cluster;
- no explanation requires the legend to repair avoidable ambiguity.

## Gate 8: Blind Adversarial Review

For nontrivial diagrams, use independent reviewers with the brief, semantic cut, style contract, and final render. Do not give them the author's rationale or list of intended fixes.

Use separate angles:

- information hierarchy and reading order;
- connector topology;
- reference-style fidelity;
- target-scale and grayscale usability;
- semantic accuracy.

A focused “verify these fixes” review is insufficient for final readiness. Any blocker yields `FAIL` until corrected and broadly re-reviewed.

## Gate 9: Final Evidence

Before claiming readiness, report:

- scene-audit result;
- native, 50%, 35%, and grayscale inspections;
- semantic reviewer verdict;
- broad visual reviewer verdict;
- any approved budget or style exceptions.

Do not use these as readiness proxies:

- JSON/XML parse success;
- label-presence counts;
- raw arrow counts;
- no clipping at full zoom;
- canvas-server success;
- a reviewer prompted only to confirm prior fixes.
