"""add hubquestion: questions Coach asks through ask_learner, and the learner's answers

Revision ID: h4e5f6a7b8c9
Revises: g3d4e5f6a7b8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'h4e5f6a7b8c9'
down_revision: Union[str, None] = 'g3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'hubquestion',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('question_uuid', sa.String(), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('hubconversation.id', ondelete='CASCADE'), nullable=False),
        sa.Column('message_id', sa.Integer(), sa.ForeignKey('hubconversationmessage.id', ondelete='CASCADE'), nullable=False),
        sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goal.id', ondelete='SET NULL'), nullable=True),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('kind', sa.String(16), nullable=False),
        sa.Column('prompt', sa.Text(), nullable=False),
        sa.Column('options', sa.JSON(), nullable=False),
        sa.Column('settings', sa.JSON(), nullable=False),
        sa.Column('keep', sa.JSON(), nullable=True),
        sa.Column('status', sa.String(16), nullable=False, server_default='open'),
        sa.Column('answer', sa.JSON(), nullable=True),
        sa.Column('kept', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('answered_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_hubquestion_question_uuid', 'hubquestion', ['question_uuid'], unique=True)
    for column in ('org_id', 'user_id', 'conversation_id', 'message_id', 'goal_id', 'status'):
        op.create_index(f'ix_hubquestion_{column}', 'hubquestion', [column])
    op.create_index('ix_hubquestion_message_position', 'hubquestion', ['message_id', 'position'])


def downgrade() -> None:
    op.drop_table('hubquestion')
