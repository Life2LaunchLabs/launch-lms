#!/usr/bin/env python3
import os
import sys
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlmodel import SQLModel


API_DIR = Path(__file__).resolve().parents[1]
if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))


def resolve_database_url() -> str | None:
    return (
        os.environ.get("LAUNCHLMS_SQL_CONNECTION_STRING")
        or os.environ.get("DATABASE_URL")
    )


def main() -> int:
    database_url = resolve_database_url()
    if not database_url:
        print("Missing LAUNCHLMS_SQL_CONNECTION_STRING or DATABASE_URL.", file=sys.stderr)
        return 1

    # Importing the database module loads all models.
    from src.core.events import database as database_module  # noqa: WPS433

    engine = create_engine(database_url, pool_pre_ping=True)

    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            conn.commit()
    except Exception as exc:  # pragma: no cover - optional extension
        print(f"Warning: could not enable pgvector extension: {exc}", file=sys.stderr)

    SQLModel.metadata.create_all(engine)
    print("Fresh database schema bootstrapped from current models.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
