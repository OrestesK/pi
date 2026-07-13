#!/usr/bin/env python3
"""Validate source-to-scene coverage for an Excalidraw semantic cut.

This checks stable IDs, declared treatments, native scene references, and direct-edge
bindings. It does not judge whether an abstraction is understandable or visually good.
"""

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Literal, NamedTuple

from audit_scene import (
    _active_elements,
    _binding_id,
    _is_annotation_arrow,
    _semantic_node_ids,
)

TREATMENTS = {
    "included",
    "abstracted",
    "movedToDetail",
    "omittedWithRationale",
}


class Finding(NamedTuple):
    level: Literal["error"]
    code: str
    message: str
    source_id: str | None = None
    scene_element_id: str | None = None


class ValidationResult(NamedTuple):
    findings: list[Finding]
    metrics: dict[str, int | str]

    @property
    def has_errors(self) -> bool:
        return bool(self.findings)


def _records(value: object, field: str) -> list[dict]:
    if not isinstance(value, list) or any(not isinstance(item, dict) for item in value):
        raise ValueError(f"{field} must be an array of objects")
    return value


def _required_string(value: object, field: str) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} must be a non-empty string")
    return value


def _string_list(value: object, field: str) -> list[str]:
    if not isinstance(value, list) or any(not isinstance(item, str) for item in value):
        raise ValueError(f"{field} must be an array of strings")
    return value


def _source_map(records: list[dict], field: str) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for index, record in enumerate(records):
        source_id = _required_string(record.get("id"), f"{field}[{index}].id")
        if source_id in result:
            raise ValueError(f"{field} contains duplicate source id {source_id!r}")
        result[source_id] = record
    return result


def _coverage_records(manifest: dict, field: Literal["nodes", "edges"]) -> list[dict]:
    return _records(manifest.get(field), f"manifest.{field}")


def _coverage_by_source_id(records: list[dict]) -> dict[str, list[dict]]:
    grouped: dict[str, list[dict]] = {}
    for index, record in enumerate(records):
        source_id = _required_string(
            record.get("sourceId"), f"coverage[{index}].sourceId"
        )
        grouped.setdefault(source_id, []).append(record)
    return grouped


def _finding(
    code: str,
    message: str,
    *,
    source_id: str | None = None,
    scene_element_id: str | None = None,
) -> Finding:
    return Finding("error", code, message, source_id, scene_element_id)


def _validate_record_set(
    *,
    records: list[dict],
    source: dict[str, dict],
    kind: Literal["node", "edge"],
    scene_elements: dict[str, dict],
    coverage_scope: str,
    findings: list[Finding],
) -> tuple[dict[str, dict], set[str]]:
    grouped = _coverage_by_source_id(records)
    source_ids = set(source)
    declared_ids = set(grouped)
    for source_id in sorted(source_ids - declared_ids):
        findings.append(
            _finding(
                "missing-source-id",
                f"Source {kind} {source_id!r} has no coverage record.",
                source_id=source_id,
            )
        )
    for source_id in sorted(declared_ids - source_ids):
        findings.append(
            _finding(
                "unknown-source-id",
                f"Coverage record references unknown source {kind} {source_id!r}.",
                source_id=source_id,
            )
        )
    for source_id, matches in grouped.items():
        if len(matches) > 1:
            findings.append(
                _finding(
                    "duplicate-source-id",
                    f"Source {kind} {source_id!r} appears {len(matches)} times.",
                    source_id=source_id,
                )
            )

    unique_records = {
        source_id: matches[0]
        for source_id, matches in grouped.items()
        if source_id in source and len(matches) == 1
    }
    represented_scene_ids: set[str] = set()
    for source_id, record in unique_records.items():
        treatment = record.get("treatment")
        if treatment not in TREATMENTS:
            findings.append(
                _finding(
                    "invalid-treatment",
                    f"Source {kind} {source_id!r} has invalid treatment {treatment!r}.",
                    source_id=source_id,
                )
            )
            continue
        representation_ids = _string_list(
            record.get("representationIds", []),
            f"coverage[{source_id}].representationIds",
        )
        represented_scene_ids.update(representation_ids)
        rationale = record.get("rationale")
        if treatment != "included" and (
            not isinstance(rationale, str) or not rationale.strip()
        ):
            findings.append(
                _finding(
                    "missing-rationale",
                    f"Treatment {treatment!r} for source {kind} {source_id!r} requires rationale.",
                    source_id=source_id,
                )
            )
        if treatment in {"included", "abstracted"} and not representation_ids:
            findings.append(
                _finding(
                    "unresolved-representation",
                    f"Source {kind} {source_id!r} requires at least one scene representation.",
                    source_id=source_id,
                )
            )
        for scene_id in representation_ids:
            if scene_id not in scene_elements:
                findings.append(
                    _finding(
                        "unresolved-representation",
                        f"Source {kind} {source_id!r} references missing scene element {scene_id!r}.",
                        source_id=source_id,
                        scene_element_id=scene_id,
                    )
                )
        if treatment == "movedToDetail" and (
            not isinstance(record.get("detailRef"), str)
            or not record["detailRef"].strip()
        ):
            findings.append(
                _finding(
                    "open-detail-reference",
                    f"Source {kind} {source_id!r} moved to detail without detailRef.",
                    source_id=source_id,
                )
            )
        if coverage_scope == "full" and treatment == "omittedWithRationale":
            findings.append(
                _finding(
                    "full-scope-omission",
                    f"Full coverage cannot omit source {kind} {source_id!r}.",
                    source_id=source_id,
                )
            )
    return unique_records, represented_scene_ids


