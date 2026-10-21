"""goals: the badge an assignment earns, and which template versions of a badge route earn it

Revision ID: e8f3b66b5434
Revises: 25170766ef96
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e8f3b66b5434'
down_revision: Union[str, None] = '25170766ef96'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('goal_assignment', sa.Column('badge_id', sa.Integer(), sa.ForeignKey('learningbadge.id', ondelete='SET NULL'), nullable=True))
    op.create_index('ix_goal_assignment_badge_id', 'goal_assignment', ['badge_id'])
    op.add_column('badgeroute', sa.Column('latest_only', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('badgeroute', sa.Column('eligible_from_version', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('badgeroute', 'eligible_from_version')
    op.drop_column('badgeroute', 'latest_only')
    op.drop_index('ix_goal_assignment_badge_id', table_name='goal_assignment')
    op.drop_column('goal_assignment', 'badge_id')
