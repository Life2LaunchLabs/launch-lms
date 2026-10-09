#!/usr/bin/env python3
"""Ratcheted dependency and implementation-taste checks."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import re


ROOT = Path(__file__).resolve().parents[1]
BASELINE = ROOT / "docs" / "quality" / "architecture-baseline.json"
RULES = {
    "api-db-imports-router": ("apps/api/src/db", (".py",), re.compile(r"(?:from|import)\s+(?:src\.)?routers")),
    "api-service-imports-router": ("apps/api/src/services", (".py",), re.compile(r"(?:from|import)\s+(?:src\.)?routers")),
    "web-service-imports-ui": ("apps/web/services", (".ts", ".tsx"), re.compile(r"from\s+['\"](?:@components|.*components/)")),
    "api-unstructured-print": ("apps/api/src", (".py",), re.compile(r"(?m)^\s*print\s*\(")),
    "web-unstructured-console": ("apps/web", (".ts", ".tsx"), re.compile(r"\bconsole\.(?:log|debug)\s*\(")),
    "component-direct-fetch": ("apps/web/components", (".ts", ".tsx"), re.compile(r"\bfetch\s*\(")),
    "component-direct-mui": ("apps/web/components", (".ts", ".tsx"), re.compile(r"from\s+['\"]@mui/")),
}
EXCLUDED = {"node_modules", ".next", "tests", "test", "fixtures", "generated", "__pycache__"}


def findings() -> dict[str, dict[str, int]]:
    result: dict[str, dict[str, int]] = {}
    for name, (root, suffixes, pattern) in RULES.items():
        matches = {}
        for path in (ROOT / root).rglob("*"):
            if not path.is_file() or path.suffix not in suffixes or set(path.relative_to(ROOT).parts) & EXCLUDED:
                continue
            count = len(pattern.findall(path.read_text(encoding="utf-8")))
            if count:
                matches[str(path.relative_to(ROOT))] = count
        result[name] = matches
    return result


def snapshot() -> None:
    payload = {
        "schema_version": 1,
        "policy": "Counts are debt ceilings, not approvals. New violations and growth fail.",
        "rules": findings(),
    }
    BASELINE.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Recorded {sum(len(value) for value in payload['rules'].values())} architecture debt entries")


def check() -> None:
    baseline = json.loads(BASELINE.read_text(encoding="utf-8"))["rules"]
    current = findings()
    errors = []
    for rule, matches in current.items():
        allowed = baseline.get(rule, {})
        for path, count in matches.items():
            if count > allowed.get(path, 0):
                errors.append(f"{rule}: {path} has {count} violation(s), baseline {allowed.get(path, 0)}")
        errors.extend(f"{rule}: remove resolved baseline entry {path}" for path in sorted(set(allowed) - set(matches)))
    if errors:
        raise SystemExit("Architecture policy failed:\n- " + "\n- ".join(errors))
    print(f"Architecture policy valid: {sum(len(value) for value in baseline.values())} debt entries")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("snapshot", "check"))
    args = parser.parse_args()
    snapshot() if args.command == "snapshot" else check()


if __name__ == "__main__":
    main()
