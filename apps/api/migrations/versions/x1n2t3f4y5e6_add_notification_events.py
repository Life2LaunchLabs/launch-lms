"""Email notifications: the queue the notification worker sends from

Revision ID: x1n2t3f4y5e6
Revises: w7c8k9p0t1s2
Create Date: 2026-11-11
"""

from alembic import op
import sqlalchemy as sa

revision = "x1n2t3f4y5e6"
down_revision = "w7c8k9p0t1s2"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notification_event",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("event_uuid", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=48), nullable=False),
        sa.Column("stream", sa.String(length=48), nullable=False),
        sa.Column("recipient_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=True),
        sa.Column("data", sa.JSON(), nullable=False, server_default="{}"),
        sa.Column("dedupe_key", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("send_after", sa.DateTime(), nullable=False),
        sa.Column("claimed_at", sa.DateTime(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_error", sa.Text(), nullable=False, server_default=""),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_notification_event_event_uuid", "notification_event", ["event_uuid"])
    op.create_index("ix_notification_event_recipient_user_id", "notification_event", ["recipient_user_id"])
    op.create_index("ix_notification_event_org_id", "notification_event", ["org_id"])
    op.create_index("ix_notification_event_status", "notification_event", ["status"])
    op.create_index("ix_notification_event_send_after", "notification_event", ["send_after"])


def downgrade():
    op.drop_table("notification_event")
