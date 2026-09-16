#!/usr/bin/env python3
"""Run ESLint with a checked-in, shrinking legacy-debt baseline."""

from __future__ import annotations

import argparse
from collections import Counter
import json
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
BASELINE = ROOT / "docs" / "quality" / "frontend-lint-baseline.json"


def run_eslint() -> tuple[Counter[str], int]:
    result = subprocess.run(
        [str(WEB / "node_modules" / ".bin" / "eslint"), ".", "--format", "json"],
        cwd=WEB,
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode not in (0, 1):
        raise SystemExit(result.stderr or f"ESLint failed with exit code {result.returncode}")
    try:
        reports = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SystemExit(f"ESLint did not return valid JSON: {error}\n{result.stderr}") from error
    findings: Counter[str] = Counter()
    for report in reports:
        relative = str(Path(report["filePath"]).relative_to(WEB))
        for message in report["messages"]:
            rule = message.get("ruleId") or "fatal/parser"
            severity = "error" if message.get("severity") == 2 else "warning"
            findings[f"{relative}|{rule}|{severity}"] += 1
    return findings, result.returncode


def snapshot() -> None:
    findings, _ = run_eslint()
    payload = {
        "schema_version": 1,
        "policy": "Existing ESLint findings may not grow. New findings fail. Remove resolved entries.",
        "findings": dict(sorted(findings.items())),
    }
    BASELINE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Recorded {sum(findings.values())} ESLint findings across {len(findings)} file/rule entries")


def check() -> None:
    findings, _ = run_eslint()
    allowed = Counter(json.loads(BASELINE.read_text(encoding="utf-8"))["findings"])
    errors = []
    for key, count in findings.items():
        if count > allowed[key]:
            path, rule, severity = key.split("|")
            errors.append(f"{path}: {rule} {severity} count {count}, baseline {allowed[key]}")
    errors.extend(f"remove resolved baseline entry: {key}" for key in sorted(set(allowed) - set(findings)))
    if errors:
        raise SystemExit("Frontend lint ratchet failed:\n- " + "\n- ".join(errors))
    totals = Counter(key.rsplit("|", 1)[1] for key in findings for _ in range(findings[key]))
    print(f"Frontend lint valid: {totals['error']} known errors, {totals['warning']} known warnings; no growth")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=("snapshot", "check"))
    args = parser.parse_args()
    snapshot() if args.command == "snapshot" else check()


if __name__ == "__main__":
    main()
