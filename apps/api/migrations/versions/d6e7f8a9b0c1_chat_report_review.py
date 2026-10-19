"""chats: who reviewed a report, and when

Revision ID: d6e7f8a9b0c1
Revises: c5d6e7f8a9b0
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd6e7f8a9b0c1'
down_revision: Union[str, None] = 'c5d6e7f8a9b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('conversationreport', sa.Column('reviewed_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True))
    op.add_column('conversationreport', sa.Column('review_date', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('conversationreport', 'review_date')
    op.drop_column('conversationreport', 'reviewed_by_user_id')
