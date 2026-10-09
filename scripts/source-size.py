#!/usr/bin/env python3
"""Ratcheted 500-line limit for production source files."""

from __future__ import annotations

import argparse
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "docs" / "quality" / "source-size-baseline.json"
ROOTS = (ROOT / "apps" / "api" / "src", ROOT / "apps" / "web")
EXTENSIONS = {".py", ".js", ".jsx", ".ts", ".tsx"}
EXCLUDED_PARTS = {
    ".next", ".next-ui-test", "node_modules", "migrations", "tests", "test", "fixtures", "generated",
    "playwright-report", "test-results", "__snapshots__", "__pycache__",
}


def source_files() -> list[Path]:
    result = []
    for source_root in ROOTS:
        for path in source_root.rglob("*"):
            relative_parts = set(path.relative_to(ROOT).parts)
            if path.is_file() and path.suffix in EXTENSIONS and not relative_parts.intersection(EXCLUDED_PARTS):
                if not path.name.endswith((".test.ts", ".test.tsx", ".spec.ts", ".spec.tsx")):
                    result.append(path)
    return sorted(result)


def line_counts() -> dict[str, int]:
    return {
        str(path.relative_to(ROOT)): len(path.read_text(encoding="utf-8").splitlines())
        for path in source_files()
    }


def snapshot() -> None:
    oversized = {path: lines for path, lines in line_counts().items() if lines > 500}
    payload = {
        "schema_version": 1,
        "policy": "Existing production files over 500 lines may not grow; new production files are limited to 500 lines.",
        "files": oversized,
    }
    BASELINE.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Recorded {len(oversized)} existing oversized production files")


def check() -> None:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    allowed = baseline["files"]
    current = line_counts()
    errors = []
    for path, lines in current.items():
        limit = allowed.get(path, 500)
        if lines > limit:
            qualifier = "new/unbaselined" if path not in allowed else f"baseline {limit}"
            errors.append(f"{path}: {lines} lines ({qualifier})")
    errors.extend(f"remove obsolete baseline entry: {path}" for path in sorted(set(allowed) - set(current)))
    if errors:
        raise SystemExit("Source-size policy failed:\n- " + "\n- ".join(errors))
    loose = [path for path, limit in allowed.items() if path in current and current[path] < limit]
    hint = f"; {len(loose)} can be tightened (run: python3 scripts/source-size.py tighten)" if loose else ""
    print(f"Source-size policy valid: {len(allowed)} grandfathered files{hint}")


def tighten() -> None:
    """Lock in shrinkage: lower each grandfathered limit to the file's current size."""
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
    current = line_counts()
    files = {
        path: min(limit, current[path])
        for path, limit in baseline["files"].items()
        if path in current and current[path] > 500
    }
    dropped = len(baseline["files"]) - len(files)
    lowered = sum(1 for path, limit in files.items() if limit < baseline["files"][path])
    baseline["files"] = files
    BASELINE.write_text(json.dumps(baseline, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Tightened {lowered} limits and released {dropped} files now within 500 lines")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("snapshot", "check", "tighten"))
    args = parser.parse_args()
    {"snapshot": snapshot, "check": check, "tighten": tighten}[args.command]()


if __name__ == "__main__":
    main()
