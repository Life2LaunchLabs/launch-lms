"""replace learning badge published boolean with status

Revision ID: d7e8f9a0b1c2
Revises: c7d8e9f0a1b2
Create Date: 2026-07-08 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect


revision: str = "d7e8f9a0b1c2"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _column_exists(inspector, table_name: str, column_name: str) -> bool:
    if table_name not in inspector.get_table_names():
        return False
    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "learningbadge" not in inspector.get_table_names():
        return

    if not _column_exists(inspector, "learningbadge", "status"):
        op.add_column("learningbadge", sa.Column("status", sa.String(), nullable=False, server_default="draft"))

    inspector = inspect(bind)
    if _column_exists(inspector, "learningbadge", "published"):
        bind.execute(sa.text("UPDATE learningbadge SET status = CASE WHEN published IS TRUE THEN 'published' ELSE 'draft' END"))
        op.drop_column("learningbadge", "published")

    inspector = inspect(bind)
    if "learningbadgenotificationsignup" not in inspector.get_table_names():
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
    bind = op.get_bind()
    inspector = inspect(bind)
    if "learningbadge" not in inspector.get_table_names():
        return

    if not _column_exists(inspector, "learningbadge", "published"):
        op.add_column("learningbadge", sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.false()))

    inspector = inspect(bind)
    if _column_exists(inspector, "learningbadge", "status"):
        bind.execute(sa.text("UPDATE learningbadge SET published = CASE WHEN status = 'published' THEN TRUE ELSE FALSE END"))
        op.drop_column("learningbadge", "status")

    inspector = inspect(bind)
    if "learningbadgenotificationsignup" in inspector.get_table_names():
        op.drop_index("ix_learningbadgenotificationsignup_user_id", table_name="learningbadgenotificationsignup")
        op.drop_index("ix_learningbadgenotificationsignup_org_id", table_name="learningbadgenotificationsignup")
        op.drop_index("ix_learningbadgenotificationsignup_badge_id", table_name="learningbadgenotificationsignup")
        op.drop_index("ix_learningbadgenotificationsignup_signup_uuid", table_name="learningbadgenotificationsignup")
        op.drop_table("learningbadgenotificationsignup")
