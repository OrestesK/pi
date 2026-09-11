#!/usr/bin/env python3
"""Perform non-authoritative structural validation of a local Pi skill."""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence
from urllib.parse import unquote, urlsplit

NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]*\]\(([^)\n]+)\)")
REFERENCE_DEFINITION_PATTERN = re.compile(r"^ {0,3}\[[^\]\n]+\]:[ \t]*(\S.*)$")
FENCE_PATTERN = re.compile(r"^ {0,3}(`{3,}|~{3,})")
INLINE_CODE_PATTERN = re.compile(r"`+[^`\n]*`+")
MAX_NAME_LENGTH = 64
MAX_DESCRIPTION_LENGTH = 1024
ROOT_LINE_RECOMMENDATION = 500

Severity = Literal["error", "warning"]


@dataclass(frozen=True)
class ValidationIssue:
    severity: Severity
    code: str
    message: str


@dataclass(frozen=True)
class ValidationResult:
    skill_root: Path
    issues: tuple[ValidationIssue, ...]

    @property
    def errors(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity == "error")

    @property
    def warnings(self) -> tuple[ValidationIssue, ...]:
        return tuple(issue for issue in self.issues if issue.severity == "warning")


class FrontmatterError(ValueError):
    """Raised when SKILL.md does not contain a valid frontmatter envelope."""


class YqExecutionError(RuntimeError):
    """Raised when the required yq executable cannot run."""


def _extract_frontmatter(content: str) -> str:
    lines = content.splitlines()
    if not lines or lines[0] != "---":
        raise FrontmatterError("SKILL.md must start with a '---' frontmatter fence")

    try:
        closing_index = lines.index("---", 1)
    except ValueError as error:
        raise FrontmatterError(
            "SKILL.md is missing the closing '---' frontmatter fence"
        ) from error

    frontmatter = "\n".join(lines[1:closing_index]).strip()
    if not frontmatter:
        raise FrontmatterError("SKILL.md frontmatter must not be empty")
    return frontmatter


def _parse_frontmatter(
    frontmatter: str, yq_path: str
) -> tuple[dict[str, object] | None, str | None]:
    try:
        completed = subprocess.run(
            [yq_path, "-c", "."],
            input=frontmatter,
            text=True,
            capture_output=True,
            check=False,
        )
    except OSError as error:
        raise YqExecutionError(f"could not execute yq: {error}") from error

    if completed.returncode != 0:
        diagnostic = (
            completed.stderr.strip()
            or completed.stdout.strip()
            or "unknown parse error"
        )
        return None, f"yq rejected the frontmatter: {diagnostic}"

    try:
        parsed = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        return None, f"yq did not return JSON: {error.msg}"

    if not isinstance(parsed, dict):
        return None, "frontmatter must be a YAML mapping"
    return parsed, None


def _markdown_target(raw_target: str) -> str:
    target = raw_target.strip()
    if target.startswith("<") and ">" in target:
        return target[1 : target.index(">")]
    return target.split(maxsplit=1)[0] if target else ""


def _markdown_targets(content: str) -> list[str]:
    targets: list[str] = []
    fence_character: str | None = None
    fence_length = 0

    for line in content.splitlines():
        fence_match = FENCE_PATTERN.match(line)
        if fence_match is not None:
            marker = fence_match.group(1)
            if fence_character is None:
                fence_character = marker[0]
                fence_length = len(marker)
            elif marker[0] == fence_character and len(marker) >= fence_length:
                fence_character = None
                fence_length = 0
            continue

        if fence_character is not None or line.startswith(("    ", "\t")):
            continue

        prose = INLINE_CODE_PATTERN.sub("", line)
        targets.extend(MARKDOWN_LINK_PATTERN.findall(prose))
        definition = REFERENCE_DEFINITION_PATTERN.match(prose)
        if definition is not None:
            targets.append(definition.group(1))

    return targets


def _reference_issues(skill_root: Path) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    root = skill_root.resolve(strict=False)

    for source in sorted(skill_root.rglob("*.md")):
        try:
            content = source.read_text(encoding="utf-8")
        except OSError as error:
            issues.append(
                ValidationIssue(
                    "error",
                    "reference.source-unreadable",
                    f"cannot read {source}: {error}",
                )
            )
            continue

        for raw_target in _markdown_targets(content):
            target = _markdown_target(raw_target)
            if not target or target.startswith("#"):
                continue

            parsed = urlsplit(target)
            if parsed.scheme or parsed.netloc:
                continue

            path_text = unquote(parsed.path)
            if not path_text or Path(path_text).suffix.lower() != ".md":
                continue

            target_path = Path(path_text)
            if target_path.is_absolute():
                issues.append(
                    ValidationIssue(
                        "error",
                        "reference.absolute",
                        f"{source.relative_to(skill_root)} links to absolute Markdown path {path_text!r}",
                    )
                )
                continue

            candidate = (source.parent / target_path).resolve(strict=False)
            if not candidate.is_relative_to(root):
                issues.append(
                    ValidationIssue(
                        "error",
                        "reference.escapes-root",
                        f"{source.relative_to(skill_root)} links outside the skill root: {path_text!r}",
                    )
                )
                continue

            if not candidate.is_file():
                issues.append(
                    ValidationIssue(
                        "error",
                        "reference.missing",
                        f"{source.relative_to(skill_root)} links to missing Markdown file {path_text!r}",
                    )
                )

    return issues