def _validate_direct_edges(
    *,
    source_edges: dict[str, dict],
    node_coverage: dict[str, dict],
    edge_coverage: dict[str, dict],
    scene_elements: dict[str, dict],
    findings: list[Finding],
) -> None:
    for source_id, record in edge_coverage.items():
        if record.get("treatment") != "included":
            continue
        source_edge = source_edges[source_id]
        from_source_id = _required_string(
            source_edge.get("from"), f"source.edges[{source_id}].from"
        )
        to_source_id = _required_string(
            source_edge.get("to"), f"source.edges[{source_id}].to"
        )
        from_ids = set(
            _string_list(
                record.get("fromRepresentationIds", []),
                f"coverage.edges[{source_id}].fromRepresentationIds",
            )
        )
        to_ids = set(
            _string_list(
                record.get("toRepresentationIds", []),
                f"coverage.edges[{source_id}].toRepresentationIds",
            )
        )
        source_from_ids = set(
            _string_list(
                node_coverage.get(from_source_id, {}).get("representationIds", []),
                f"coverage.nodes[{from_source_id}].representationIds",
            )
        )
        source_to_ids = set(
            _string_list(
                node_coverage.get(to_source_id, {}).get("representationIds", []),
                f"coverage.nodes[{to_source_id}].representationIds",
            )
        )
        if (
            not from_ids
            or not to_ids
            or not from_ids <= source_from_ids
            or not to_ids <= source_to_ids
        ):
            findings.append(
                _finding(
                    "endpoint-mismatch",
                    f"Direct edge {source_id!r} endpoint mappings do not match its source nodes.",
                    source_id=source_id,
                )
            )
            continue
        arrow_ids = _string_list(
            record.get("representationIds", []),
            f"coverage.edges[{source_id}].representationIds",
        )
        for arrow_id in arrow_ids:
            arrow = scene_elements.get(arrow_id)
            if not arrow or arrow.get("type") != "arrow":
                continue
            start_id = _binding_id(arrow, "start")
            end_id = _binding_id(arrow, "end")
            if not start_id or not end_id:
                findings.append(
                    _finding(
                        "unbound-direct-edge",
                        f"Direct edge {source_id!r} maps to unbound arrow {arrow_id!r}.",
                        source_id=source_id,
                        scene_element_id=arrow_id,
                    )
                )
            elif start_id not in from_ids or end_id not in to_ids:
                findings.append(
                    _finding(
                        "endpoint-mismatch",
                        f"Arrow {arrow_id!r} bindings do not match direct edge {source_id!r}.",
                        source_id=source_id,
                        scene_element_id=arrow_id,
                    )
                )


def _supplemental_scene_ids(
    manifest: dict,
    scene_elements: dict[str, dict],
    findings: list[Finding],
) -> set[str]:
    records = _records(
        manifest.get("supplementalSceneElementIds", []),
        "manifest.supplementalSceneElementIds",
    )
    result: set[str] = set()
    for index, record in enumerate(records):
        scene_id = _required_string(
            record.get("sceneElementId"),
            f"manifest.supplementalSceneElementIds[{index}].sceneElementId",
        )
        rationale = record.get("rationale")
        if not isinstance(rationale, str) or not rationale.strip():
            findings.append(
                _finding(
                    "missing-rationale",
                    f"Supplemental scene element {scene_id!r} requires rationale.",
                    scene_element_id=scene_id,
                )
            )
        if scene_id not in scene_elements:
            findings.append(
                _finding(
                    "unresolved-representation",
                    f"Supplemental scene element {scene_id!r} does not exist.",
                    scene_element_id=scene_id,
                )
            )
        result.add(scene_id)
    duplicate_ids = {
        scene_id for scene_id, count in Counter(result).items() if count > 1
    }
    for scene_id in sorted(duplicate_ids):
        findings.append(
            _finding(
                "duplicate-scene-element",
                f"Supplemental scene element {scene_id!r} is declared more than once.",
                scene_element_id=scene_id,
            )
        )
    return result


