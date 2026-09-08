"""add Hub learner memory

Revision ID: l9m0n1o2p3q4
Revises: k8l9m0n1o2p3
"""

from alembic import op
import sqlalchemy as sa


revision = "l9m0n1o2p3q4"
down_revision = "k8l9m0n1o2p3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "hubmemorypreference",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("org_id", "user_id", name="uq_hubmemorypreference_owner"),
    )
    op.create_index("ix_hubmemorypreference_org_id", "hubmemorypreference", ["org_id"])
    op.create_index("ix_hubmemorypreference_user_id", "hubmemorypreference", ["user_id"])
    op.create_table(
        "hubmemory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("memory_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("normalized_key", sa.String(240), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="active"),
        sa.Column("superseded_by_uuid", sa.String(120), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("explicit", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("extraction_model", sa.String(200), nullable=True),
        sa.Column("extraction_version", sa.String(40), nullable=False, server_default="memory-v1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("last_used_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("memory_uuid"),
    )
    op.create_index("ix_hubmemory_memory_uuid", "hubmemory", ["memory_uuid"])
    op.create_index("ix_hubmemory_org_id", "hubmemory", ["org_id"])
    op.create_index("ix_hubmemory_user_id", "hubmemory", ["user_id"])
    op.create_index("ix_hubmemory_normalized_key", "hubmemory", ["normalized_key"])
    op.create_index("ix_hubmemory_created_at", "hubmemory", ["created_at"])
    op.create_index("ix_hubmemory_updated_at", "hubmemory", ["updated_at"])
    op.create_index("ix_hubmemory_last_used_at", "hubmemory", ["last_used_at"])
    op.create_index("ix_hubmemory_owner_active", "hubmemory", ["org_id", "user_id", "status", "updated_at"])
    op.create_table(
        "hubmemorysource",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("memory_id", sa.Integer(), sa.ForeignKey("hubmemory.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("hubconversationmessage.id", ondelete="SET NULL"), nullable=True),
        sa.Column("message_uuid", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("memory_id", "message_uuid", name="uq_hubmemorysource_message"),
    )
    op.create_index("ix_hubmemorysource_memory_id", "hubmemorysource", ["memory_id"])
    op.create_index("ix_hubmemorysource_message_id", "hubmemorysource", ["message_id"])
    op.create_index("ix_hubmemorysource_message_uuid", "hubmemorysource", ["message_uuid"])
    op.create_table(
        "hubconversationmessagememory",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("hubconversationmessage.id", ondelete="CASCADE"), nullable=False),
        sa.Column("memory_id", sa.Integer(), sa.ForeignKey("hubmemory.id", ondelete="SET NULL"), nullable=True),
        sa.Column("memory_uuid", sa.String(), nullable=False),
        sa.Column("relationship", sa.String(16), nullable=False),
        sa.Column("content_snapshot", sa.Text(), nullable=False),
        sa.Column("category_snapshot", sa.String(32), nullable=False),
        sa.Column("memory_version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("message_id", "memory_uuid", "relationship", name="uq_hubmessagememory_receipt"),
    )
    op.create_index("ix_hubmessagememory_message_id", "hubconversationmessagememory", ["message_id"])
    op.create_index("ix_hubmessagememory_memory_id", "hubconversationmessagememory", ["memory_id"])
    op.create_index("ix_hubmessagememory_memory_uuid", "hubconversationmessagememory", ["memory_uuid"])


def downgrade() -> None:
    op.drop_table("hubconversationmessagememory")
    op.drop_table("hubmemorysource")
    op.drop_table("hubmemory")
    op.drop_table("hubmemorypreference")
