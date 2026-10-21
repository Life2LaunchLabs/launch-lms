"""goals: assignment status (active, paused, ended) replaces the active flag; step reminders

Revision ID: acf6145ca175
Revises: d6e7f8a9b0c1
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'acf6145ca175'
down_revision: Union[str, None] = 'd6e7f8a9b0c1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal_assignment', sa.Column('status', sa.String(), nullable=False, server_default='active'))
    op.add_column('goal_assignment', sa.Column('paused_at', sa.String(), nullable=True))
    op.add_column('goal_assignment', sa.Column('ended_at', sa.String(), nullable=True))
    op.add_column('goal_assignment', sa.Column('ended_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_goal_assignment_status', 'goal_assignment', ['status'])
    # Inactive assignments were ended; their last update is when.
    op.execute(
        "UPDATE goal_assignment SET status = 'ended', ended_at = NULLIF(update_date, '') WHERE active = false"
    )
    op.drop_column('goal_assignment', 'active')
    op.add_column('step_progress', sa.Column('last_reminded_at', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('step_progress', 'last_reminded_at')
    op.add_column('goal_assignment', sa.Column('active', sa.Boolean(), nullable=False, server_default=sa.true()))
    op.execute("UPDATE goal_assignment SET active = false WHERE status = 'ended'")
    op.drop_index('ix_goal_assignment_status', table_name='goal_assignment')
    op.drop_column('goal_assignment', 'ended_by_user_id')
    op.drop_column('goal_assignment', 'ended_at')
    op.drop_column('goal_assignment', 'paused_at')
    op.drop_column('goal_assignment', 'status')
