#!/usr/bin/env python3
"""Learner pages load no analytics, ads, tracking, or third-party scripts, styles and fonts (DEV-26).

Fails when web source names a known analytics, ad, tracking or hosted-font service, or loads a
script, stylesheet or font from a literal outside URL. The browser check
apps/web/tests/ui/third-party-requests.spec.ts watches the real requests; this one catches the
code before it ships.
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps" / "web"
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".css", ".html"}
EXCLUDED = {"node_modules", ".next", ".next-ui-test", "tests", "test-results", "playwright-report", "__snapshots__"}

TRACKERS = re.compile(
    r"umami\.is|/umami/|google-analytics\.com|googletagmanager\.com|doubleclick\.net|"
    r"fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.segment\.(?:com|io)|static\.hotjar\.com|"
    r"cdn\.mxpnl\.com|mixpanel\.com|posthog\.com|plausible\.io|clarity\.ms|connect\.facebook\.net|"
    r"cdn\.amplitude\.com|fullstory\.com|heapanalytics\.com|widget\.intercom\.io",
    re.I,
)
OUTSIDE_LOADS = (
    re.compile(r"<script\b[^>]*\bsrc=[\"'{`]*https?://", re.I),
    re.compile(r"<link\b[^>]*\bhref=[\"'{`]*https?://", re.I),
    re.compile(r"@import\s+(?:url\()?[\"']?https?://", re.I),
    re.compile(r"@font-face[^}]*url\([\"']?https?://", re.I | re.S),
    re.compile(r"\.src\s*=\s*[\"'`]https?://", re.I),
)


def files() -> list[Path]:
    found = []
    for directory, directories, names in os.walk(WEB):
        directories[:] = [name for name in directories if name not in EXCLUDED]
        for name in names:
            path = Path(directory) / name
            if path.suffix in EXTENSIONS and not name.endswith((".spec.ts", ".test.ts", ".test.tsx")):
                found.append(path)
    return sorted(found)


def problems() -> list[str]:
    result = []
    for path in files():
        text = path.read_text(encoding="utf-8", errors="ignore")
        relative = path.relative_to(ROOT)
        for match in TRACKERS.finditer(text):
            line = text.count("\n", 0, match.start()) + 1
            result.append(f"{relative}:{line}: names an analytics, tracking or hosted-font service ({match.group(0)})")
        for pattern in OUTSIDE_LOADS:
            for match in pattern.finditer(text):
                line = text.count("\n", 0, match.start()) + 1
                result.append(f"{relative}:{line}: loads a script, stylesheet or font from an outside address")
    return result


def main() -> int:
    found = problems()
    if found:
        print("Learner pages must not load tracking or outside scripts, styles or fonts (DEV-26):", file=sys.stderr)
        for problem in found:
            print(f"  {problem}", file=sys.stderr)
        print("Serve it from our own domain (fonts: @fontsource in apps/web/styles/fonts.ts).", file=sys.stderr)
        return 1
    print("third-party check: no tracking or outside scripts, styles or fonts in web source.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
