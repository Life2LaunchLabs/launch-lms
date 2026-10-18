"""portfolio: people added to a portfolio, and their comments

Revision ID: w8b9c0d1e2f3
Revises: v8a9b0c1d2e3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'w8b9c0d1e2f3'
down_revision: Union[str, None] = 'v8a9b0c1d2e3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'portfolioperson',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('portfolio_id', sa.Integer(), sa.ForeignKey('portfolio.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role', sa.String(), nullable=False),
        sa.Column('added_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('portfolio_id', 'user_id', name='uq_portfolioperson_portfolio_user'),
    )
    op.create_index('ix_portfolioperson_portfolio_id', 'portfolioperson', ['portfolio_id'])
    op.create_index('ix_portfolioperson_user_id', 'portfolioperson', ['user_id'])

    op.create_table(
        'portfoliocomment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_uuid', sa.String(), nullable=False),
        sa.Column('portfolio_id', sa.Integer(), sa.ForeignKey('portfolio.id', ondelete='CASCADE'), nullable=False),
        sa.Column('item_kind', sa.String(), nullable=False),
        sa.Column('item_uuid', sa.String(), nullable=True),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('portfoliocomment.id', ondelete='CASCADE'), nullable=True),
        sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
    )
    op.create_index('ix_portfoliocomment_comment_uuid', 'portfoliocomment', ['comment_uuid'], unique=True)
    for column in ('portfolio_id', 'item_uuid', 'parent_id', 'author_user_id'):
        op.create_index(f'ix_portfoliocomment_{column}', 'portfoliocomment', [column])


def downgrade() -> None:
    op.drop_table('portfoliocomment')
    op.drop_table('portfolioperson')
