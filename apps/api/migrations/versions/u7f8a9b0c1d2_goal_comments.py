"""goals: comment threads on a goal or a step

Revision ID: u7f8a9b0c1d2
Revises: t6e7f8a9b0c1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'u7f8a9b0c1d2'
down_revision: Union[str, None] = 't6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goalcomment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_uuid', sa.String(), nullable=False),
        sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goal.id', ondelete='CASCADE'), nullable=False),
        sa.Column('step_uuid', sa.String(), nullable=True),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('goalcomment.id', ondelete='CASCADE'), nullable=True),
        sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('mentioned_user_ids', sa.JSON(), nullable=False),
        sa.Column('resolved_at', sa.String(), nullable=True),
        sa.Column('resolved_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('comment_uuid'),
    )
    for column in ('comment_uuid', 'goal_id', 'step_uuid', 'parent_id', 'author_user_id'):
        op.create_index(f'ix_goalcomment_{column}', 'goalcomment', [column])


def downgrade() -> None:
    op.drop_table('goalcomment')
