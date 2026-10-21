"""user organizations: per-member preferences (the admin Home layout)

Revision ID: 25170766ef96
Revises: 294d6b067aa5
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '25170766ef96'
down_revision: Union[str, None] = '294d6b067aa5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('userorganization', sa.Column('preferences', sa.JSON(), nullable=False, server_default='{}'))


def downgrade() -> None:
    op.drop_column('userorganization', 'preferences')
