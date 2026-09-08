#!/usr/bin/env python3
"""Refresh resource search documents and missing local embeddings."""

import argparse
import asyncio
import json
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

from sqlmodel import Session, select  # noqa: E402

from src.core.events.database import engine  # noqa: E402
from src.db.organizations import Organization  # noqa: E402
from src.services.search.resource_search import backfill_resource_search_documents  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--org-id", type=int, help="Backfill one organization; defaults to all organizations")
    args = parser.parse_args()
    with Session(engine) as db_session:
        org_ids = [args.org_id] if args.org_id else list(db_session.exec(select(Organization.id)).all())

    summaries = {}
    for org_id in org_ids:
        summaries[str(org_id)] = await backfill_resource_search_documents(org_id)
    print(json.dumps(summaries, sort_keys=True))


if __name__ == "__main__":
    asyncio.run(main())
