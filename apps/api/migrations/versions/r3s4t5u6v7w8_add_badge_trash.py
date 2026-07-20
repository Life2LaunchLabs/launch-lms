"""add 14-day badge trash

Revision ID: r3s4t5u6v7w8
Revises: q2r3s4t5u6v7
Create Date: 2026-07-20 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r3s4t5u6v7w8"
down_revision: Union[str, None] = "q2r3s4t5u6v7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("learningbadge", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_learningbadge_deleted_at", "learningbadge", ["deleted_at"])
    op.add_column("badgecollection", sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.create_index("ix_badgecollection_deleted_at", "badgecollection", ["deleted_at"])


def downgrade() -> None:
    op.drop_index("ix_badgecollection_deleted_at", table_name="badgecollection")
    op.drop_column("badgecollection", "deleted_at")
    op.drop_index("ix_learningbadge_deleted_at", table_name="learningbadge")
    op.drop_column("learningbadge", "deleted_at")
