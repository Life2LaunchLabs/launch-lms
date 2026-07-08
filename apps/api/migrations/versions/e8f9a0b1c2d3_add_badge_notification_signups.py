"""add badge notification signups

Revision ID: e8f9a0b1c2d3
Revises: d7e8f9a0b1c2
Create Date: 2026-07-08 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "e8f9a0b1c2d3"
down_revision: Union[str, None] = "d7e8f9a0b1c2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(table_name: str) -> bool:
    return table_name in inspect(op.get_bind()).get_table_names()


def upgrade() -> None:
    if _table_exists("learningbadgenotificationsignup"):
        return

    op.create_table(
        "learningbadgenotificationsignup",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("signup_uuid", sa.String(), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("badge_id", "user_id"),
    )
    op.create_index("ix_learningbadgenotificationsignup_signup_uuid", "learningbadgenotificationsignup", ["signup_uuid"])
    op.create_index("ix_learningbadgenotificationsignup_badge_id", "learningbadgenotificationsignup", ["badge_id"])
    op.create_index("ix_learningbadgenotificationsignup_org_id", "learningbadgenotificationsignup", ["org_id"])
    op.create_index("ix_learningbadgenotificationsignup_user_id", "learningbadgenotificationsignup", ["user_id"])


def downgrade() -> None:
    if not _table_exists("learningbadgenotificationsignup"):
        return

    op.drop_index("ix_learningbadgenotificationsignup_user_id", table_name="learningbadgenotificationsignup")
    op.drop_index("ix_learningbadgenotificationsignup_org_id", table_name="learningbadgenotificationsignup")
    op.drop_index("ix_learningbadgenotificationsignup_badge_id", table_name="learningbadgenotificationsignup")
    op.drop_index("ix_learningbadgenotificationsignup_signup_uuid", table_name="learningbadgenotificationsignup")
    op.drop_table("learningbadgenotificationsignup")
