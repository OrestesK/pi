from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Protocol

SCRIPT = Path(__file__).parents[1] / "scripts" / "audit_scene.py"
SPEC = importlib.util.spec_from_file_location("audit_scene", SCRIPT)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


def text_element(
    element_id: str, container_id: str, text: str, font_size: int = 20
) -> dict:
    return {
        "id": element_id,
        "type": "text",
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 25,
        "text": text,
        "fontSize": font_size,
        "containerId": container_id,
        "isDeleted": False,
    }


def node(element_id: str, text_id: str, x: int) -> dict:
    return {
        "id": element_id,
        "type": "rectangle",
        "x": x,
        "y": 100,
        "width": 180,
        "height": 90,
        "strokeColor": "#1e1e1e",
        "backgroundColor": "transparent",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "boundElements": [{"id": text_id, "type": "text"}],
        "isDeleted": False,
    }


def arrow(
    element_id: str, start_id: str | None, end_id: str | None, **overrides: object
) -> dict:
    result = {
        "id": element_id,
        "type": "arrow",
        "x": 180,
        "y": 145,
        "width": 100,
        "height": 0,
        "points": [[0, 0], [100, 0]],
        "strokeColor": "#1e1e1e",
        "strokeWidth": 2,
        "strokeStyle": "solid",
        "roughness": 1,
        "opacity": 100,
        "startBinding": {"elementId": start_id} if start_id else None,
        "endBinding": {"elementId": end_id} if end_id else None,
        "isDeleted": False,
    }
    result.update(overrides)
    return result


def panel(element_id: str, panel_id: str, x: int) -> dict:
    return {
        "id": element_id,
        "type": "rectangle",
        "x": x,
        "y": 40,
        "width": 500,
        "height": 220,
        "text": panel_id,
        "strokeColor": "#adb5bd",
        "backgroundColor": "transparent",
        "strokeWidth": 1,
        "strokeStyle": "dashed",
        "customData": {"auditRole": "panel", "auditPanel": panel_id},
        "isDeleted": False,
    }


def scene(node_count: int = 3, arrows: list[dict] | None = None) -> dict:
    elements: list[dict] = []
    for index in range(node_count):
        node_id = f"node-{index}"
        text_id = f"text-{index}"
        elements.extend(
            [
                node(node_id, text_id, index * 260),
                text_element(text_id, node_id, node_id),
            ]
        )
    if arrows is None:
        arrows = [
            arrow(f"arrow-{index}", f"node-{index}", f"node-{index + 1}")
            for index in range(node_count - 1)
        ]
    elements.extend(arrows)
    return {
        "type": "excalidraw",
        "version": 2,
        "elements": elements,
        "appState": {"viewBackgroundColor": "#ffffff"},
        "files": {},
    }


class FindingLike(Protocol):
    code: str
    level: str


class AuditResultLike(Protocol):
    findings: list[FindingLike]


