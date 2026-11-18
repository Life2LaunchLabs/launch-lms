"""Test invitees: reserved test addresses a run invites before they have an account (DEV-103)

Revision ID: t3i4n5v6t7e8
Revises: c1s2h3e4l5d6
Create Date: 2026-11-16
"""

from alembic import op
import sqlalchemy as sa

revision = "t3i4n5v6t7e8"
down_revision = "c1s2h3e4l5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "test_invitee",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("cohort_id", sa.Integer(), sa.ForeignKey("test_cohort.id", ondelete="CASCADE"), nullable=False),
        sa.Column("handle", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("first_name", sa.String(), nullable=False, server_default=""),
        sa.Column("last_name", sa.String(), nullable=False, server_default=""),
        sa.Column("brief", sa.Text(), nullable=False, server_default=""),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("signed_up_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_test_invitee_cohort_id", "test_invitee", ["cohort_id"])
    op.create_index("ix_test_invitee_email", "test_invitee", ["email"], unique=True)
    op.create_index("ix_test_invitee_user_id", "test_invitee", ["user_id"])
    op.add_column("test_login_ticket", sa.Column("invitee_id", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("test_login_ticket", "invitee_id")
    op.drop_table("test_invitee")
