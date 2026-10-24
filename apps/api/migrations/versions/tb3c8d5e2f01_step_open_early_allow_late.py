"""step open early and allow late

A step's start date can be a suggestion (open early: it opens with its stage) and a step can
take no late work (closed after its due date). Existing steps keep their behaviour: a start
date locks until then, and late work is allowed.

Revision ID: tb3c8d5e2f01
Revises: sa2b7c4d1e90
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'tb3c8d5e2f01'
down_revision: Union[str, None] = 'sa2b7c4d1e90'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal_step', sa.Column('open_early', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('goal_step', sa.Column('allow_late', sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column('goal_step', 'allow_late')
    op.drop_column('goal_step', 'open_early')