def validate_skill(skill_dir: str | Path) -> ValidationResult:
    skill_root = Path(skill_dir).expanduser().resolve(strict=False)
    issues: list[ValidationIssue] = []

    if not skill_root.is_dir():
        return ValidationResult(
            skill_root,
            (
                ValidationIssue(
                    "error",
                    "skill-root.missing",
                    f"skill directory does not exist: {skill_root}",
                ),
            ),
        )

    skill_file = skill_root / "SKILL.md"
    if not skill_file.is_file():
        return ValidationResult(
            skill_root,
            (
                ValidationIssue(
                    "error",
                    "skill-file.missing",
                    f"missing required file: {skill_file}",
                ),
            ),
        )

    try:
        content = skill_file.read_text(encoding="utf-8")
    except OSError as error:
        return ValidationResult(
            skill_root,
            (
                ValidationIssue(
                    "error",
                    "skill-file.unreadable",
                    f"cannot read {skill_file}: {error}",
                ),
            ),
        )

    line_count = len(content.splitlines())
    if line_count > ROOT_LINE_RECOMMENDATION:
        issues.append(
            ValidationIssue(
                "warning",
                "skill-file.large-root",
                f"SKILL.md has {line_count} lines; consider moving optional detail into references",
            )
        )

    try:
        frontmatter_text = _extract_frontmatter(content)
    except FrontmatterError as error:
        issues.append(ValidationIssue("error", "frontmatter.fence", str(error)))
        issues.extend(_reference_issues(skill_root))
        return ValidationResult(skill_root, tuple(issues))

    yq_path = shutil.which("yq")
    if yq_path is None:
        issues.append(
            ValidationIssue(
                "error",
                "dependency.yq-missing",
                "yq is required for local YAML frontmatter parsing but was not found on PATH",
            )
        )
        issues.extend(_reference_issues(skill_root))
        return ValidationResult(skill_root, tuple(issues))

    try:
        frontmatter, parse_error = _parse_frontmatter(frontmatter_text, yq_path)
    except YqExecutionError as error:
        issues.append(ValidationIssue("error", "dependency.yq-execution", str(error)))
        frontmatter = None
        parse_error = None

    if parse_error is not None:
        issues.append(ValidationIssue("error", "frontmatter.invalid-yaml", parse_error))
    elif frontmatter is not None:
        name = frontmatter.get("name")
        if not isinstance(name, str) or not name:
            issues.append(
                ValidationIssue(
                    "error",
                    "frontmatter.name-missing",
                    "frontmatter name must be a nonempty string",
                )
            )
        else:
            if len(name) > MAX_NAME_LENGTH:
                issues.append(
                    ValidationIssue(
                        "error",
                        "frontmatter.name-too-long",
                        f"frontmatter name has {len(name)} characters; maximum is {MAX_NAME_LENGTH}",
                    )
                )
            if NAME_PATTERN.fullmatch(name) is None:
                issues.append(
                    ValidationIssue(
                        "error",
                        "frontmatter.name-invalid",
                        "frontmatter name must use lowercase letters, digits, and single hyphens",
                    )
                )
            if name != skill_root.name:
                issues.append(
                    ValidationIssue(
                        "warning",
                        "frontmatter.directory-mismatch",
                        f"frontmatter name {name!r} differs from parent directory {skill_root.name!r}; Pi permits this",
                    )
                )

        description = frontmatter.get("description")
        if not isinstance(description, str) or not description.strip():
            issues.append(
                ValidationIssue(
                    "error",
                    "frontmatter.description-missing",
                    "frontmatter description must be a nonempty string",
                )
            )
        elif len(description) > MAX_DESCRIPTION_LENGTH:
            issues.append(
                ValidationIssue(
                    "error",
                    "frontmatter.description-too-long",
                    f"frontmatter description has {len(description)} characters; maximum is {MAX_DESCRIPTION_LENGTH}",
                )
            )

    issues.extend(_reference_issues(skill_root))
    return ValidationResult(skill_root, tuple(issues))


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "skill_dir", help="Path to the skill directory containing SKILL.md"
    )
    return parser


def _print_result(result: ValidationResult) -> None:
    for issue in result.issues:
        print(f"{issue.severity.upper()} [{issue.code}] {issue.message}")

    if not result.errors:
        print(
            f"VALID {result.skill_root} "
            f"({len(result.warnings)} warning{'s' if len(result.warnings) != 1 else ''})"
        )


def main(argv: Sequence[str] | None = None) -> int:
    args = _build_parser().parse_args(argv)
    result = validate_skill(args.skill_dir)
    _print_result(result)

    if any(issue.code.startswith("dependency.yq-") for issue in result.errors):
        return 2
    return 1 if result.errors else 0


if __name__ == "__main__":
    sys.exit(main())
