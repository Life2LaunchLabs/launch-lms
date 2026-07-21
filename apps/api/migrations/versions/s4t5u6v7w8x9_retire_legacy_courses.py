"""Retire the legacy course schema and rename stored badge capabilities.

Revision ID: s4t5u6v7w8x9
Revises: r3s4t5u6v7w8
"""

from __future__ import annotations

import copy

from alembic import op
import sqlalchemy as sa


revision = "s4t5u6v7w8x9"
down_revision = "r3s4t5u6v7w8"
branch_labels = None
depends_on = None


RIGHT_KEYS = {
    "courses": "badges",
    "collections": "badge_collections",
    "activities": "learning_activities",
}
REMOVED_RIGHT_KEYS = {"coursechapters", "assignments", "certifications"}
FEATURE_KEYS = {"courses": "badges", "collections": "badge_collections"}
REMOVED_FEATURE_KEYS = {"assignments", "certifications"}

DROP_TABLE_ORDER = (
    "quizresult",
    "quizanswer",
    "quizattempt",
    "assignmenttasksubmission",
    "assignmentusersubmission",
    "assignmenttask",
    "certificateuser",
    "certifications",
    "activityversion",
    "block",
    "courseupdate",
    "course_embedding",
    "chapteractivity",
    "coursechapter",
    "collectioncourse",
    "paymentscourse",
    "trailstep",
    "trailrun",
    "assignment",
    "trail",
    "activity",
    "chapter",
    # Course owns the FK to collection, so it must be dropped first.
    "course",
    "collection",
)


def _rename_keys(value: dict, mapping: dict[str, str], removed: set[str]) -> dict:
    result = copy.deepcopy(value or {})
    for old, new in mapping.items():
        if new not in result and old in result:
            result[new] = result[old]
        result.pop(old, None)
    for key in removed:
        result.pop(key, None)
    return result


def _migrate_json() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if inspector.has_table("role"):
        role = sa.table("role", sa.column("id", sa.Integer), sa.column("rights", sa.JSON))
        for row in bind.execute(sa.select(role.c.id, role.c.rights)).mappings():
            if isinstance(row["rights"], dict):
                bind.execute(
                    role.update().where(role.c.id == row["id"]).values(
                        rights=_rename_keys(row["rights"], RIGHT_KEYS, REMOVED_RIGHT_KEYS)
                    )
                )

    if inspector.has_table("organizationconfig"):
        config_table = sa.table(
            "organizationconfig",
            sa.column("id", sa.Integer),
            sa.column("config", sa.JSON),
        )
        for row in bind.execute(sa.select(config_table.c.id, config_table.c.config)).mappings():
            config = copy.deepcopy(row["config"] or {})
            for section in ("features", "admin_toggles", "overrides", "resolved_features"):
                if isinstance(config.get(section), dict):
                    config[section] = _rename_keys(config[section], FEATURE_KEYS, REMOVED_FEATURE_KEYS)
            bind.execute(config_table.update().where(config_table.c.id == row["id"]).values(config=config))


def _drop_column_if_present(table_name: str, column_name: str) -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table(table_name):
        return
    columns = {column["name"] for column in inspector.get_columns(table_name)}
    if column_name not in columns:
        return
    with op.batch_alter_table(table_name) as batch:
        for foreign_key in inspector.get_foreign_keys(table_name):
            if column_name in (foreign_key.get("constrained_columns") or []) and foreign_key.get("name"):
                batch.drop_constraint(foreign_key["name"], type_="foreignkey")
        for index in inspector.get_indexes(table_name):
            if column_name in (index.get("column_names") or []) and index.get("name"):
                batch.drop_index(index["name"])
        batch.drop_column(column_name)


def _drop_table_if_present(table_name: str) -> None:
    if sa.inspect(op.get_bind()).has_table(table_name):
        op.drop_table(table_name)


def upgrade() -> None:
    _migrate_json()

    _drop_column_if_present("community", "course_id")
    _drop_column_if_present("playground", "course_id")
    _drop_column_if_present("playground", "course_uuid")

    # Dependents and junctions first; parents are deliberately last.
    for table_name in DROP_TABLE_ORDER:
        _drop_table_if_present(table_name)

    if op.get_bind().dialect.name == "postgresql":
        op.execute("DROP TYPE IF EXISTS activitysubtypeenum")
        op.execute("DROP TYPE IF EXISTS activitytypeenum")


def downgrade() -> None:
    # Deleted product data is intentionally not recoverable. Historical migrations
    # remain the source of truth for recreating the retired empty schema if needed.
    pass
