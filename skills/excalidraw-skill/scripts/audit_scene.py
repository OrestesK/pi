#!/usr/bin/env python3
"""Static structural audit for native Excalidraw scenes.

This catches machine-verifiable risks before visual review. It does not judge beauty
and does not replace target-size, grayscale, or adversarial screenshot inspection.
"""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from typing import Literal, NamedTuple

Mode = Literal["overview", "technical"]
SHAPE_TYPES = {"rectangle", "ellipse", "diamond"}
DEFAULT_INK = {"#000000", "#1e1e1e", "#343a40"}
NEUTRAL_STROKES = DEFAULT_INK | {"#868e96", "#adb5bd"}


def _finite_number(value: object, field: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a JSON number")
    number = float(value)
    if not math.isfinite(number):
        raise ValueError(f"{field} must be finite")
    return number


class Finding(NamedTuple):
    level: Literal["error", "warning"]
    code: str
    message: str
    element_id: str | None = None


class AuditResult(NamedTuple):
    findings: list[Finding]
    metrics: dict[str, int | float | str]

    @property
    def has_errors(self) -> bool:
        return any(finding.level == "error" for finding in self.findings)

    @property
    def has_warnings(self) -> bool:
        return any(finding.level == "warning" for finding in self.findings)


def _active_elements(scene: dict) -> list[dict]:
    return [
        element for element in scene.get("elements", []) if not element.get("isDeleted")
    ]


def _direct_label_text(element: dict) -> str | None:
    label = element.get("label")
    if isinstance(label, dict) and isinstance(label.get("text"), str):
        return label["text"]
    text = element.get("text")
    return text if isinstance(text, str) else None


def _semantic_node_ids(elements: list[dict]) -> set[str]:
    text_elements = [element for element in elements if element.get("type") == "text"]
    text_containers = {
        element["containerId"]
        for element in text_elements
        if element.get("containerId")
    }
    x0, y0, x1, y1 = _bbox(elements)
    canvas_width = _finite_number(x1 - x0, "canvas.width")
    canvas_height = _finite_number(y1 - y0, "canvas.height")
    canvas_area = max(1.0, _finite_number(canvas_width * canvas_height, "canvas.area"))
    node_ids: set[str] = set()
    for element in elements:
        if element.get("type") not in SHAPE_TYPES:
            continue
        element_id = element.get("id")
        if not isinstance(element_id, str):
            continue
        explicitly_labeled = (
            bool(_direct_label_text(element))
            or element_id in text_containers
            or any(
                bound.get("type") == "text"
                for bound in element.get("boundElements") or []
            )
        )
        left, top, right, bottom = _rectangle(element)
        inferred_label = any(
            left
            <= _finite_number(text.get("x", 0), "text.x")
            + _finite_number(text.get("width", 0), "text.width") / 2
            <= right
            and top
            <= _finite_number(text.get("y", 0), "text.y")
            + _finite_number(text.get("height", 0), "text.height") / 2
            <= bottom
            for text in text_elements
        )
        area = _finite_number(
            max(0.0, right - left) * max(0.0, bottom - top), "element.area"
        )
        is_boundary = (
            element.get("strokeStyle") == "dashed" or area > canvas_area * 0.25
        )
        if explicitly_labeled or (inferred_label and not is_boundary):
            node_ids.add(element_id)
    return node_ids


def _binding_id(element: dict, side: Literal["start", "end"]) -> str | None:
    binding = element.get(f"{side}Binding")
    if isinstance(binding, dict):
        candidate = binding.get("elementId")
        return candidate if isinstance(candidate, str) else None
    direct = element.get(f"{side}ElementId")
    if isinstance(direct, str):
        return direct
    normalized = element.get(side)
    if isinstance(normalized, dict):
        candidate = normalized.get("id")
        return candidate if isinstance(candidate, str) else None
    return None


def _is_annotation_arrow(element: dict) -> bool:
    custom_data = element.get("customData")
    return (
        isinstance(custom_data, dict) and custom_data.get("auditRole") == "annotation"
    )


def _bbox(elements: list[dict]) -> tuple[float, float, float, float]:
    if not elements:
        return (0, 0, 0, 0)
    rectangles = [_rectangle(element) for element in elements]
    return (
        min(rectangle[0] for rectangle in rectangles),
        min(rectangle[1] for rectangle in rectangles),
        max(rectangle[2] for rectangle in rectangles),
        max(rectangle[3] for rectangle in rectangles),
    )


def _rectangle(element: dict) -> tuple[float, float, float, float]:
    x = _finite_number(element.get("x", 0), "element.x")
    y = _finite_number(element.get("y", 0), "element.y")
    width = _finite_number(element.get("width", 0), "element.width")
    height = _finite_number(element.get("height", 0), "element.height")
    return (
        x,
        y,
        _finite_number(x + width, "element.right"),
        _finite_number(y + height, "element.bottom"),
    )


def _rectangles_overlap(
    first: tuple[float, float, float, float], second: tuple[float, float, float, float]
) -> bool:
    overlap_x = min(first[2], second[2]) - max(first[0], second[0])
    overlap_y = min(first[3], second[3]) - max(first[1], second[1])
    return overlap_x > 4 and overlap_y > 4


def _rectangle_contains(
    outer: tuple[float, float, float, float], inner: tuple[float, float, float, float]
) -> bool:
    return (
        outer[0] <= inner[0]
        and outer[1] <= inner[1]
        and outer[2] >= inner[2]
        and outer[3] >= inner[3]
    )


def _point_coordinates(point: object) -> tuple[float, float]:
    if isinstance(point, (list, tuple)) and len(point) >= 2:
        return _finite_number(point[0], "point.x"), _finite_number(point[1], "point.y")
    if isinstance(point, dict) and "x" in point and "y" in point:
        return _finite_number(point["x"], "point.x"), _finite_number(
            point["y"], "point.y"
        )
    raise ValueError("arrow points must be [x, y] pairs or objects with numeric x/y")


def _arrow_length(element: dict) -> float:
    points = element.get("points") or []
    coordinates = [_point_coordinates(point) for point in points]
    total = 0.0
    for first, second in zip(coordinates, coordinates[1:], strict=False):
        delta_x = _finite_number(second[0] - first[0], "arrow.deltaX")
        delta_y = _finite_number(second[1] - first[1], "arrow.deltaY")
        segment = _finite_number(math.hypot(delta_x, delta_y), "arrow.segmentLength")
        total = _finite_number(total + segment, "arrow.length")
    return total


def _audit_scene_unchecked(scene: object, mode: Mode = "overview") -> AuditResult:
    if not isinstance(scene, dict):
        return AuditResult(
            [Finding("error", "invalid-scene", "Expected an Excalidraw JSON object.")],
            {},
        )
    scene_elements = scene.get("elements")
    if (
        scene.get("type") != "excalidraw"
        or not isinstance(scene_elements, list)
        or any(not isinstance(element, dict) for element in scene_elements)
    ):
        return AuditResult(
            [
                Finding(
                    "error",
                    "invalid-scene",
                    "Expected an Excalidraw scene with an array of element objects.",
                )
            ],
            {},
        )

    elements = _active_elements(scene)
    ids = {element.get("id") for element in elements}
    node_ids = _semantic_node_ids(elements)
    nodes = [element for element in elements if element.get("id") in node_ids]
    arrows = [element for element in elements if element.get("type") == "arrow"]
    semantic_arrows = [
        element for element in arrows if not _is_annotation_arrow(element)
    ]
    texts = [element for element in elements if element.get("type") == "text"]
    findings: list[Finding] = []
    if mode == "technical":
        findings.append(
            Finding(
                "warning",
                "technical-visual-review-required",
                "Static analysis cannot prove panel structure or local flow quality. Technical mode always requires target-scale and blind visual review.",
            )
        )

    x0, y0, x1, y1 = _bbox(elements)
    canvas_width = max(0.0, _finite_number(x1 - x0, "canvas.width"))
    canvas_height = max(0.0, _finite_number(y1 - y0, "canvas.height"))
    canvas_diagonal = _finite_number(
        math.hypot(canvas_width, canvas_height), "canvas.diagonal"
    )

    if mode == "overview":
        if len(nodes) > 9:
            findings.append(
                Finding(
                    "error",
                    "overview-node-budget",
                    f"Overview has {len(nodes)} semantic nodes; default maximum is 9. Split or approve a detail view.",
                )
            )
        if len(semantic_arrows) > 11:
            findings.append(
                Finding(
                    "error",
                    "overview-edge-budget",
                    f"Overview has {len(semantic_arrows)} semantic arrows; default maximum is 11. Split or reduce routes.",
                )
            )

    background = scene.get("appState", {}).get("viewBackgroundColor", "#ffffff")
    if str(background).lower() != "#ffffff":
        findings.append(
            Finding(
                "warning",
                "nonwhite-canvas",
                f"Canvas background is {background}; the local default style uses white.",
            )
        )

    unbound_arrows = [
        element
        for element in semantic_arrows
        if not _binding_id(element, "start") or not _binding_id(element, "end")
    ]
    for arrow_element in semantic_arrows:
        for point in arrow_element.get("points") or []:
            _point_coordinates(point)
        arrow_id = str(arrow_element.get("id", "<unknown>"))
        start_id = _binding_id(arrow_element, "start")
        end_id = _binding_id(arrow_element, "end")
        if not start_id or not end_id:
            findings.append(
                Finding(
                    "warning",
                    "unbound-semantic-arrow",
                    "Semantic arrows should be bound to both endpoint elements. Mark true annotation arrows with customData.auditRole=annotation.",
                    arrow_id,
                )
            )
        for side, endpoint_id in (("start", start_id), ("end", end_id)):
            if endpoint_id and endpoint_id not in ids:
                findings.append(
                    Finding(
                        "error",
                        "missing-arrow-endpoint",
                        f"Arrow {side} binding references missing element {endpoint_id!r}.",
                        arrow_id,
                    )
                )
        stroke_width = _finite_number(
            arrow_element.get("strokeWidth", 2), "arrow.strokeWidth"
        )
        if stroke_width != 2:
            findings.append(
                Finding(
                    "warning",
                    "nonstandard-arrow-width",
                    "The clean default uses 2px arrows unless the reference explicitly establishes another hierarchy.",
                    arrow_id,
                )
            )
        if arrow_element.get("strokeStyle", "solid") != "solid":
            findings.append(
                Finding(
                    "warning",
                    "nonstandard-arrow-style",
                    "The clean default uses solid semantic arrows; dashed/dotted arrows require an explicit legend or reference convention.",
                    arrow_id,
                )
            )
        if len(arrow_element.get("points") or []) > 3:
            findings.append(
                Finding(
                    "warning",
                    "complex-arrow-route",
                    "Arrow has more than three points. Prefer spacing and direct local routing over multi-bend connectors.",
                    arrow_id,
                )
            )
        if (
            mode == "overview"
            and canvas_diagonal
            and _arrow_length(arrow_element) > canvas_diagonal * 0.45
        ):
            findings.append(
                Finding(
                    "warning",
                    "long-overview-arrow",
                    "Arrow spans nearly half the canvas diagonal. Long perimeter routes usually indicate a missing panel or duplicated concept.",
                    arrow_id,
                )
            )

    allowed_unbound = max(1, math.ceil(len(semantic_arrows) * 0.1))
    if mode == "overview" and len(unbound_arrows) > allowed_unbound:
        findings.append(
            Finding(
                "error",
                "too-many-unbound-semantic-arrows",
                f"Overview has {len(unbound_arrows)} unbound semantic arrows; at most {allowed_unbound} legacy exception is allowed.",
            )
        )

    for text_element in texts:
        font_size = int(
            _finite_number(text_element.get("fontSize", 20), "text.fontSize")
        )
        container_id = text_element.get("containerId")
        if container_id and font_size < 20:
            findings.append(
                Finding(
                    "warning",
                    "small-bound-text",
                    f"Bound node text is {font_size}px; the local default body size is 20px.",
                    str(text_element.get("id", "<unknown>")),
                )
            )
        elif not container_id and font_size < 16:
            findings.append(
                Finding(
                    "warning",
                    "small-annotation-text",
                    f"Standalone annotation text is {font_size}px; minimum is 16px.",
                    str(text_element.get("id", "<unknown>")),
                )
            )
        if container_id and len(str(text_element.get("text", ""))) > 80:
            findings.append(
                Finding(
                    "warning",
                    "long-node-copy",
                    "Node contains more than 80 characters. Move rationale or caveats into adjacent notes.",
                    str(container_id),
                )
            )

    bound_container_ids = {
        element.get("containerId")
        for element in texts
        if isinstance(element.get("containerId"), str)
    }
    for node_element in nodes:
        node_id = str(node_element.get("id", "<unknown>"))
        direct_text = _direct_label_text(node_element)
        font_size = int(
            _finite_number(node_element.get("fontSize", 20), "node.fontSize")
        )
        if direct_text and node_id not in bound_container_ids and font_size < 20:
            findings.append(
                Finding(
                    "warning",
                    "small-bound-text",
                    f"Bound node text is {font_size}px; the local default body size is 20px.",
                    node_id,
                )
            )
        if direct_text and len(direct_text) > 80:
            findings.append(
                Finding(
                    "warning",
                    "long-node-copy",
                    "Node contains more than 80 characters. Move rationale or caveats into adjacent notes.",
                    node_id,
                )
            )

    for element in elements:
        opacity = _finite_number(element.get("opacity", 100), "element.opacity")
        if opacity != 100:
            findings.append(
                Finding(
                    "warning",
                    "reduced-opacity",
                    "The clean default uses full opacity; faint routes disappear at documentation scale.",
                    str(element.get("id", "<unknown>")),
                )
            )

    for index, first_node in enumerate(nodes):
        for second_node in nodes[index + 1 :]:
            first_rectangle = _rectangle(first_node)
            second_rectangle = _rectangle(second_node)
            intentional_nesting = mode == "technical" and (
                _rectangle_contains(first_rectangle, second_rectangle)
                or _rectangle_contains(second_rectangle, first_rectangle)
            )
            if intentional_nesting:
                continue
            if _rectangles_overlap(first_rectangle, second_rectangle):
                findings.append(
                    Finding(
                        "error" if mode == "overview" else "warning",
                        "overlapping-semantic-nodes",
                        f"Semantic nodes {first_node.get('id')} and {second_node.get('id')} overlap.",
                    )
                )

    accent_colors = {
        str(element.get("strokeColor", "#1e1e1e")).lower()
        for element in elements
        if element.get("type") in SHAPE_TYPES | {"arrow"}
    } - NEUTRAL_STROKES
    if mode == "overview" and len(accent_colors) > 5:
        findings.append(
            Finding(
                "warning",
                "excessive-accent-palette",
                f"Overview uses {len(accent_colors)} accent stroke colors; the clean default maximum is 5.",
            )
        )

    line_count = sum(element.get("type") == "line" for element in elements)
    if mode == "overview" and line_count > 2:
        findings.append(
            Finding(
                "warning",
                "many-free-lines",
                f"Overview contains {line_count} free line elements. Confirm they are structural rather than decorative ribbons or halos.",
            )
        )

    metrics: dict[str, int | float | str] = {
        "mode": mode,
        "activeElements": len(elements),
        "semanticNodes": len(nodes),
        "semanticArrows": len(semantic_arrows),
        "annotationArrows": len(arrows) - len(semantic_arrows),
        "textElements": len(texts),
        "accentColors": len(accent_colors),
        "canvasWidth": round(canvas_width, 2),
        "canvasHeight": round(canvas_height, 2),
    }
    return AuditResult(findings, metrics)


def audit_scene(scene: object, mode: Mode = "overview") -> AuditResult:
    try:
        return _audit_scene_unchecked(scene, mode)
    except (AttributeError, TypeError, ValueError, OverflowError) as error:
        return AuditResult(
            [
                Finding(
                    "error",
                    "invalid-scene",
                    f"Malformed Excalidraw scene data: {error}",
                )
            ],
            {},
        )


def _serialize(result: AuditResult) -> dict:
    status = (
        "fail"
        if result.has_errors
        else "review-required"
        if result.has_warnings
        else "pass"
    )
    return {
        "status": status,
        "metrics": result.metrics,
        "findings": [finding._asdict() for finding in result.findings],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "scene", type=Path, help="Path to a native .excalidraw JSON file"
    )
    parser.add_argument("--mode", choices=("overview", "technical"), default="overview")
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    try:
        scene = json.loads(args.scene.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(
            json.dumps({"status": "fail", "error": str(error)})
            if args.as_json
            else f"ERROR invalid-scene: {error}"
        )
        return 2

    result = audit_scene(scene, mode=args.mode)
    if args.as_json:
        print(json.dumps(_serialize(result), indent=2))
    else:
        for finding in result.findings:
            suffix = f" [{finding.element_id}]" if finding.element_id else ""
            print(f"{finding.level.upper()} {finding.code}{suffix}: {finding.message}")
        print(f"SUMMARY {json.dumps(result.metrics, sort_keys=True)}")
        print(
            "FAIL"
            if result.has_errors
            else "REVIEW REQUIRED"
            if result.has_warnings
            else "PASS"
        )
    if result.has_errors:
        return 1
    return 3 if result.has_warnings else 0


if __name__ == "__main__":
    raise SystemExit(main())
