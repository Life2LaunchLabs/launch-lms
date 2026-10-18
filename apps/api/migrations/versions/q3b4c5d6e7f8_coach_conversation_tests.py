"""coach conversation tests: a simulated learner talks with Coach for a few turns

Revision ID: q3b4c5d6e7f8
Revises: p2a3b4c5d6e7
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'q3b4c5d6e7f8'
down_revision: Union[str, None] = 'p2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('coach_test', sa.Column('persona', sa.Text(), nullable=False, server_default=''))
    op.add_column('coach_test', sa.Column('turns', sa.Integer(), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('coach_test', 'turns')
    op.drop_column('coach_test', 'persona')
