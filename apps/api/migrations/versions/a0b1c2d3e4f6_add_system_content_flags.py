"""Add system content flags

Revision ID: a0b1c2d3e4f6
Revises: b3c4d5e6f7g8
Create Date: 2026-06-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a0b1c2d3e4f6'
down_revision: Union[str, None] = 'b3c4d5e6f7g8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('course', sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('course', sa.Column('protected', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('course', sa.Column('system_type', sa.String(), nullable=True))
    op.add_column('collection', sa.Column('hidden', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('collection', sa.Column('protected', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('collection', sa.Column('system_type', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('collection', 'system_type')
    op.drop_column('collection', 'protected')
    op.drop_column('collection', 'hidden')
    op.drop_column('course', 'system_type')
    op.drop_column('course', 'protected')
    op.drop_column('course', 'hidden')
