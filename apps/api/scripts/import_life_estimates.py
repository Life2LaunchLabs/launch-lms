#!/usr/bin/env python3
"""Load an official HUD Fair Market Rent or BLS OEWS file into life plan estimates.

The same importers as POST /api/v1/life/admin/import, run straight against the
database. Use it for files too big or too slow for an upload (the OEWS all-data
workbook takes minutes to read). Facts land as drafts; review the source in the
app (or with --review) before learners see them.

    uv run python scripts/import_life_estimates.py hud_fmr FY26_FMRs.xlsx --year 2026 --url https://www.huduser.gov/...
    uv run python scripts/import_life_estimates.py bls_oews all_data_M_2024.xlsx --year 2024 --url https://www.bls.gov/... --dry-run
"""

import argparse
import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from sqlmodel import Session  # noqa: E402

from src.core.events.database import engine  # noqa: E402
from src.services.life_plans import importers  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("kind", choices=["hud_fmr", "bls_oews"])
    parser.add_argument("file", type=Path, help="The publisher's .xlsx or .csv, unchanged")
    parser.add_argument("--year", type=int, required=True, help="HUD fiscal year, or the OEWS May reference year")
    parser.add_argument("--url", required=True, help="Where the file was downloaded from")
    parser.add_argument("--dry-run", action="store_true", help="Parse and count, then roll back")
    parser.add_argument("--review", type=int, metavar="USER_ID", help="Also mark the source reviewed by this user id")
    args = parser.parse_args()

    data = args.file.read_bytes()
    with Session(engine) as db:
        if args.dry_run:
            # The importers commit; keep everything inside one outer transaction and undo it.
            db.commit = db.flush  # type: ignore[method-assign]
        try:
            if args.kind == "hud_fmr":
                result = importers.import_hud_fmr(db, data, args.file.name, fiscal_year=args.year, url=args.url)
            else:
                result = importers.import_bls_oews(db, data, args.file.name, year=args.year, url=args.url)
            if args.review and not args.dry_run:
                result["reviewed"] = importers.review_source(db, result["source"], args.review)
        except importers.ImportProblem as exc:
            sys.exit(f"Not imported: {exc}")
        if args.dry_run:
            db.rollback()
            result["dry_run"] = True
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
