"""coach reports: learners report a Coach reply that went wrong

Revision ID: s5d6e7f8a9b0
Revises: q3b4c5d6e7f8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 's5d6e7f8a9b0'
down_revision: Union[str, None] = 'q3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'coach_report',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('report_uuid', sa.String(), nullable=False),
        sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('hubconversation.id', ondelete='CASCADE'), nullable=False),
        sa.Column('message_uuid', sa.String(), nullable=False),
        sa.Column('reason', sa.String(20), nullable=False),
        sa.Column('note', sa.Text(), nullable=False, server_default=''),
        sa.Column('messages', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('learner', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('status', sa.String(20), nullable=False, server_default='new'),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('reviewed_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_coach_report_report_uuid', 'coach_report', ['report_uuid'], unique=True)
    op.create_index('ix_coach_report_conversation_id', 'coach_report', ['conversation_id'])


def downgrade() -> None:
    op.drop_index('ix_coach_report_conversation_id', table_name='coach_report')
    op.drop_index('ix_coach_report_report_uuid', table_name='coach_report')
    op.drop_table('coach_report')
