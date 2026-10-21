"""add goal priority, and the per-step dates and collaborators an assignment hands out

Priority lets This week order goals the way it ordered plans.

Revision ID: g0b1c2d3e4f5
Revises: g0a1b2c3d4e5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g0b1c2d3e4f5'
down_revision: Union[str, None] = 'g0a1b2c3d4e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal', sa.Column('priority', sa.Integer(), nullable=False, server_default='1'))
    op.add_column('goal_assignment', sa.Column('step_dates', sa.JSON(), nullable=False, server_default='{}'))
    op.add_column('goal_assignment', sa.Column('collaborators', sa.JSON(), nullable=False, server_default='[]'))


def downgrade() -> None:
    op.drop_column('goal_assignment', 'collaborators')
    op.drop_column('goal_assignment', 'step_dates')
    op.drop_column('goal', 'priority')
