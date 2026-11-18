"""Learners an organization removed can't rejoin on their own (DEV-187)

Revision ID: r3m0v3d0rg01
Revises: c4n7v5c0ur5e
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "r3m0v3d0rg01"
down_revision = "c4n7v5c0ur5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organization_removal",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("removed_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("org_id", "user_id", name="uq_organization_removal_org_user"),
    )
    op.create_index("ix_organization_removal_org_id", "organization_removal", ["org_id"])
    op.create_index("ix_organization_removal_user_id", "organization_removal", ["user_id"])


def downgrade() -> None:
    op.drop_table("organization_removal")
