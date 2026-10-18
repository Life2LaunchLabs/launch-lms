"""coach shared conversations: learners share a Coach conversation with the coaching team

Revision ID: r4c5d6e7f8a9
Revises: q3b4c5d6e7f8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'r4c5d6e7f8a9'
down_revision: Union[str, None] = 'q3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'coach_shared_conversation',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('share_uuid', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('hubconversation.id', ondelete='CASCADE'), nullable=False, unique=True),
        sa.Column('messages', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('learner', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('note', sa.Text(), nullable=False, server_default=''),
        sa.Column('shared_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_coach_shared_conversation_share_uuid', 'coach_shared_conversation', ['share_uuid'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_coach_shared_conversation_share_uuid', table_name='coach_shared_conversation')
    op.drop_table('coach_shared_conversation')
