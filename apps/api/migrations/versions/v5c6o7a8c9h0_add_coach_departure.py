"""Coach retention: when a learner left an organization (DEV-125)

Revision ID: v5c6o7a8c9h0
Revises: u4m5e6m7e8r9
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa

revision = "v5c6o7a8c9h0"
down_revision = "u4m5e6m7e8r9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coach_departure",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("left_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("org_id", "user_id", name="uq_coach_departure_member"),
    )
    op.create_index("ix_coach_departure_org_id", "coach_departure", ["org_id"])
    op.create_index("ix_coach_departure_user_id", "coach_departure", ["user_id"])


def downgrade() -> None:
    op.drop_table("coach_departure")
