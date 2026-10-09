#!/usr/bin/env python3
"""Validate local Markdown links and repository documentation entry points."""

from __future__ import annotations

from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "AGENTS.md", "WORKFLOW.md", "ARCHITECTURE.md", "docs/product/README.md",
    "docs/design/README.md", "docs/quality/README.md", "docs/security/README.md",
    "docs/reliability/README.md", "docs/plans/README.md",
]
LINK = re.compile(r"\[[^]]+\]\(([^)]+)\)")


def main() -> None:
    errors: list[str] = []
    for value in REQUIRED:
        if not (ROOT / value).is_file():
            errors.append(f"missing required document: {value}")
    documents = [ROOT / "AGENTS.md", ROOT / "WORKFLOW.md", ROOT / "ARCHITECTURE.md"]
    documents += list((ROOT / "docs").rglob("*.md"))
    for document in documents:
        for target in LINK.findall(document.read_text(encoding="utf-8")):
            if target.startswith(("http://", "https://", "#", "mailto:")):
                continue
            path = target.split("#", 1)[0]
            if path and not (document.parent / path).resolve().exists():
                errors.append(f"{document.relative_to(ROOT)}: missing link target {target}")
    if errors:
        raise SystemExit("Documentation validation failed:\n- " + "\n- ".join(errors))
    print(f"Documentation valid: {len(documents)} Markdown files")


if __name__ == "__main__":
    main()
