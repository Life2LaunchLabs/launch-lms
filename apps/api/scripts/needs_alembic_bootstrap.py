#!/usr/bin/env python3
import os
import sys

from sqlalchemy import create_engine, inspect, text


BOOTSTRAP_EXIT_CODE = 10
LEGACY_TABLES = {
    "activity",
    "course",
    "organization",
    "trail",
    "user",
}


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

    engine = create_engine(database_url, pool_pre_ping=True)

    with engine.connect() as connection:
        inspector = inspect(connection)
        table_names = set(inspector.get_table_names())

        has_alembic_version_table = "alembic_version" in table_names
        has_legacy_schema = bool(LEGACY_TABLES & table_names)

        if not has_legacy_schema:
            print("No legacy application schema detected; Alembic bootstrap not required.")
            return 0

        if not has_alembic_version_table:
            print("Legacy schema detected without alembic_version table.")
            return BOOTSTRAP_EXIT_CODE

        version_count = connection.execute(
            text("SELECT COUNT(*) FROM alembic_version")
        ).scalar_one()

        if version_count == 0:
            print("Legacy schema detected with empty alembic_version table.")
            return BOOTSTRAP_EXIT_CODE

        print("Existing Alembic version state detected; bootstrap not required.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
