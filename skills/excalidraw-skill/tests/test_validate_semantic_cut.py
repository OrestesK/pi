from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from copy import deepcopy
from pathlib import Path
from typing import Protocol

SCRIPT = Path(__file__).parents[1] / "scripts" / "validate_semantic_cut.py"
sys.path.insert(0, str(SCRIPT.parent))
SPEC = importlib.util.spec_from_file_location("validate_semantic_cut", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FindingLike(Protocol):
    code: str


class ValidationResultLike(Protocol):
    findings: list[FindingLike]
    metrics: dict[str, int | str]
    has_errors: bool


def sample_scene() -> dict:
    return {
        "type": "excalidraw",
        "version": 2,
        "elements": [
            {
                "id": "node-a",
                "type": "rectangle",
                "x": 0,
                "y": 0,
                "width": 180,
                "height": 80,
                "label": {"text": "A"},
            },
            {
                "id": "node-b",
                "type": "rectangle",
                "x": 300,
                "y": 0,
                "width": 180,
                "height": 80,
                "label": {"text": "B"},
            },
            {
                "id": "edge-ab",
                "type": "arrow",
                "x": 180,
                "y": 40,
                "width": 120,
                "height": 0,
                "points": [[0, 0], [120, 0]],
                "startBinding": {"elementId": "node-a"},
                "endBinding": {"elementId": "node-b"},
            },
        ],
        "appState": {"viewBackgroundColor": "#ffffff"},
        "files": {},
    }


def sample_inventory() -> dict:
    return {
        "nodes": [
            {"id": "a", "label": "A"},
            {"id": "b", "label": "B"},
        ],
        "edges": [
            {"id": "e1", "from": "a", "to": "b", "kind": "primary"},
        ],
    }


def sample_manifest() -> dict:
    return {
        "version": 1,
        "coverageScope": "full",
        "viewMode": "technical",
        "nodes": [
            {
                "sourceId": "a",
                "treatment": "included",
                "representationIds": ["node-a"],
                "rationale": None,
            },
            {
                "sourceId": "b",
                "treatment": "included",
                "representationIds": ["node-b"],
                "rationale": None,
            },
        ],
        "edges": [
            {
                "sourceId": "e1",
                "treatment": "included",
                "representationIds": ["edge-ab"],
                "fromRepresentationIds": ["node-a"],
                "toRepresentationIds": ["node-b"],
                "rationale": None,
            }
        ],
        "supplementalSceneElementIds": [],
    }


class SemanticCutValidationTests(unittest.TestCase):
    def finding_codes(self, result: ValidationResultLike) -> set[str]:
        return {finding.code for finding in result.findings}

    def validate(
        self,
        *,
        scene: dict | None = None,
        inventory: dict | None = None,
        manifest: dict | None = None,
    ) -> ValidationResultLike:
        return MODULE.validate_semantic_cut(
            scene or sample_scene(),
            inventory or sample_inventory(),
            manifest or sample_manifest(),
        )

    def test_valid_full_scope_manifest_passes(self) -> None:
        result = self.validate()

        self.assertFalse(result.has_errors)
        self.assertEqual(set(), self.finding_codes(result))
        self.assertEqual(2, result.metrics["coveredNodes"])
        self.assertEqual(1, result.metrics["coveredEdges"])

    def test_missing_duplicate_and_unknown_source_ids_fail_distinctly(self) -> None:
        missing = sample_manifest()
        missing["nodes"] = missing["nodes"][:1]
        duplicate = sample_manifest()
        duplicate["nodes"].append(deepcopy(duplicate["nodes"][0]))
        unknown = sample_manifest()
        unknown["nodes"].append(
            {
                "sourceId": "ghost",
                "treatment": "included",
                "representationIds": ["node-a"],
                "rationale": None,
            }
        )

        self.assertIn(
            "missing-source-id", self.finding_codes(self.validate(manifest=missing))
        )
        self.assertIn(
            "duplicate-source-id", self.finding_codes(self.validate(manifest=duplicate))
        )
        self.assertIn(
            "unknown-source-id", self.finding_codes(self.validate(manifest=unknown))
        )

    def test_nonincluded_treatment_requires_rationale(self) -> None:
        manifest = sample_manifest()
        manifest["nodes"][0]["treatment"] = "abstracted"

        result = self.validate(manifest=manifest)

        self.assertIn("missing-rationale", self.finding_codes(result))

    def test_missing_scene_representation_fails(self) -> None:
        manifest = sample_manifest()
        manifest["nodes"][0]["representationIds"] = ["missing-node"]

        result = self.validate(manifest=manifest)

        self.assertIn("unresolved-representation", self.finding_codes(result))

    def test_direct_edge_requires_bound_matching_endpoints(self) -> None:
        wrong_endpoint_scene = sample_scene()
        wrong_endpoint_scene["elements"][2]["endBinding"] = {"elementId": "node-a"}
        unbound_scene = sample_scene()
        unbound_scene["elements"][2]["endBinding"] = None

        wrong = self.validate(scene=wrong_endpoint_scene)
        unbound = self.validate(scene=unbound_scene)

        self.assertIn("endpoint-mismatch", self.finding_codes(wrong))
        self.assertIn("unbound-direct-edge", self.finding_codes(unbound))

    def test_full_scope_rejects_omission(self) -> None:
        manifest = sample_manifest()
        manifest["nodes"][0].update(
            {
                "treatment": "omittedWithRationale",
                "representationIds": [],
                "rationale": "Not shown",
            }
        )

        result = self.validate(manifest=manifest)

        self.assertIn("full-scope-omission", self.finding_codes(result))

    def test_moved_to_detail_requires_detail_reference(self) -> None:
        manifest = sample_manifest()
        manifest["nodes"][0].update(
            {
                "treatment": "movedToDetail",
                "representationIds": [],
                "rationale": "Shown in the detail artifact",
            }
        )

        result = self.validate(manifest=manifest)

        self.assertIn("open-detail-reference", self.finding_codes(result))

    def test_unmapped_scene_element_requires_supplemental_rationale(self) -> None:
        extra_node = {
            "id": "extra-node",
            "type": "rectangle",
            "x": 600,
            "y": 0,
            "width": 180,
            "height": 80,
            "label": {"text": "Supplemental"},
        }
        scene = sample_scene()
        scene["elements"].append(extra_node)

        unmapped = self.validate(scene=scene)
        manifest = sample_manifest()
        manifest["supplementalSceneElementIds"] = [
            {"sceneElementId": "extra-node", "rationale": "Derived navigation aid"}
        ]
        mapped = self.validate(scene=scene, manifest=manifest)

        self.assertIn("unmapped-scene-element", self.finding_codes(unmapped))
        self.assertNotIn("unmapped-scene-element", self.finding_codes(mapped))

    def test_cli_exit_codes_and_json_contract(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scene_path = root / "scene.excalidraw"
            inventory_path = root / "inventory.json"
            manifest_path = root / "manifest.json"
            scene_path.write_text(json.dumps(sample_scene()), encoding="utf-8")
            inventory_path.write_text(json.dumps(sample_inventory()), encoding="utf-8")
            manifest_path.write_text(json.dumps(sample_manifest()), encoding="utf-8")

            valid = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(scene_path),
                    str(inventory_path),
                    str(manifest_path),
                    "--json",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(0, valid.returncode)
            self.assertEqual("pass", json.loads(valid.stdout)["status"])

            invalid_manifest = sample_manifest()
            invalid_manifest["nodes"] = invalid_manifest["nodes"][:1]
            manifest_path.write_text(json.dumps(invalid_manifest), encoding="utf-8")
            invalid = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(scene_path),
                    str(inventory_path),
                    str(manifest_path),
                    "--json",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(1, invalid.returncode)
            self.assertEqual("fail", json.loads(invalid.stdout)["status"])

            manifest_path.write_text("{", encoding="utf-8")
            malformed = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    str(scene_path),
                    str(inventory_path),
                    str(manifest_path),
                    "--json",
                ],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(2, malformed.returncode)
            self.assertEqual("fail", json.loads(malformed.stdout)["status"])


if __name__ == "__main__":
    unittest.main()
