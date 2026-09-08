"""add Hub conversation history

Revision ID: j7k8l9m0n1o2
Revises: i6j7k8l9m0n1
"""

from alembic import op
import sqlalchemy as sa


revision = "j7k8l9m0n1o2"
down_revision = "i6j7k8l9m0n1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hubconversation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_hubconversation_conversation_uuid", "hubconversation", ["conversation_uuid"], unique=True)
    op.create_index("ix_hubconversation_org_id", "hubconversation", ["org_id"])
    op.create_index("ix_hubconversation_user_id", "hubconversation", ["user_id"])
    op.create_index("ix_hubconversation_created_at", "hubconversation", ["created_at"])
    op.create_index("ix_hubconversation_updated_at", "hubconversation", ["updated_at"])
    op.create_index("ix_hubconversation_owner_recent", "hubconversation", ["org_id", "user_id", "updated_at"])
    op.create_table(
        "hubconversationmessage",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_uuid", sa.String(), nullable=False),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("hubconversation.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False, server_default="chat"),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("model", sa.String(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("conversation_id", "sequence", name="uq_hubconversationmessage_sequence"),
    )
    op.create_index("ix_hubconversationmessage_message_uuid", "hubconversationmessage", ["message_uuid"], unique=True)
    op.create_index("ix_hubconversationmessage_conversation_id", "hubconversationmessage", ["conversation_id"])
    op.create_index("ix_hubconversationmessage_sequence", "hubconversationmessage", ["sequence"])
    op.create_index("ix_hubconversationmessage_created_at", "hubconversationmessage", ["created_at"])
    op.create_table(
        "hubconversationmessageresource",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("hubconversationmessage.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_uuid", sa.String(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("label", sa.String(), nullable=False),
        sa.UniqueConstraint("message_id", "resource_uuid", name="uq_hubconversationmessage_resource"),
    )
    op.create_index("ix_hubconversationmessageresource_message_id", "hubconversationmessageresource", ["message_id"])
    op.create_index("ix_hubconversationmessageresource_resource_uuid", "hubconversationmessageresource", ["resource_uuid"])
    op.create_table(
        "hubconversationresource",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("conversation_id", sa.Integer(), sa.ForeignKey("hubconversation.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_uuid", sa.String(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.UniqueConstraint("conversation_id", "resource_uuid", name="uq_hubconversation_resource"),
    )
    op.create_index("ix_hubconversationresource_conversation_id", "hubconversationresource", ["conversation_id"])
    op.create_index("ix_hubconversationresource_resource_uuid", "hubconversationresource", ["resource_uuid"])


def downgrade() -> None:
    op.drop_table("hubconversationresource")
    op.drop_table("hubconversationmessageresource")
    op.drop_table("hubconversationmessage")
    op.drop_table("hubconversation")
