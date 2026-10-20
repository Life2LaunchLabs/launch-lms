"""connect: an assignment's cohort chats (staff only, whole group), tagged by template step

Revision ID: 4cfa894fc16d
Revises: acf6145ca175
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4cfa894fc16d'
down_revision: Union[str, None] = 'acf6145ca175'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversation', sa.Column('assignment_id', sa.Integer(), sa.ForeignKey('goal_assignment.id', ondelete='CASCADE'), nullable=True))
    op.add_column('conversation', sa.Column('channel', sa.String(), nullable=True))
    op.create_index('ix_conversation_assignment_id', 'conversation', ['assignment_id'])
    op.create_unique_constraint('uq_conversation_assignment_channel', 'conversation', ['assignment_id', 'channel'])
    # A cohort chat's messages are about a template step, not one learner's plan.
    op.alter_column('conversationmessageref', 'goal_id', existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    op.execute('DELETE FROM conversationmessageref WHERE goal_id IS NULL')
    op.alter_column('conversationmessageref', 'goal_id', existing_type=sa.Integer(), nullable=False)
    op.drop_constraint('uq_conversation_assignment_channel', 'conversation', type_='unique')
    op.drop_index('ix_conversation_assignment_id', table_name='conversation')
    op.drop_column('conversation', 'channel')
    op.drop_column('conversation', 'assignment_id')
