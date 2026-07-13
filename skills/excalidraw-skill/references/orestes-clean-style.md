# Orestes Clean Technical Style

This is the default Excalidraw style for this Pi installation. A user-supplied reference, explicit brand guide, or explicit style request overrides it.

The profile is derived from three user-authored native scenes without copying their technical content:

- `Security Assignment.excalidraw`: restrained semantic pastels inside a wide architecture strip.
- `Queue Benchmarks.excalidraw`: monochrome exploratory flow with adjacent engineering notes.
- `Federated Learning.excalidraw`: monochrome panelized sequence and architecture views.

## Core Character

The diagram should feel manually reasoned, technically precise, and visually quiet.

- White canvas.
- Black or near-black linework.
- Roughness `1`: recognizably Excalidraw, not polished-vector sterile and not excessively wobbly.
- Transparent shapes by default.
- Sparse light pastel fills only when role distinctions materially improve comprehension.
- One obvious reading direction.
- Large outer margins and broad gutters between responsibilities.
- Detailed technical content is allowed, but the visual grammar stays narrow.

## Default Element Grammar

| Purpose | Default |
|---|---|
| Title | Free text at upper left; 30–36px |
| Body labels | 20px |
| Boundary/arrow annotations | 16–20px |
| Process/component | Rounded rectangle, transparent fill, `#1e1e1e` stroke |
| Scope/domain boundary | Large transparent rounded rectangle, light gray dashed stroke |
| Start/end | Rectangle unless an ellipse is clearer in the supplied reference |
| Decision | Ordinary labeled branch or rectangle; diamond only when it materially improves a true yes/no decision |
| Semantic arrow | Black, solid, 2px, roughness 1, bound at both ends |
| Arrow label | Short action, protocol, payload, or branch condition |
| Engineering rationale | Free-standing text or a restrained adjacent callout |

## Layout Defaults

- Prefer one horizontal left-to-right flow or one top-to-bottom sequence.
- For deep technical material, use separate panels or bounded domains instead of one global flow.
- Keep primary connectors local. Move nodes rather than introducing long perimeter routes.
- Use containment and whitespace for grouping before color.
- Keep notes outside the main route.
- Preserve at least 40px between nearby objects and substantially more between domains.
- Default output should fit a normal screen or README without zooming.

## Color

Monochrome is the baseline.

When color helps:

- Use pale fills with a matching darker stroke.
- Apply color to component roles, not individual steps or decoration.
- Keep one role consistent across the scene.
- Do not use color as the only carrier of a critical distinction.
- Avoid more than five accent families in an overview.

The generic palette in `cheatsheet.md` is a fallback library, not a mandate to use every color.

## Arrows

- Prefer direct two-point arrows.
- Slight curves are acceptable when established by a reference or needed to separate parallel edges.
- Avoid extreme curves, decorative loops, elbow mazes, and canvas-spanning return paths.
- Every semantic relationship is one arrow bound to both endpoints.
- A free arrow must be explicitly marked as an annotation with `customData.auditRole = "annotation"`.
- Never solve a crossing by splitting one relationship into disconnected line and arrow elements.

## Text and Notes

- Put short noun labels inside components.
- Put verbs, protocols, payloads, and conditions on arrows.
- Put long rationale, edge cases, and caveats beside the relevant area.
- Do not compress implementation inventories into tiny node text.
- Avoid unexplained metaphor, acronyms, or a legend when direct labels can make the scene self-explanatory.

## Explicit Anti-Defaults

Do not add these unless the user or supplied references establish them:

- colored canvas backgrounds;
- decorative ribbons or currents;
- halos around normal stages;
- giant perimeter loops;
- metaphors such as river/delta/eddy/harbor;
- legends for an avoidably complex visual language;
- many node shapes with unexplained meanings;
- low-opacity semantic routes;
- color-heavy categorical coding;
- full-scene background rectangles;
- automatic/policy infrastructure promoted to equal-weight flow nodes.

## Complexity Modes

### Overview

Use the strict semantic budget from `quality-gates.md`. The output teaches one story at a glance. Secondary mechanics move to notes, a detail panel, or a second diagram.

### Technical Deep Dive

More elements are allowed when:

- content is divided into coherent panels, lanes, or scope boundaries;
- each panel has one local reading order;
- the same minimal element grammar is used throughout;
- cross-panel arrows are few and explicit;
- target-scale text remains readable.

Large element count is not itself a failure. Unstructured visual vocabulary is.

## Reference Matching

When the user supplies examples:

1. Inspect both raster previews and native `.excalidraw` files when available.
2. Record canvas, font sizes/families, shapes, fills, strokes, arrow geometry, spacing, boundaries, annotations, and complexity structure.
3. A trait is stable only when supported by at least two references or explicitly requested.
4. Reference-established traits override this profile.
5. Never copy proprietary wording or architecture from a reference into an unrelated diagram.
