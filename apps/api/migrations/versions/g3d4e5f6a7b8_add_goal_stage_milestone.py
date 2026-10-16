"""add goal_stage.milestone: the line saying what reaching the end of a stage looks like

Revision ID: g3d4e5f6a7b8
Revises: g1b2c3d4e5f6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'g3d4e5f6a7b8'
down_revision: Union[str, None] = 'g1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal_stage', sa.Column('milestone', sa.String(), nullable=False, server_default=''))


def downgrade() -> None:
    op.drop_column('goal_stage', 'milestone')
