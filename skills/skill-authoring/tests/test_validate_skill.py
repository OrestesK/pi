from __future__ import annotations

import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Protocol
from unittest import mock

MODULE_PATH = Path(__file__).parents[1] / "scripts" / "validate_skill.py"
SPEC = importlib.util.spec_from_file_location("skill_authoring_validator", MODULE_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"cannot load validator module from {MODULE_PATH}")
validator = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = validator
SPEC.loader.exec_module(validator)


class IssueLike(Protocol):
    code: str


class ResultLike(Protocol):
    issues: tuple[IssueLike, ...]


class ValidateSkillTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)
        self.root = Path(self.temp_dir.name)

    def write_skill(
        self,
        name: str = "example-skill",
        description: str = "Validate an example skill. Use for validator tests.",
        body: str = "# Example Skill\n",
        directory: str | None = None,
    ) -> Path:
        skill_root = self.root / (directory or name)
        skill_root.mkdir(parents=True)
        (skill_root / "SKILL.md").write_text(
            f"---\nname: {name}\ndescription: {description}\n---\n\n{body}",
            encoding="utf-8",
        )
        return skill_root

    @staticmethod
    def issue_codes(result: ResultLike) -> set[str]:
        return {issue.code for issue in result.issues}

    def test_valid_package_with_existing_reference_has_no_issues(self) -> None:
        skill_root = self.write_skill(
            body="# Example Skill\n\nSee [details](references/details.md).\n"
        )
        references = skill_root / "references"
        references.mkdir()
        (references / "details.md").write_text("# Details\n", encoding="utf-8")

        result = validator.validate_skill(skill_root)

        self.assertEqual(result.errors, ())
        self.assertEqual(result.warnings, ())

    def test_rejects_missing_and_malformed_frontmatter(self) -> None:
        missing_root = self.root / "missing-frontmatter"
        missing_root.mkdir()
        (missing_root / "SKILL.md").write_text("# Missing\n", encoding="utf-8")
        malformed_root = self.root / "malformed-frontmatter"
        malformed_root.mkdir()
        (malformed_root / "SKILL.md").write_text(
            "---\nname: [broken\ndescription: invalid\n---\n# Broken\n",
            encoding="utf-8",
        )

        missing = validator.validate_skill(missing_root)
        malformed = validator.validate_skill(malformed_root)

        self.assertIn("frontmatter.fence", self.issue_codes(missing))
        self.assertIn("frontmatter.invalid-yaml", self.issue_codes(malformed))

    def test_rejects_missing_and_root_escaping_markdown_references(self) -> None:
        skill_root = self.write_skill(
            body=(
                "# Example Skill\n\n"
                "See [missing](references/missing.md).\n"
                "See [outside](../outside.md).\n"
            )
        )

        result = validator.validate_skill(skill_root)

        self.assertIn("reference.missing", self.issue_codes(result))
        self.assertIn("reference.escapes-root", self.issue_codes(result))

    def test_rejects_missing_and_escaping_reference_style_links(self) -> None:
        skill_root = self.write_skill(
            body=(
                "# Example Skill\n\n"
                "See [missing][missing-reference].\n"
                "See [outside][outside-reference].\n\n"
                "[missing-reference]: references/missing.md\n"
                "[outside-reference]: ../outside.md\n"
            )
        )

        result = validator.validate_skill(skill_root)

        self.assertIn("reference.missing", self.issue_codes(result))
        self.assertIn("reference.escapes-root", self.issue_codes(result))

    def test_ignores_link_examples_in_code(self) -> None:
        skill_root = self.write_skill(
            body=(
                "# Example Skill\n\n"
                "```markdown\n"
                "[outside][target]\n"
                "[target]: ../outside.md\n"
                "```\n\n"
                "`[inline](../outside.md)`\n"
            )
        )

        result = validator.validate_skill(skill_root)

        self.assertEqual(result.issues, ())

    def test_rejects_name_and_description_over_standard_limits(self) -> None:
        name = "a" * 65
        description = "d" * 1025
        skill_root = self.write_skill(name=name, description=description)

        result = validator.validate_skill(skill_root)

        self.assertIn("frontmatter.name-too-long", self.issue_codes(result))
        self.assertIn("frontmatter.description-too-long", self.issue_codes(result))

    def test_warns_for_directory_mismatch_and_large_root(self) -> None:
        body = "# Example Skill\n" + "detail\n" * 500
        skill_root = self.write_skill(directory="different-directory", body=body)

        result = validator.validate_skill(skill_root)

        self.assertEqual(result.errors, ())
        self.assertIn("frontmatter.directory-mismatch", self.issue_codes(result))
        self.assertIn("skill-file.large-root", self.issue_codes(result))

    def test_reports_missing_yq_as_dependency_error(self) -> None:
        skill_root = self.write_skill()

        with mock.patch.object(validator.shutil, "which", return_value=None):
            result = validator.validate_skill(skill_root)

        self.assertEqual(
            {issue.code for issue in result.errors}, {"dependency.yq-missing"}
        )

    def test_reports_unexecutable_yq_as_dependency_error(self) -> None:
        skill_root = self.write_skill()

        with (
            mock.patch.object(validator.shutil, "which", return_value="/broken/yq"),
            mock.patch.object(
                validator.subprocess,
                "run",
                side_effect=PermissionError("permission denied"),
            ),
            mock.patch("builtins.print"),
        ):
            result = validator.validate_skill(skill_root)
            exit_code = validator.main([str(skill_root)])

        self.assertEqual(
            {issue.code for issue in result.errors}, {"dependency.yq-execution"}
        )
        self.assertEqual(exit_code, 2)

    def test_main_returns_success_and_validation_error_exit_codes(self) -> None:
        valid_root = self.write_skill()
        invalid_root = self.root / "invalid"
        invalid_root.mkdir()
        (invalid_root / "SKILL.md").write_text(
            "# Missing frontmatter\n", encoding="utf-8"
        )

        with mock.patch("builtins.print"):
            valid_exit = validator.main([str(valid_root)])
            invalid_exit = validator.main([str(invalid_root)])

        self.assertEqual(valid_exit, 0)
        self.assertEqual(invalid_exit, 1)

    def test_main_returns_dependency_exit_code_when_yq_is_missing(self) -> None:
        skill_root = self.write_skill()

        with (
            mock.patch.object(validator.shutil, "which", return_value=None),
            mock.patch("builtins.print"),
        ):
            exit_code = validator.main([str(skill_root)])

        self.assertEqual(exit_code, 2)


if __name__ == "__main__":
    unittest.main()
