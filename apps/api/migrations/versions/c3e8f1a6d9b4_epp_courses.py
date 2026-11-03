"""EPP course plans: a learner's high school courses with a school, tallied against the diploma credits

Revision ID: c3e8f1a6d9b4
Revises: b7d1e4f8a2c3
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "c3e8f1a6d9b4"
down_revision = "b7d1e4f8a2c3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "eppcourse",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("course_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grade", sa.Integer(), nullable=False),
        sa.Column("school_year", sa.String(), nullable=True),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("term", sa.String(), nullable=True),
        sa.Column("credits", sa.Float(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="planned"),
        sa.Column("course_code", sa.String(), nullable=True),
        sa.Column("dual_credit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("dual_credit_school", sa.String(), nullable=True),
        sa.Column("dual_credit_credits", sa.Float(), nullable=True),
        sa.Column("note", sa.String(), nullable=True),
        sa.Column("source", sa.String(), nullable=False, server_default="student"),
        sa.Column("added_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("confirmed_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("confirmed_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_eppcourse_course_uuid", "eppcourse", ["course_uuid"], unique=True)
    op.create_index("ix_eppcourse_org_id", "eppcourse", ["org_id"])
    op.create_index("ix_eppcourse_user_id", "eppcourse", ["user_id"])


def downgrade() -> None:
    op.drop_table("eppcourse")
