"""conversation reactions: a cheer on a message in a thread

Revision ID: e7a2c9d4b1f6
Revises: d5b8e2f1a7c3

One row per person, message and emoji (``db/conversations.ConversationReaction``).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7a2c9d4b1f6"
down_revision: Union[str, None] = "d5b8e2f1a7c3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "conversationreaction",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("message_id", sa.Integer(), sa.ForeignKey("conversationmessage.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("emoji", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("message_id", "user_id", "emoji", name="uq_conversationreaction_message_user_emoji"),
    )
    op.create_index("ix_conversationreaction_message_id", "conversationreaction", ["message_id"])


def downgrade() -> None:
    op.drop_index("ix_conversationreaction_message_id", table_name="conversationreaction")
    op.drop_table("conversationreaction")
