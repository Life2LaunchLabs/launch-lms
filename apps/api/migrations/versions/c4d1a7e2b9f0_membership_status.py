"""memberships: an explicit status the organization sets (active or alumni)

Everyone starts active. Only active learners count toward the tier's learner limit.

Revision ID: c4d1a7e2b9f0
Revises: b3ee9e60e07c
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c4d1a7e2b9f0'
down_revision: Union[str, None] = 'b3ee9e60e07c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('userorganization', sa.Column('status', sa.String(), nullable=False, server_default='active'))
    op.add_column('userorganization', sa.Column('status_since', sa.String(), nullable=True))
    op.create_index('ix_userorganization_status', 'userorganization', ['status'])


def downgrade() -> None:
    op.drop_index('ix_userorganization_status', table_name='userorganization')
    op.drop_column('userorganization', 'status_since')
    op.drop_column('userorganization', 'status')
