"""chats: what a message tags (plans, steps, people, organizations)

Revision ID: c5d6e7f8a9b0
Revises: x9c0d1e2f3a4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'x9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversationmessage', sa.Column('refs', sa.JSON(), nullable=True))
    op.create_table(
        'conversationmessageref',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('conversationmessage.id', ondelete='CASCADE'), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversation.id', ondelete='CASCADE'), nullable=False),
        sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goal.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_uuid', sa.String(), nullable=True),
    )
    op.create_index('ix_conversationmessageref_message_id', 'conversationmessageref', ['message_id'])
    op.create_index('ix_conversationmessageref_filter', 'conversationmessageref', ['conversation_id', 'goal_id', 'step_uuid'])


def downgrade() -> None:
    op.drop_index('ix_conversationmessageref_filter', table_name='conversationmessageref')
    op.drop_index('ix_conversationmessageref_message_id', table_name='conversationmessageref')
    op.drop_table('conversationmessageref')
    op.drop_column('conversationmessage', 'refs')
