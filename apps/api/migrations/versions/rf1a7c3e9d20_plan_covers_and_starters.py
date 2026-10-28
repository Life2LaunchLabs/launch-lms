"""plan covers (icon and color) and starter collections

Revision ID: rf1a7c3e9d20
Revises: qd8f3b02c5e4
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'rf1a7c3e9d20'
down_revision: Union[str, None] = 'qd8f3b02c5e4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal_template', sa.Column('icon', sa.String(), nullable=True))
    op.add_column('goal_template', sa.Column('color', sa.String(), nullable=True))
    op.add_column('plan_collection', sa.Column('starter', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('plan_collection', 'starter')
    op.drop_column('goal_template', 'color')
    op.drop_column('goal_template', 'icon')