def _validate_semantic_cut_unchecked(
    scene: object, inventory: object, manifest: object
) -> ValidationResult:
    if not isinstance(scene, dict) or scene.get("type") != "excalidraw":
        raise ValueError("scene must be a native Excalidraw object")
    if not isinstance(inventory, dict):
        raise ValueError("inventory must be an object")
    if not isinstance(manifest, dict) or manifest.get("version") != 1:
        raise ValueError("manifest must be a version 1 object")
    coverage_scope = manifest.get("coverageScope")
    if coverage_scope not in {"selected", "full"}:
        raise ValueError("manifest.coverageScope must be 'selected' or 'full'")
    if manifest.get("viewMode") not in {"overview", "technical"}:
        raise ValueError("manifest.viewMode must be 'overview' or 'technical'")

    elements = _active_elements(scene)
    scene_elements = {
        element["id"]: element
        for element in elements
        if isinstance(element.get("id"), str)
    }
    source_nodes = _source_map(
        _records(inventory.get("nodes"), "inventory.nodes"), "inventory.nodes"
    )
    source_edges = _source_map(
        _records(inventory.get("edges"), "inventory.edges"), "inventory.edges"
    )
    node_records = _coverage_records(manifest, "nodes")
    edge_records = _coverage_records(manifest, "edges")
    findings: list[Finding] = []

    node_coverage, represented_nodes = _validate_record_set(
        records=node_records,
        source=source_nodes,
        kind="node",
        scene_elements=scene_elements,
        coverage_scope=coverage_scope,
        findings=findings,
    )
    edge_coverage, represented_edges = _validate_record_set(
        records=edge_records,
        source=source_edges,
        kind="edge",
        scene_elements=scene_elements,
        coverage_scope=coverage_scope,
        findings=findings,
    )
    _validate_direct_edges(
        source_edges=source_edges,
        node_coverage=node_coverage,
        edge_coverage=edge_coverage,
        scene_elements=scene_elements,
        findings=findings,
    )
    supplemental_ids = _supplemental_scene_ids(manifest, scene_elements, findings)

    semantic_nodes = _semantic_node_ids(elements)
    semantic_arrows = {
        element["id"]
        for element in elements
        if element.get("type") == "arrow"
        and isinstance(element.get("id"), str)
        and not _is_annotation_arrow(element)
    }
    mapped_scene_ids = represented_nodes | represented_edges | supplemental_ids
    for scene_id in sorted((semantic_nodes | semantic_arrows) - mapped_scene_ids):
        findings.append(
            _finding(
                "unmapped-scene-element",
                f"Semantic scene element {scene_id!r} is not covered or supplemental.",
                scene_element_id=scene_id,
            )
        )

    return ValidationResult(
        findings,
        {
            "coverageScope": coverage_scope,
            "viewMode": str(manifest["viewMode"]),
            "sourceNodes": len(source_nodes),
            "sourceEdges": len(source_edges),
            "coveredNodes": len(node_coverage),
            "coveredEdges": len(edge_coverage),
            "semanticSceneElements": len(semantic_nodes | semantic_arrows),
            "supplementalSceneElements": len(supplemental_ids),
        },
    )


def validate_semantic_cut(
    scene: object, inventory: object, manifest: object
) -> ValidationResult:
    try:
        return _validate_semantic_cut_unchecked(scene, inventory, manifest)
    except (AttributeError, KeyError, TypeError, ValueError) as error:
        return ValidationResult(
            [_finding("invalid-input", f"Malformed semantic-cut input: {error}")],
            {},
        )


def _serialize(result: ValidationResult) -> dict:
    return {
        "status": "fail" if result.has_errors else "pass",
        "metrics": result.metrics,
        "findings": [finding._asdict() for finding in result.findings],
    }


def _load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scene", type=Path)
    parser.add_argument("inventory", type=Path)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    args = parser.parse_args()

    try:
        scene = _load_json(args.scene)
        inventory = _load_json(args.inventory)
        manifest = _load_json(args.manifest)
    except (OSError, UnicodeDecodeError, json.JSONDecodeError) as error:
        print(
            json.dumps({"status": "fail", "error": str(error)})
            if args.as_json
            else f"ERROR invalid-input: {error}"
        )
        return 2

    result = validate_semantic_cut(scene, inventory, manifest)
    if args.as_json:
        print(json.dumps(_serialize(result), indent=2))
    else:
        for finding in result.findings:
            context = finding.source_id or finding.scene_element_id
            suffix = f" [{context}]" if context else ""
            print(f"ERROR {finding.code}{suffix}: {finding.message}")
        print(f"SUMMARY {json.dumps(result.metrics, sort_keys=True)}")
        print("FAIL" if result.has_errors else "PASS")
    return 1 if result.has_errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
