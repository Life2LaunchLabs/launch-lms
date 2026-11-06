"""Audit log columns match the model

The table was created with a ``metadata`` column and without ``resource_id``, ``method``,
``path`` and ``payload``, while the model writes ``request_metadata`` and reads all of them.
Databases built from the models already match; databases built by migrations couldn't save an
audit log at all. This brings those in line and leaves matching ones alone.

Revision ID: n4a5u6d7i8t9
Revises: m3t8r2a6n4s1
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "n4a5u6d7i8t9"
down_revision = "m3t8r2a6n4s1"
branch_labels = None
depends_on = None

TABLE = "auditlog"
ADDED = (
    ("resource_id", sa.String()),
    ("method", sa.String()),
    ("path", sa.String()),
    ("payload", sa.JSON()),
)


def _columns() -> set[str]:
    inspector = sa.inspect(op.get_bind())
    if TABLE not in inspector.get_table_names():
        return set()
    return {column["name"] for column in inspector.get_columns(TABLE)}


def upgrade() -> None:
    columns = _columns()
    if not columns:
        return
    if "request_metadata" not in columns:
        if "metadata" in columns:
            op.alter_column(TABLE, "metadata", new_column_name="request_metadata")
        else:
            op.add_column(TABLE, sa.Column("request_metadata", sa.JSON(), nullable=True))
    for name, type_ in ADDED:
        if name not in columns:
            op.add_column(TABLE, sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    # Nothing to undo safely: on databases that already matched the model these columns are
    # the model's own, and the app reads them.
    pass
