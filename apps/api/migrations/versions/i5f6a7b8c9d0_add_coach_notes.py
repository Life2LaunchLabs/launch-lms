"""add coach_note and goal check-in schedule: Coach's per-goal notes from check-ins

Revision ID: i5f6a7b8c9d0
Revises: h4e5f6a7b8c9
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'i5f6a7b8c9d0'
down_revision: Union[str, None] = 'h4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal', sa.Column('coach_cadence', sa.String(), nullable=False, server_default='weekly'))
    op.add_column('goal', sa.Column('next_check_in_at', sa.DateTime(), nullable=True))
    op.create_index('ix_goal_next_check_in_at', 'goal', ['next_check_in_at'])
    op.create_table(
        'coach_note',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('note_uuid', sa.String(), nullable=False),
        sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goal.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(), nullable=False),
        sa.Column('signal_key', sa.String(), nullable=False),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('body', sa.String(), nullable=False, server_default=''),
        sa.Column('actions', sa.JSON(), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='open'),
        sa.Column('source', sa.String(), nullable=False, server_default='check_in'),
        sa.Column('model', sa.String(), nullable=False, server_default=''),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('acted_at', sa.DateTime(), nullable=True),
        sa.UniqueConstraint('note_uuid'),
    )
    for column in ('note_uuid', 'goal_id', 'user_id', 'signal_key', 'status'):
        op.create_index(f'ix_coach_note_{column}', 'coach_note', [column])


def downgrade() -> None:
    op.drop_table('coach_note')
    op.drop_index('ix_goal_next_check_in_at', table_name='goal')
    op.drop_column('goal', 'next_check_in_at')
    op.drop_column('goal', 'coach_cadence')
