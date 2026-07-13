---
name: excalidraw-skill
description: Excalidraw design and live-canvas toolkit for reference-matched, clean technical diagrams. Use to plan/reduce diagram content, infer style from supplied PNG/.excalidraw references, draw or refine scenes, validate target-scale/grayscale readability and topology, export native/PNG/SVG artifacts, convert Mermaid, or perform element CRUD and layout. The default local profile is a white canvas, transparent rounded boxes, sparse semantic color, 20px labels, and direct bound 2px arrows. Primary interface is `npx -y mcp-excalidraw-server`; MCP and REST alternatives are supported.
---

# Excalidraw Skill

## Mandatory Design Controls

This skill is not only a canvas API manual. For every nontrivial new diagram, follow the design and validation gates before treating tool success as completion.

1. Read [`references/orestes-clean-style.md`](references/orestes-clean-style.md). It is the default style for this Pi installation.
2. Read [`references/quality-gates.md`](references/quality-gates.md).
3. If the user supplies visual references or native `.excalidraw` files, inspect them before layout. Reference-established traits override every generic default.
4. Establish audience, one-sentence takeaway, target render size, overview/detail mode, required claims, and non-goals.
5. Create a semantic cut. Do not force every source fact into one canvas. Material abstraction or omission requires approval.
6. Use the overview budget by default: at most 9 primary nodes, 11 primary edges, 3 callouts, 5 accent families, one feedback loop, and one obvious endpoint. Split into panels or another diagram when exceeded.
7. Construct and screenshot in stages: skeleton → primary arrows → optional clusters. Do not generate a complex full scene in one batch.
8. Run the native scene audit and inspect the final export at native, 50%, 35%, and grayscale sizes.
9. For nontrivial work, run a broad blind adversarial review. A reviewer prompted only to confirm previous fixes is not a final gate.

**Readiness rule:** valid JSON, complete labels, arrow counts, no clipping at full zoom, and successful canvas commands are necessary but not sufficient.

## Step 0: Pick an Interface

Three interfaces drive the same live canvas. Pick the first one that applies:

1. **MCP tools** — if `excalidraw/*` tools (e.g. `batch_create_elements`) are in your tool list, prefer them: results land directly in your context, and screenshots come back as images without touching disk.
2. **CLI** (default when no MCP tools are present):
   ```bash
   npx -y mcp-excalidraw-server <command>
   ```
   No setup needed — any canvas-touching command **auto-starts the canvas server** on `http://127.0.0.1:3000` (first `npx` run downloads the package). If the CLI is installed globally (`npm i -g mcp-excalidraw-server`), the shorter alias `excalidraw-canvas <command>` works too.
3. **REST API** (last resort, e.g. from application code): HTTP endpoints on `http://127.0.0.1:3000` — see `references/cheatsheet.md` for payloads. The server must already be running.

