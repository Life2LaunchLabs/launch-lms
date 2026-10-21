"""coach tests: scenarios the coaching team writes, and runs that grade the draft against them

Revision ID: p2a3b4c5d6e7
Revises: o1f2a3b4c5d6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'p2a3b4c5d6e7'
down_revision: Union[str, None] = 'o1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'coach_test',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('test_uuid', sa.String(), nullable=False),
        sa.Column('title', sa.String(length=200), nullable=False),
        sa.Column('moment', sa.String(length=60), nullable=False),
        sa.Column('learner', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('message', sa.Text(), nullable=False, server_default=''),
        sa.Column('goal', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('rubric', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('enabled', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('updated_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('updated_at', sa.DateTime(), nullable=False),
    )
    op.create_index('ix_coach_test_test_uuid', 'coach_test', ['test_uuid'], unique=True)
    op.create_table(
        'coach_test_run',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('run_uuid', sa.String(), nullable=False),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='running'),
        sa.Column('snapshot_hash', sa.String(length=64), nullable=False),
        sa.Column('live_number', sa.Integer(), nullable=True),
        sa.Column('calls', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('done_calls', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('results', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('summary', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('error', sa.Text(), nullable=False, server_default=''),
        sa.Column('started_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('started_at', sa.DateTime(), nullable=False),
        sa.Column('finished_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_coach_test_run_run_uuid', 'coach_test_run', ['run_uuid'], unique=True)
    op.create_index('ix_coach_test_run_snapshot_hash', 'coach_test_run', ['snapshot_hash'])


def downgrade() -> None:
    op.drop_index('ix_coach_test_run_snapshot_hash', table_name='coach_test_run')
    op.drop_index('ix_coach_test_run_run_uuid', table_name='coach_test_run')
    op.drop_table('coach_test_run')
    op.drop_index('ix_coach_test_test_uuid', table_name='coach_test')
    op.drop_table('coach_test')
