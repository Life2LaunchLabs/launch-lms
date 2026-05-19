#!/usr/bin/env python3
from __future__ import annotations

import argparse
from collections import defaultdict, deque
from dataclasses import dataclass
from typing import Any

from sqlalchemy import MetaData, Table, create_engine, func, select
from sqlalchemy.dialects.postgresql import insert


SKIP_TABLES = {"alembic_version"}


@dataclass
class ImportStats:
    copied: int = 0
    skipped_fk: int = 0
    skipped_error: int = 0


def _copyable_tables(source_metadata: MetaData, target_metadata: MetaData) -> list[str]:
    table_names = sorted(set(source_metadata.tables) & set(target_metadata.tables) - SKIP_TABLES)
    copyable: list[str] = []

    for table_name in table_names:
        source_table = source_metadata.tables[table_name]
        target_table = target_metadata.tables[table_name]
        source_columns = {column.name for column in source_table.columns}

        missing_required = [
            column.name
            for column in target_table.columns
            if (
                column.name not in source_columns
                and not column.nullable
                and column.default is None
                and column.server_default is None
                and not column.autoincrement
                and not getattr(column, "identity", None)
            )
        ]
        if missing_required:
            print(f"skip {table_name}: missing required target columns {', '.join(missing_required)}")
            continue

        copyable.append(table_name)

    return copyable


def _copy_order(target_metadata: MetaData, table_names: list[str]) -> list[str]:
    remaining = set(table_names)
    dependencies: dict[str, set[str]] = {table_name: set() for table_name in table_names}
    dependents: dict[str, set[str]] = defaultdict(set)

    for table_name in table_names:
        table = target_metadata.tables[table_name]
        for foreign_key in table.foreign_keys:
            referred_table = foreign_key.column.table.name
            if referred_table in remaining and referred_table != table_name:
                dependencies[table_name].add(referred_table)
                dependents[referred_table].add(table_name)

    ready = deque(sorted(table_name for table_name, deps in dependencies.items() if not deps))
    ordered: list[str] = []

    while ready:
        table_name = ready.popleft()
        ordered.append(table_name)
        remaining.discard(table_name)

        for dependent in sorted(dependents[table_name]):
            dependencies[dependent].discard(table_name)
            if not dependencies[dependent] and dependent in remaining:
                ready.append(dependent)

    ordered.extend(sorted(remaining))
    return ordered


def _target_has_rows(connection: Any, table: Table) -> bool:
    return bool(connection.execute(select(func.count()).select_from(table)).scalar_one())


def _row_satisfies_foreign_keys(target_connection: Any, table: Table, row: dict[str, Any]) -> bool:
    for constraint in table.foreign_key_constraints:
        local_columns = [column.name for column in constraint.columns]
        if not all(column in row for column in local_columns):
            continue

        local_values = [row[column] for column in local_columns]
        if any(value is None for value in local_values):
            continue

        remote_columns = list(constraint.elements)
        remote_table = remote_columns[0].column.table
        query = select(remote_table).limit(1)
        for element, value in zip(remote_columns, local_values):
            query = query.where(element.column == value)

        if target_connection.execute(query).first() is None:
            return False

    return True


def _copy_table(source_connection: Any, target_connection: Any, source_table: Table, target_table: Table) -> ImportStats:
    stats = ImportStats()
    common_columns = [
        column.name
        for column in target_table.columns
        if column.name in source_table.columns
    ]

    if not common_columns:
        return stats

    source_rows = source_connection.execute(
        select(*(source_table.columns[column] for column in common_columns))
    )

    for source_row in source_rows:
        row = dict(source_row._mapping)
        if not _row_satisfies_foreign_keys(target_connection, target_table, row):
            stats.skipped_fk += 1
            continue

        try:
            result = target_connection.execute(
                insert(target_table).values(row).on_conflict_do_nothing()
            )
            stats.copied += result.rowcount or 0
        except Exception:
            target_connection.rollback()
            stats.skipped_error += 1

    target_connection.commit()
    return stats


def import_compatible_data(source_url: str, target_url: str) -> None:
    source_engine = create_engine(source_url, pool_pre_ping=True)
    target_engine = create_engine(target_url, pool_pre_ping=True)
    source_metadata = MetaData()
    target_metadata = MetaData()

    source_metadata.reflect(source_engine)
    target_metadata.reflect(target_engine)

    table_names = _copy_order(target_metadata, _copyable_tables(source_metadata, target_metadata))
    copied_total = 0
    skipped_fk_total = 0
    skipped_error_total = 0

    with source_engine.connect() as source_connection, target_engine.connect() as target_connection:
        for table_name in table_names:
            source_table = source_metadata.tables[table_name]
            target_table = target_metadata.tables[table_name]

            if _target_has_rows(target_connection, target_table):
                print(f"skip {table_name}: target already has rows")
                continue

            stats = _copy_table(source_connection, target_connection, source_table, target_table)
            copied_total += stats.copied
            skipped_fk_total += stats.skipped_fk
            skipped_error_total += stats.skipped_error

            if stats.copied or stats.skipped_fk or stats.skipped_error:
                print(
                    f"{table_name}: copied={stats.copied} "
                    f"skipped_fk={stats.skipped_fk} skipped_error={stats.skipped_error}"
                )

    print(
        "compatible import complete: "
        f"copied={copied_total} skipped_fk={skipped_fk_total} skipped_error={skipped_error_total}"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Import compatible rows between Launch LMS dev databases.")
    parser.add_argument("--source-url", required=True)
    parser.add_argument("--target-url", required=True)
    args = parser.parse_args()

    import_compatible_data(args.source_url, args.target_url)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