class AuditSceneTests(unittest.TestCase):
    def finding_codes(self, result: AuditResultLike) -> set[str]:
        return {finding.code for finding in result.findings}

    def run_cli(self, payload: str, *args: str) -> subprocess.CompletedProcess[str]:
        with tempfile.TemporaryDirectory() as directory:
            scene_path = Path(directory) / "scene.excalidraw"
            scene_path.write_text(payload, encoding="utf-8")
            return subprocess.run(
                [sys.executable, str(SCRIPT), str(scene_path), "--json", *args],
                capture_output=True,
                text=True,
                check=False,
            )

    def test_clean_overview_passes(self) -> None:
        result = MODULE.audit_scene(scene(), mode="overview")

        self.assertFalse(result.has_errors)
        self.assertEqual(set(), self.finding_codes(result))

    def test_agent_friendly_shape_labels_are_nodes_and_checked_for_font_size(
        self,
    ) -> None:
        friendly_scene = scene()
        friendly_scene["elements"] = [
            element
            for element in friendly_scene["elements"]
            if element["type"] != "text"
        ]
        for element in friendly_scene["elements"]:
            if element["type"] == "rectangle":
                element.pop("boundElements", None)
                element["label"] = {"text": element["id"]}
                element["fontSize"] = 16
            if element["type"] == "arrow":
                element["start"] = {"id": element.pop("startBinding")["elementId"]}
                element["end"] = {"id": element.pop("endBinding")["elementId"]}

        result = MODULE.audit_scene(friendly_scene, mode="overview")

        self.assertEqual(3, result.metrics["semanticNodes"])
        self.assertIn("small-bound-text", self.finding_codes(result))
        self.assertNotIn("unbound-semantic-arrow", self.finding_codes(result))

    def test_overview_budget_rejects_too_many_nodes_and_edges(self) -> None:
        many_arrows = [
            arrow(f"arrow-{index}", "node-0", "node-1") for index in range(12)
        ]

        result = MODULE.audit_scene(
            scene(node_count=10, arrows=many_arrows), mode="overview"
        )

        self.assertTrue(result.has_errors)
        self.assertIn("overview-node-budget", self.finding_codes(result))
        self.assertIn("overview-edge-budget", self.finding_codes(result))

    def test_single_unbound_semantic_arrow_warns_but_annotation_arrow_is_allowed(
        self,
    ) -> None:
        semantic = arrow("semantic", None, "node-1")
        annotation = arrow(
            "annotation",
            None,
            None,
            customData={"auditRole": "annotation"},
        )

        result = MODULE.audit_scene(
            scene(arrows=[semantic, annotation]), mode="overview"
        )

        self.assertFalse(result.has_errors)
        self.assertEqual(
            [("warning", "semantic")],
            [
                (finding.level, finding.element_id)
                for finding in result.findings
                if finding.code == "unbound-semantic-arrow"
            ],
        )

    def test_many_unbound_semantic_arrows_fail_overview(self) -> None:
        result = MODULE.audit_scene(
            scene(
                arrows=[
                    arrow("unbound-1", None, "node-1"),
                    arrow("unbound-2", "node-1", None),
                ]
            ),
            mode="overview",
        )

        self.assertTrue(result.has_errors)
        self.assertIn("too-many-unbound-semantic-arrows", self.finding_codes(result))

    def test_reports_clean_style_drift(self) -> None:
        drifting_scene = scene()
        drifting_scene["appState"]["viewBackgroundColor"] = "#fff8e7"
        drifting_scene["elements"][1]["fontSize"] = 16
        drifting_scene["elements"][-1]["strokeWidth"] = 5
        drifting_scene["elements"][-1]["strokeStyle"] = "dashed"
        drifting_scene["elements"][-1]["points"] = [
            [0, 0],
            [20, 80],
            [80, -60],
            [100, 0],
        ]

        result = MODULE.audit_scene(drifting_scene, mode="overview")
        codes = self.finding_codes(result)

        self.assertIn("nonwhite-canvas", codes)
        self.assertIn("small-bound-text", codes)
        self.assertIn("nonstandard-arrow-width", codes)
        self.assertIn("nonstandard-arrow-style", codes)
        self.assertIn("complex-arrow-route", codes)

    def test_technical_mode_does_not_apply_overview_budgets(self) -> None:
        many_arrows = [
            arrow(f"arrow-{index}", "node-0", "node-1") for index in range(20)
        ]

        result = MODULE.audit_scene(
            scene(node_count=20, arrows=many_arrows), mode="technical"
        )

        self.assertNotIn("overview-node-budget", self.finding_codes(result))
        self.assertNotIn("overview-edge-budget", self.finding_codes(result))
        self.assertIn("technical-visual-review-required", self.finding_codes(result))
        self.assertTrue(result.has_warnings)
        self.assertFalse(result.has_errors)

    def test_technical_mode_reports_overlap_as_warning(self) -> None:
        overlapping_scene = scene(node_count=2)
        overlapping_scene["elements"][2]["x"] = 100

        result = MODULE.audit_scene(overlapping_scene, mode="technical")

        overlaps = [
            finding
            for finding in result.findings
            if finding.code == "overlapping-semantic-nodes"
        ]
        self.assertEqual(["warning"], [finding.level for finding in overlaps])
        self.assertFalse(result.has_errors)

    def test_technical_mode_allows_intentional_nested_nodes(self) -> None:
        nested_scene = scene(node_count=2)
        nested_node = nested_scene["elements"][2]
        nested_node.update({"x": 30, "y": 120, "width": 80, "height": 40})

        result = MODULE.audit_scene(nested_scene, mode="technical")

        self.assertNotIn("overlapping-semantic-nodes", self.finding_codes(result))
        self.assertFalse(result.has_errors)

    def test_expected_panels_report_explicit_topology_metrics(self) -> None:
        panelized = scene(node_count=3)
        panelized["elements"].extend(
            [panel("panel-a", "a", -20), panel("panel-b", "b", 500)]
        )
        for element in panelized["elements"]:
            if element.get("id") in {"node-0", "node-1"}:
                element["customData"] = {"auditPanel": "a"}
            elif element.get("id") == "node-2":
                element["customData"] = {"auditPanel": "b"}

        result = MODULE.audit_scene(panelized, mode="technical", expect_panels=True)

        self.assertEqual(2, result.metrics["panelCount"])
        self.assertEqual(3, result.metrics["taggedSemanticNodes"])
        self.assertEqual(0, result.metrics["untaggedSemanticNodes"])
        self.assertEqual(1, result.metrics["localPanelSemanticArrows"])
        self.assertEqual(1, result.metrics["crossPanelSemanticArrows"])
        self.assertEqual(0, result.metrics["unresolvedPanelSemanticArrows"])
        self.assertEqual(3, result.metrics["semanticNodes"])
        self.assertNotIn("unpanelized-technical-scene", self.finding_codes(result))

    def test_expected_panels_report_missing_duplicate_and_unknown_metadata(
        self,
    ) -> None:
        unpanelized = MODULE.audit_scene(scene(), mode="technical", expect_panels=True)
        self.assertIn("unpanelized-technical-scene", self.finding_codes(unpanelized))
        self.assertIn("untagged-semantic-node", self.finding_codes(unpanelized))

        malformed = scene()
        malformed["elements"].extend(
            [panel("panel-a-1", "a", -20), panel("panel-a-2", "a", 500)]
        )
        malformed["elements"][0]["customData"] = {"auditPanel": "ghost"}
        malformed["elements"][2]["customData"] = {"auditPanel": "a"}
        result = MODULE.audit_scene(malformed, mode="technical", expect_panels=True)

        self.assertIn("duplicate-panel-id", self.finding_codes(result))
        self.assertIn("unknown-panel-reference", self.finding_codes(result))
        self.assertIn("untagged-semantic-node", self.finding_codes(result))

    def test_panel_diagnostics_are_opt_in(self) -> None:
        result = MODULE.audit_scene(scene(), mode="technical")

        self.assertNotIn("unpanelized-technical-scene", self.finding_codes(result))
        self.assertNotIn("untagged-semantic-node", self.finding_codes(result))

    def test_feedback_arrow_stays_semantic_and_documents_dotted_style(self) -> None:
        feedback = arrow(
            "feedback",
            "node-0",
            "node-1",
            strokeStyle="dotted",
            customData={"auditRole": "feedback"},
        )

        result = MODULE.audit_scene(scene(arrows=[feedback]), mode="overview")

        self.assertEqual(1, result.metrics["semanticArrows"])
        self.assertEqual(0, result.metrics["annotationArrows"])
        self.assertNotIn("nonstandard-arrow-style", self.finding_codes(result))
        self.assertNotIn("unbound-semantic-arrow", self.finding_codes(result))

    def test_expect_panels_cli_option(self) -> None:
        completed = self.run_cli(
            json.dumps(scene()), "--mode", "technical", "--expect-panels"
        )

        self.assertEqual(3, completed.returncode)
        output = json.loads(completed.stdout)
        self.assertIn(
            "unpanelized-technical-scene",
            {finding["code"] for finding in output["findings"]},
        )

    def test_malformed_json_values_return_invalid_scene_finding(self) -> None:
        malformed_values = (
            [],
            {"type": "excalidraw", "elements": [42]},
            {"type": "excalidraw", "elements": [], "appState": []},
            {
                "type": "excalidraw",
                "elements": [
                    {"id": "node", "type": "rectangle", "boundElements": [None]}
                ],
            },
            {
                "type": "excalidraw",
                "elements": [{"id": "text", "type": "text", "fontSize": "large"}],
            },
            {
                "type": "excalidraw",
                "elements": [{"id": "arrow", "type": "arrow", "points": [[], []]}],
            },
            {
                "type": "excalidraw",
                "elements": [
                    {
                        "id": "arrow",
                        "type": "arrow",
                        "points": [["NaN", 0], [1, 2]],
                    }
                ],
            },
            {
                "type": "excalidraw",
                "elements": [
                    {"id": "node", "type": "rectangle", "width": float("inf")}
                ],
            },
            {
                "type": "excalidraw",
                "elements": [{"id": "node", "type": "rectangle", "x": True}],
            },
            {
                "type": "excalidraw",
                "elements": [
                    {
                        "id": "node",
                        "type": "rectangle",
                        "x": 1e308,
                        "width": 1e308,
                    }
                ],
            },
        )
        for malformed in malformed_values:
            with self.subTest(malformed=malformed):
                result = MODULE.audit_scene(malformed, mode="overview")
                self.assertTrue(result.has_errors)
                self.assertEqual({"invalid-scene"}, self.finding_codes(result))

    def test_cli_exit_and_json_contract(self) -> None:
        clean = self.run_cli(json.dumps(scene()))
        self.assertEqual(0, clean.returncode)
        self.assertEqual("pass", json.loads(clean.stdout)["status"])

        warning_scene = scene()
        warning_scene["appState"]["viewBackgroundColor"] = "#fff8e7"
        warning = self.run_cli(json.dumps(warning_scene))
        self.assertEqual(3, warning.returncode)
        self.assertEqual("review-required", json.loads(warning.stdout)["status"])

        error = self.run_cli(json.dumps(scene(node_count=10)))
        self.assertEqual(1, error.returncode)
        self.assertEqual("fail", json.loads(error.stdout)["status"])

        invalid_json = self.run_cli("{")
        self.assertEqual(2, invalid_json.returncode)
        self.assertEqual("fail", json.loads(invalid_json.stdout)["status"])

        malformed_scene = self.run_cli("[]")
        self.assertEqual(1, malformed_scene.returncode)
        self.assertEqual("fail", json.loads(malformed_scene.stdout)["status"])

        malformed_nested = self.run_cli(
            json.dumps({"type": "excalidraw", "elements": [], "appState": []})
        )
        self.assertEqual(1, malformed_nested.returncode)
        nested_output = json.loads(malformed_nested.stdout)
        self.assertEqual("fail", nested_output["status"])
        self.assertEqual("invalid-scene", nested_output["findings"][0]["code"])

        malformed_points = self.run_cli(
            json.dumps(
                {
                    "type": "excalidraw",
                    "elements": [{"id": "arrow", "type": "arrow", "points": [[], []]}],
                }
            )
        )
        self.assertEqual(1, malformed_points.returncode)
        points_output = json.loads(malformed_points.stdout)
        self.assertEqual("invalid-scene", points_output["findings"][0]["code"])

        nonfinite_points = self.run_cli(
            json.dumps(
                {
                    "type": "excalidraw",
                    "elements": [
                        {
                            "id": "arrow",
                            "type": "arrow",
                            "points": [["NaN", 0], [1, 2]],
                        }
                    ],
                }
            )
        )
        self.assertEqual(1, nonfinite_points.returncode)
        nonfinite_output = json.loads(nonfinite_points.stdout)
        self.assertEqual("invalid-scene", nonfinite_output["findings"][0]["code"])

        overflowing_geometry = self.run_cli(
            json.dumps(
                {
                    "type": "excalidraw",
                    "elements": [
                        {
                            "id": "node",
                            "type": "rectangle",
                            "x": 1e308,
                            "width": 1e308,
                        }
                    ],
                }
            )
        )
        self.assertEqual(1, overflowing_geometry.returncode)
        overflow_output = json.loads(overflowing_geometry.stdout)
        self.assertEqual("invalid-scene", overflow_output["findings"][0]["code"])


if __name__ == "__main__":
    unittest.main()
