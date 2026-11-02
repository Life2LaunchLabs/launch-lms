"""Feedback saved in the app first and synced to Jira, with a cached list per person

Revision ID: e2b7c4d9f1a3
Revises: d7a1e4c9b2f6
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "e2b7c4d9f1a3"
down_revision = "d7a1e4c9b2f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback_submission",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_uuid", sa.String(length=64), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("intent", sa.String(), nullable=True),
        sa.Column("context", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("issue_key", sa.String(length=64), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("synced_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("submission_uuid"),
    )
    op.create_index("ix_feedback_submission_submission_uuid", "feedback_submission", ["submission_uuid"])
    op.create_index("ix_feedback_submission_org_id", "feedback_submission", ["org_id"])
    op.create_index("ix_feedback_submission_user_id", "feedback_submission", ["user_id"])
    op.create_index("ix_feedback_submission_status", "feedback_submission", ["status"])
    op.create_table(
        "feedback_submission_file",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("submission_id", sa.Integer(), sa.ForeignKey("feedback_submission.id", ondelete="CASCADE"), nullable=False),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=64), nullable=False),
        sa.Column("content", sa.LargeBinary(), nullable=False),
    )
    op.create_index("ix_feedback_submission_file_submission_id", "feedback_submission_file", ["submission_id"])
    op.create_table(
        "feedback_list_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("refreshed_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("org_id", "user_id"),
    )
    op.create_index("ix_feedback_list_cache_org_id", "feedback_list_cache", ["org_id"])
    op.create_index("ix_feedback_list_cache_user_id", "feedback_list_cache", ["user_id"])


def downgrade() -> None:
    op.drop_table("feedback_list_cache")
    op.drop_table("feedback_submission_file")
    op.drop_table("feedback_submission")
