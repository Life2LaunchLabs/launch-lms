"""add learning activity preview sessions

Revision ID: k1p2r3v4w5x6
Revises: g7u8i9d0e1p2
"""

from alembic import op
import sqlalchemy as sa


revision = "k1p2r3v4w5x6"
down_revision = "g7u8i9d0e1p2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "learningactivitypreview",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="CASCADE"), nullable=True),
        sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source", sa.String(length=32), nullable=False),
        sa.Column("document", sa.JSON(), nullable=True),
        sa.Column("persona", sa.JSON(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_learningactivitypreview_token_hash", "learningactivitypreview", ["token_hash"], unique=True)
    op.create_index("ix_learningactivitypreview_org_id", "learningactivitypreview", ["org_id"])
    op.create_index("ix_learningactivitypreview_expires_at", "learningactivitypreview", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_learningactivitypreview_expires_at", table_name="learningactivitypreview")
    op.drop_index("ix_learningactivitypreview_org_id", table_name="learningactivitypreview")
    op.drop_index("ix_learningactivitypreview_token_hash", table_name="learningactivitypreview")
    op.drop_table("learningactivitypreview")