The canvas URL comes from `EXPRESS_SERVER_URL` (default `http://127.0.0.1:3000`). Remind the user to open that URL in a browser — screenshots, image export, mermaid conversion, and viewport control need an open tab (CLI exits with code 4 when it's missing).

### CLI Quick Reference

Results are JSON on stdout — except `describe` (plain text) and raw-content output when `--out` is omitted (`export` scene JSON, `screenshot --format svg`). Diagnostics on stderr. Exit codes: 0 ok, 1 error, 2 usage, 3 canvas unreachable, 4 browser tab required.

| Task | Command |
|------|---------|
| Start / stop / inspect server | `start`, `stop`, `status` |
| Create elements (batch) | `add elements.json` or `echo '[...]' \| add` or `add --one '{...}'` |
| Multi-op patch in one call | `apply patch.json` — `{"create":[...],"update":[{"id":"a","set":{...}}],"delete":[...]}` |
| Read one / query many | `get <id>`, `query [--type t] [--bbox x0,y0,x1,y1] [--filter k=v] [--filter-json '{...}']` |
| Update / delete | `update <id> --set '{...}'`, `delete <id> [...]` |
| Understand the scene | `describe` (plain-text summary: ids, positions, labels, connections) |
| See the scene | `screenshot [--out f.png]` (PNG without `--out` → temp file path in JSON; SVG without `--out` → raw SVG) |
| Layout operations | `arrange align\|distribute\|group\|ungroup\|lock\|unlock\|duplicate --ids a,b,c [--to left\|horizontal\|...]` |
| Scene files | `export [--out scene.excalidraw]`, `import [scene.excalidraw|-] [--replace]` |
| Mermaid → canvas | `mermaid [diagram.mmd|-]` (or stdin) |
| Snapshots | `snapshot save\|list\|restore <name>` |
| Share link | `share` (encrypted upload → excalidraw.com URL) |
| Wipe canvas | `clear --yes` |
| Install / upgrade this skill | `install-skill --dir <skills-root>` (agent chooses project/global root) |

### Element Format (CLI and MCP)

The CLI and MCP tools accept the same agent-friendly format and normalize it automatically:

- **Labels**: put `"text": "My Label"` on any shape — converted to Excalidraw's bound-label format for you.
- **Arrow binding**: `"startElementId": "a"` / `"endElementId": "b"` — arrows auto-route to element edges.
- **fontFamily**: pass a string name (`"helvetica"`, `"cascadia"`, `"excalifont"`, ...) or string number `"1"`–`"8"`.
- **points**: both `[[x,y], ...]` tuples and `[{"x":..,"y":..}]` objects are accepted.
- **Patch updates**: in `apply`, update entries can use either direct fields (`{"id":"a","x":120}`) or a `set` object (`{"id":"a","set":{"x":120}}`). Do not mix both forms in one update entry.

**Raw REST is stricter**: labels must be `"label": {"text": "..."}`, bindings must be `"start": {"id": "..."}` / `"end": {"id": "..."}`. Only worry about this when POSTing to the API directly.

---

## Coordinate System

The canvas uses a 2D coordinate grid: **(0, 0) is the origin**, **x increases rightward**, **y increases downward**. Plan your layout before writing any JSON.

**General spacing guidelines:**
- Vertical spacing between tiers: 80–120px (enough that arrows don't crowd labels)
- Horizontal spacing between siblings: 40–60px minimum; give labeled arrows 120px+
- Shape width: `max(160, labelCharCount * 12)` to keep the label on one line
- Shape height: 60px single-line, 80px two-line labels
- Background/zone padding: 50px on all sides around contained elements

**Default local style:**
- White canvas; roughness `1`; black or near-black linework.
- Transparent rounded rectangles by default. Use pale semantic fills sparingly and only when they improve role recognition.
- Body labels are normally 20px; titles 30–36px; small boundary/arrow annotations never below 16px.
- Semantic arrows are black, solid, 2px, short/direct, and bound to both endpoints.
- Dashed light-gray rectangles represent real scope boundaries only. Do not start with decorative background zones.
- The palette in the cheatsheet is a fallback library, not a requirement to create color categories.

---

## Layout Anti-Patterns (Critical for Complex Diagrams)

These are the most common mistakes that produce unreadable diagrams. Avoid all of them.

### 1. Do NOT use `label.text` (or `text`) on large background zone rectangles

When you put a label on a background rectangle, Excalidraw creates a bound text element centered in the middle of that shape — right where your service boxes will be placed. The text overlaps everything inside the zone and cannot be repositioned.

**Wrong:**
```json
{"id": "vpc-zone", "type": "rectangle", "x": 50, "y": 50, "width": 800, "height": 400, "text": "VPC (10.0.0.0/16)"}
```

**Right — use a free-standing text element anchored at the top of the zone:**
```json
{"id": "vpc-zone", "type": "rectangle", "x": 50, "y": 50, "width": 800, "height": 400, "backgroundColor": "transparent", "strokeColor": "#adb5bd", "strokeStyle": "dashed"},
{"id": "vpc-label", "type": "text", "x": 70, "y": 60, "width": 300, "height": 30, "text": "VPC (10.0.0.0/16)", "fontSize": 18}
```

The free-standing text element sits at the top corner of the zone and doesn't interfere with elements placed inside.

### 2. Avoid cross-zone arrows in complex diagrams

An arrow from an element in one layout zone to an element in a distant zone will draw a long diagonal line crossing through everything in between. In a multi-zone infra diagram this produces an unreadable tangle of spaghetti.

**Design rule:** Keep arrows within the same zone or tier. To show cross-zone relationships, make zone edges adjacent, use one explicit cross-panel edge, or split the content into separate views.

Do not use a canvas-spanning perimeter arrow as the default escape hatch. A long return path, multi-bend route, or global loop is evidence that responsibilities should move, duplicate concepts should collapse, or the diagram should split.

### 3. Use arrow labels sparingly

Arrow labels are placed at the midpoint of the arrow. On short arrows, they overlap the shapes at both ends. On crowded diagrams, they collide with nearby elements.

- Only add an arrow label when the relationship name is genuinely essential (e.g., protocol, port number, data direction).
- If you're adding a label to every arrow, reconsider — it usually adds visual noise, not clarity.
- Keep arrow labels to ≤ 12 characters. Prefer omitting them entirely on dense diagrams.

---

## Quality: Why It Matters (and How to Check)

Excalidraw diagrams are visual communication. If text is cut off, elements overlap, or arrows cross through unrelated shapes, the diagram becomes confusing and unprofessional — it defeats the whole purpose of drawing it. So after every batch of elements, verify before adding more.

### Quality Checklist

After each staged `add` / `apply` / `batch_create_elements`, take a screenshot and check:

1. **Primary story** — Can the intended route and endpoint be identified in under three seconds without reading supporting notes?
2. **Hierarchy** — Is one route dominant and every optional/automatic/rare route visibly subordinate?
3. **Text truncation** — Is all label text fully visible? Increase the shape or reduce copy; never solve this by shrinking below the style floor.
4. **Overlap** — Do any semantic shapes share space? Do boundaries contain children with real padding?
5. **Arrow topology** — Do arrows cut through unrelated elements, cross without bridge/junction meaning, or point into empty space? Prefer moving nodes or splitting the view over complex routing.
6. **Binding** — Is every semantic relationship one arrow bound to both endpoints? Free arrows must be explicit annotations.
7. **Arrow-label ownership** — Is every route label visibly attached to exactly one route?
8. **Spacing and balance** — At least 40px between elements; no large empty void beside a congested cluster.
9. **Readability** — Default body text is 20px; no annotation below 16px. Judge the rendered target size, not canvas zoom.
10. **Color independence** — Do critical distinctions survive grayscale? Is color meaning consistent and limited?
11. **Zone label placement** — Keep boundary titles as free-standing text at the top, not centered bound labels.
12. **Reference fidelity** — Does the result match the extracted style contract rather than generic palette defaults?

If any issue appears: **stop, fix it, re-screenshot, then continue.** The complete final gates are in `references/quality-gates.md`.

---

## Workflow: Drawing a New Diagram

### Mermaid vs. Direct Creation — Which to Use?

**Use `mermaid` / `create_from_mermaid`** when: the user already has a Mermaid diagram, or the structure maps cleanly to a flowchart/sequence/ER diagram with standard Mermaid syntax. It's fast and handles conversion automatically, though you get less control over exact layout.

**Create elements directly** when: you need precise layout control, the diagram type doesn't map to Mermaid well (e.g., custom architecture, annotated cloud diagrams), or you want elements positioned in a specific coordinate grid.

### Steps (CLI shown; MCP tools are 1:1 — see cheatsheet)

1. Complete the diagram contract, reference-style contract, semantic cut, and overview/detail decision from `references/quality-gates.md`.
2. Plan the coordinate grid, panels, primary route, and endpoint before writing JSON.
3. Optional fresh start: `npx -y mcp-excalidraw-server clear --yes`.
4. Create only title/boundaries and primary nodes first. Use descriptive IDs. Screenshot and correct hierarchy/whitespace before arrows:
   ```bash
   npx -y mcp-excalidraw-server add - <<'EOF'
   [
     {"id": "lb", "type": "rectangle", "x": 300, "y": 50, "width": 180, "height": 60, "text": "Load Balancer"},
     {"id": "svc-a", "type": "rectangle", "x": 100, "y": 200, "width": 160, "height": 60, "text": "Web Server 1"},
     {"id": "svc-b", "type": "rectangle", "x": 450, "y": 200, "width": 160, "height": 60, "text": "Web Server 2"},
     {"id": "db", "type": "rectangle", "x": 275, "y": 350, "width": 210, "height": 60, "text": "PostgreSQL"}
   ]
   EOF
   ```
   (The `-` positional is optional — with no file argument, `add` reads stdin.)
5. Set shape widths using `max(160, labelLength * 12)` and use the 20px body-text default.
6. Add the primary semantic arrows in a second batch. Bind each arrow with `startElementId` and `endElementId`; screenshot and trace the main flow.
7. Add optional branches and callouts one bounded cluster at a time. Screenshot after each cluster and stop when the one-sentence takeaway is complete.
8. Export the native scene. Resolve the skill directory from the loaded `SKILL.md`, then run:
   ```bash
   python /absolute/path/to/excalidraw-skill/scripts/audit_scene.py path/to/diagram.excalidraw --mode overview
   ```
   Exit `0` is clean, `1` is blocked, `2` is invalid input, and `3` means review is required before acceptance.
9. Export the intended PNG/SVG and complete native, 50%, 35%, grayscale, semantic, and blind visual reviews before reporting readiness.

---

## Arrow Routing — Avoid Overlaps

Straight arrows can cross through elements in complex diagrams. Use curved or elbowed arrows when needed:

**Curved arrows** (smooth arc over obstacles):
```json
{
  "type": "arrow", "x": 100, "y": 100,
  "points": [[0, 0], [50, -40], [200, 0]],
  "roundness": {"type": 2}
}
```
The intermediate waypoint `[50, -40]` lifts the arrow upward. `roundness: {type: 2}` makes it smooth.

**Elbowed arrows** (right-angle / L-shaped routing):
```json
{
  "type": "arrow", "x": 100, "y": 100,
  "points": [[0, 0], [0, -50], [200, -50], [200, 0]],
  "elbowed": true
}
```

**When to use which:**
- Default semantic relationship: direct two-point arrow, bound at both ends.
- Fan-out: slightly curved bound arrows only when spacing alone cannot separate them.
- Cross-panel edge: one short explicit edge between adjacent boundaries.
- Annotation pointer: may be unbound only when marked with `customData.auditRole = "annotation"`.

**Rule:** If an arrow would pass through an unrelated shape, move the elements first. If that cannot produce a local route, split or panelize the content. Waypoints are a last resort, not the primary layout mechanism.

---

## Workflow: Iterative Refinement

Pairing `describe` with `screenshot` is what makes this skill powerful.

- **`describe`** (`describe_scene` in MCP) → structured text: element IDs, types, positions, labels, connections. Use it to know *what's on the canvas* before making programmatic updates (find IDs, understand bounding boxes).
- **`screenshot`** (`get_canvas_screenshot` in MCP) → PNG of the actual rendered canvas. Use it for *visual quality verification* — it shows exactly what the user sees, including truncation, overlap, and arrow routing. The CLI prints the saved file path as JSON; read/view that file.

**Feedback loop:**
```
add elements
  → screenshot → view → "text truncated on auth-svc"
  → update auth-svc --set '{"width": 220}' → screenshot → "overlap between auth-svc and rate-limiter"
  → update rate-limiter --set '{"x": 520}' → screenshot → "this batch is locally clean"
  → continue to the next staged cluster; final gates still remain
```

## Workflow: Refine an Existing Diagram

1. Classify the change:
   - **Localized non-semantic:** one move, resize, typo, or style correction that does not alter the final scene's story or topology.
   - **Material:** adds/removes nodes or routes, changes hierarchy, expands scope, changes visual grammar, or prepares a final deliverable.
2. Material refinements must re-enter the diagram contract/semantic-cut gates as needed and complete native audit, target-size, 50%, 35%, grayscale, semantic, and blind visual final gates. Do not bypass safeguards by calling a redesign a refinement.
3. `describe` to understand current state — note element IDs and positions.
4. Identify elements by `id` or label text, not coordinates.
5. Update, delete, or use one `apply` patch. Bound arrows re-route when endpoints move; do not replace a semantic edge with disconnected line pieces.
6. `screenshot` after the local change. For material changes, use staged cluster screenshots and the complete final gates.
7. If updates fail: check the ID exists with `get <id>`; unlock it if needed.

## Workflow: Mermaid Conversion

```bash
echo 'graph TD
  A[Client] --> B[API]
  B --> C[(DB)]' | npx -y mcp-excalidraw-server mermaid
```
Requires an open browser tab (conversion runs in the frontend; exit code 4 tells you to open the canvas URL). Afterwards `screenshot` to verify layout. If the auto-layout is poor (nodes crowded, edges crossing), find problem elements with `describe` and reposition them with `update`.

## Workflow: File I/O

- Export scene: `export --out diagram.excalidraw` (no `--out` → JSON to stdout)
- Import scene: `import diagram.excalidraw` (append) or `import diagram.excalidraw --replace`
- Image: `screenshot --out diagram.png` / `screenshot --format svg --out diagram.svg` (browser tab required)
- Share link: `share` — encrypts the scene and returns a shareable excalidraw.com URL

This is how diagrams live in a repo: commit the `.excalidraw` file, and re-`import` + edit + `export` it when the architecture changes.

## Workflow: Snapshots

1. `snapshot save <name>` before risky changes.
2. Make changes, evaluate with `describe` / `screenshot`.
3. `snapshot restore <name>` to roll back if needed. `snapshot list` shows what's saved.

## Workflow: Duplication

`arrange duplicate --ids a,b --offset 40,40` (default offset 20,20). Useful for repeated patterns or copying layouts.

## Error Recovery

- **Exit code 3 (canvas unreachable)?** Auto-start is disabled (`EXCALIDRAW_NO_AUTOSTART=1`) or a non-loopback `EXPRESS_SERVER_URL` is set. Run `start` explicitly or fix the env.
- **Exit code 4 (browser required)?** Open `http://127.0.0.1:3000` in a browser, then retry — screenshots, image export, viewport, and mermaid conversion render in the frontend.
- **Elements not appearing?** Check `describe` — they may be off-screen. In MCP mode, `set_viewport` with `scrollToContent: true`; in a browser, press the zoom-to-fit button.
- **Arrow not connecting?** Verify element IDs with `get <id>`. Make sure `startElementId`/`endElementId` match existing element IDs.
- **Canvas in a bad state?** `snapshot save` first, then `clear --yes` and rebuild. Or `snapshot restore` to go back.
- **Element won't update?** It may be locked — `arrange unlock --ids <id>` first.
- **Duplicate text elements / element count doubling?** The frontend auto-sync timer periodically writes the full Excalidraw scene back to the server. Excalidraw internally generates a bound text element for every shape with a label; clearing and re-sending elements can re-inject cached bound texts. Clean up: `query --type text` to find elements with a `containerId`, `delete` the unwanted ones, wait a few seconds for auto-sync to settle. The safest prevention: **never put labels on background zone rectangles** — use free-standing text elements.

---

## References

- [`references/orestes-clean-style.md`](references/orestes-clean-style.md): default visual grammar and reference-matching rules for this Pi installation.
- [`references/quality-gates.md`](references/quality-gates.md): intake, semantic reduction, complexity budgets, staged construction, target-scale/grayscale, and adversarial review gates.
- [`references/cheatsheet.md`](references/cheatsheet.md): full CLI reference, MCP tools, REST API endpoints, payload shapes, and fallback colors/sizing.
- [`scripts/audit_scene.py`](scripts/audit_scene.py): deterministic native-scene structural audit; use visual review in addition to it.
