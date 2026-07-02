"""Add system flags to learning badges

Revision ID: m4n5o6p7q8r9
Revises: l2b0c1d2e3f4
Create Date: 2026-07-02 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "m4n5o6p7q8r9"
down_revision: Union[str, None] = "l2b0c1d2e3f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if not _table_exists(inspector, table_name):
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _table_exists(inspector, "badgecollection"):
        if not _column_exists(inspector, "badgecollection", "protected"):
            op.add_column("badgecollection", sa.Column("protected", sa.Boolean(), nullable=False, server_default=sa.false()))
        if not _column_exists(inspector, "badgecollection", "system_type"):
            op.add_column("badgecollection", sa.Column("system_type", sa.String(), nullable=True))

    inspector = inspect(bind)
    if _table_exists(inspector, "learningbadge"):
        if not _column_exists(inspector, "learningbadge", "protected"):
            op.add_column("learningbadge", sa.Column("protected", sa.Boolean(), nullable=False, server_default=sa.false()))
        if not _column_exists(inspector, "learningbadge", "system_type"):
            op.add_column("learningbadge", sa.Column("system_type", sa.String(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    if _column_exists(inspector, "learningbadge", "system_type"):
        op.drop_column("learningbadge", "system_type")
    if _column_exists(inspector, "learningbadge", "protected"):
        op.drop_column("learningbadge", "protected")
    if _column_exists(inspector, "badgecollection", "system_type"):
        op.drop_column("badgecollection", "system_type")
    if _column_exists(inspector, "badgecollection", "protected"):
        op.drop_column("badgecollection", "protected")
