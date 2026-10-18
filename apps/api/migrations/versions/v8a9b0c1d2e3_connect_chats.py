"""connect: chats, their members and messages, blocks and reports

Revision ID: v8a9b0c1d2e3
Revises: u7f8a9b0c1d2
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'v8a9b0c1d2e3'
down_revision: Union[str, None] = 'u7f8a9b0c1d2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'conversation',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_uuid', sa.String(), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('direct_key', sa.String(), nullable=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('last_message_at', sa.String(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('direct_key'),
    )
    op.create_index('ix_conversation_conversation_uuid', 'conversation', ['conversation_uuid'], unique=True)
    op.create_index('ix_conversation_org_id', 'conversation', ['org_id'])
    op.create_index('ix_conversation_last_message_at', 'conversation', ['last_message_at'])

    op.create_table(
        'conversationmember',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversation.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('last_read_at', sa.String(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('conversation_id', 'user_id', name='uq_conversationmember_conversation_user'),
    )
    op.create_index('ix_conversationmember_conversation_id', 'conversationmember', ['conversation_id'])
    op.create_index('ix_conversationmember_user_id', 'conversationmember', ['user_id'])

    op.create_table(
        'conversationmessage',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('message_uuid', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversation.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sender_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('card', sa.JSON(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
    )
    op.create_index('ix_conversationmessage_message_uuid', 'conversationmessage', ['message_uuid'], unique=True)
    op.create_index('ix_conversationmessage_sender_user_id', 'conversationmessage', ['sender_user_id'])
    op.create_index('ix_conversationmessage_conversation_created', 'conversationmessage', ['conversation_id', 'creation_date'])

    op.create_table(
        'userblock',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('blocker_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('blocked_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.UniqueConstraint('blocker_user_id', 'blocked_user_id', name='uq_userblock_pair'),
    )
    op.create_index('ix_userblock_blocker_user_id', 'userblock', ['blocker_user_id'])
    op.create_index('ix_userblock_blocked_user_id', 'userblock', ['blocked_user_id'])

    op.create_table(
        'conversationreport',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_uuid', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('conversation.id', ondelete='SET NULL'), nullable=True),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('conversationmessage.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reporter_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reported_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('reason', sa.Text(), nullable=False),
        sa.Column('excerpt', sa.Text(), nullable=True),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
    )
    op.create_index('ix_conversationreport_report_uuid', 'conversationreport', ['report_uuid'], unique=True)
    op.create_index('ix_conversationreport_conversation_id', 'conversationreport', ['conversation_id'])
    op.create_index('ix_conversationreport_reported_user_id', 'conversationreport', ['reported_user_id'])
    op.create_index('ix_conversationreport_status', 'conversationreport', ['status'])


def downgrade() -> None:
    op.drop_table('conversationreport')
    op.drop_table('userblock')
    op.drop_table('conversationmessage')
    op.drop_table('conversationmember')
    op.drop_table('conversation')
