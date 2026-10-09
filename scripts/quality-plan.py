#!/usr/bin/env python3
"""Classify a change into the checks required by the quality gate."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
FULL_MARKERS = (
    ".github/workflows/", "Dockerfile", "docker-compose", "apps/api/alembic/",
    "apps/api/src/auth", "apps/api/src/security", "apps/web/services/auth",
    "apps/web/middleware", "scripts/ci/", "scripts/docs/deployment", "deploy/",
)
DEPENDENCY_FILES = {
    "apps/api/pyproject.toml", "apps/api/uv.lock", "apps/web/package.json",
    "apps/web/bun.lock", "package.json", "bun.lock", "uv.lock",
}


def changes(base: str, head: str) -> list[str]:
    merge_base = subprocess.check_output(
        ["git", "merge-base", base, head], cwd=ROOT, text=True
    ).strip()
    output = subprocess.check_output(
        ["git", "diff", "--name-only", merge_base, head], cwd=ROOT, text=True
    )
    return [line for line in output.splitlines() if line]


def classify(paths: list[str]) -> dict[str, object]:
    full = any(path in DEPENDENCY_FILES or path.startswith(FULL_MARKERS) for path in paths)
    api = full or any(path.startswith("apps/api/") for path in paths)
    web = full or any(path.startswith("apps/web/") for path in paths)
    browser = full or any(
        path.startswith(("apps/web/app/", "apps/web/components/", "apps/web/tests/ui/"))
        for path in paths
    )
    docs_only = bool(paths) and all(
        path.endswith(".md") or path.startswith("docs/") or path.startswith("scripts/product-map.py")
        or path.startswith("scripts/validate-docs.py") or path.startswith("scripts/source-size.py")
        for path in paths
    )
    return {"api": api, "web": web, "browser": browser, "full": full, "docs_only": docs_only, "files": paths}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("base")
    parser.add_argument("head", nargs="?", default="HEAD")
    parser.add_argument("--github-output", type=Path)
    args = parser.parse_args()
    plan = classify(changes(args.base, args.head))
    if args.github_output:
        with args.github_output.open("a", encoding="utf-8") as output:
            for key in ("api", "web", "browser", "full", "docs_only"):
                output.write(f"{key}={str(plan[key]).lower()}\n")
            output.write("files=" + json.dumps(plan["files"], separators=(",", ":")) + "\n")
    print(json.dumps(plan, indent=2))


if __name__ == "__main__":
    main()
