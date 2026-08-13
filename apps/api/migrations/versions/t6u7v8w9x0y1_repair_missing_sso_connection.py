"""repair databases stamped without the SSO connection table

Revision ID: t6u7v8w9x0y1
Revises: 58eae25fe62b

Some legacy databases were stamped at head while the enterprise SSO model was
not part of the community model metadata. Keep the original migration immutable
and repair those databases at a new forward-only revision.
"""

import importlib
from collections.abc import Sequence

from alembic import context, op
from sqlalchemy import inspect

revision: str = "t6u7v8w9x0y1"
down_revision: str | None = "58eae25fe62b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TABLE_NAME = "ssoconnection"
EXPECTED_COLUMNS = {
    "id",
    "org_id",
    "provider",
    "enabled",
    "domains",
    "auto_provision_users",
    "default_role_id",
    "provider_config",
    "created_at",
    "updated_at",
}
ORG_INDEX = "ix_ssoconnection_org_id"
PROVIDER_INDEX = "ix_ssoconnection_provider"


def upgrade() -> None:
    original = importlib.import_module(
        "migrations.versions.a1b2c3d4e5f6_add_sso_connection"
    )
    if context.is_offline_mode():
        original.upgrade()
        return

    inspector = inspect(op.get_bind())
    if TABLE_NAME not in set(inspector.get_table_names()):
        original.upgrade()
        return

    columns = {column["name"] for column in inspector.get_columns(TABLE_NAME)}
    missing_columns = EXPECTED_COLUMNS - columns
    if missing_columns:
        missing = ", ".join(sorted(missing_columns))
        raise RuntimeError(
            "Partial SSO connection schema detected; refusing an unsafe "
            f"automatic repair. Missing columns: {missing}"
        )

    indexes = {index["name"]: index for index in inspector.get_indexes(TABLE_NAME)}
    org_index = indexes.get(ORG_INDEX)
    if org_index is None:
        op.create_index(ORG_INDEX, TABLE_NAME, ["org_id"], unique=True)
    elif not org_index.get("unique"):
        raise RuntimeError(
            f"{ORG_INDEX} exists but is not unique; refusing an unsafe automatic repair"
        )

    if PROVIDER_INDEX not in indexes:
        op.create_index(PROVIDER_INDEX, TABLE_NAME, ["provider"])


def downgrade() -> None:
    # This repair may be a no-op on databases where the original SSO migration
    # ran. The original revision owns the table and its teardown.
    pass
