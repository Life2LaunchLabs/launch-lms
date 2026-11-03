"""School support links: a school asks to support a learner and the learner accepts

Revision ID: b7d1e4f8a2c3
Revises: a5c3e7f9b1d2
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "b7d1e4f8a2c3"
down_revision = "a5c3e7f9b1d2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learnersupport",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("support_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="requested"),
        sa.Column("request_uuid", sa.String(), nullable=False),
        sa.Column("requested_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requested_at", sa.String(), nullable=False, server_default=""),
        sa.Column("consent_at", sa.String(), nullable=True),
        sa.Column("consent_version", sa.String(), nullable=True),
        sa.Column("ended_at", sa.String(), nullable=True),
        sa.Column("ended_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("student_id", sa.String(), nullable=True),
        sa.Column("diploma_track", sa.String(), nullable=True),
        sa.Column("graduation_year", sa.Integer(), nullable=True),
        sa.Column("counselor_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("org_id", "user_id", name="uq_learnersupport_org_user"),
    )
    op.create_index("ix_learnersupport_support_uuid", "learnersupport", ["support_uuid"], unique=True)
    op.create_index("ix_learnersupport_org_id", "learnersupport", ["org_id"])
    op.create_index("ix_learnersupport_user_id", "learnersupport", ["user_id"])
    op.create_index("ix_learnersupport_status", "learnersupport", ["status"])


def downgrade() -> None:
    op.drop_table("learnersupport")
