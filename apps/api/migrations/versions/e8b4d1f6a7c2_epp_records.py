"""EPP records: frozen Education Plan and Profile reports that outlive the learner's account

Revision ID: e8b4d1f6a7c2
Revises: d5a2c9e7b3f1
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "e8b4d1f6a7c2"
down_revision = "d5a2c9e7b3f1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "epprecord",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("record_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("learner_name", sa.String(), nullable=False),
        sa.Column("student_id", sa.String(), nullable=True),
        sa.Column("school_year", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="annual"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("supersedes_id", sa.Integer(), sa.ForeignKey("epprecord.id", ondelete="SET NULL"), nullable=True),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("data", sa.JSON(), nullable=False),
        sa.Column("outcome", sa.Text(), nullable=False, server_default=""),
        sa.Column("staff_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("learner_comment", sa.Text(), nullable=False, server_default=""),
        sa.Column("reviewed_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_by_name", sa.String(), nullable=False, server_default=""),
        sa.Column("reviewed_at", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_epprecord_record_uuid", "epprecord", ["record_uuid"], unique=True)
    op.create_index("ix_epprecord_org_id", "epprecord", ["org_id"])
    op.create_index("ix_epprecord_user_id", "epprecord", ["user_id"])


def downgrade() -> None:
    op.drop_table("epprecord")
