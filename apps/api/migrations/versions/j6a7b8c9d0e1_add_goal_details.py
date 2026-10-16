"""add goal.details: what the learner said when setting up a goal in the launch flow

Revision ID: j6a7b8c9d0e1
Revises: i5f6a7b8c9d0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'j6a7b8c9d0e1'
down_revision: Union[str, None] = 'i5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal', sa.Column('details', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('goal', 'details')
