"""add durable inbox messages and platform message templates

Revision ID: c0d1e2f3a4b5
Revises: b942a83d0f5e
"""

from alembic import op
import sqlalchemy as sa


revision = "c0d1e2f3a4b5"
down_revision = "b942a83d0f5e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "inboxmessagetemplate",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("template_key", sa.String(), nullable=False),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("template_key"),
    )
    op.create_index(
        "ix_inboxmessagetemplate_template_key",
        "inboxmessagetemplate",
        ["template_key"],
        unique=True,
    )

    op.create_table(
        "inboxmessage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_uuid", sa.String(), nullable=False),
        sa.Column(
            "recipient_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("recipient_email_normalized", sa.String(), nullable=True),
        sa.Column(
            "sender_org_id",
            sa.Integer(),
            sa.ForeignKey("organization.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "sender_user_id",
            sa.Integer(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("message_type", sa.String(), nullable=False, server_default="system"),
        sa.Column("subject", sa.String(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("action_url", sa.String(), nullable=True),
        sa.Column("action_kind", sa.String(), nullable=True),
        sa.Column("action_data", sa.JSON(), nullable=True),
        sa.Column("action_status", sa.String(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("dedupe_key", sa.String(), nullable=True),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("message_uuid"),
        sa.UniqueConstraint("dedupe_key"),
    )
    op.create_index("ix_inboxmessage_message_uuid", "inboxmessage", ["message_uuid"], unique=True)
    op.create_index("ix_inboxmessage_recipient_user_id", "inboxmessage", ["recipient_user_id"])
    op.create_index("ix_inboxmessage_recipient_email_normalized", "inboxmessage", ["recipient_email_normalized"])
    op.create_index("ix_inboxmessage_sender_org_id", "inboxmessage", ["sender_org_id"])
    op.create_index("ix_inboxmessage_message_type", "inboxmessage", ["message_type"])
    op.create_index("ix_inboxmessage_action_kind", "inboxmessage", ["action_kind"])
    op.create_index("ix_inboxmessage_action_status", "inboxmessage", ["action_status"])
    op.create_index("ix_inboxmessage_dedupe_key", "inboxmessage", ["dedupe_key"], unique=True)
    op.create_index("ix_inboxmessage_created_at", "inboxmessage", ["created_at"])
    op.create_index(
        "ix_inboxmessage_recipient_read",
        "inboxmessage",
        ["recipient_user_id", "read_at"],
    )


def downgrade() -> None:
    op.drop_table("inboxmessage")
    op.drop_table("inboxmessagetemplate")
