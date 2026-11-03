"""connect: move portfolio comments into chats about the portfolio, and drop portfoliocomment

Revision ID: d4e8a2c6f1b9
Revises: c7d2f9a4e1b8

Comments on a portfolio are now messages in the direct chat between its owner and each person
they let see it, tagged with the experience or project they're about. This moves the old ones
(src.services.connect.legacy_portfolio_comments) in the migration's transaction, then drops the
table. Downgrade recreates an empty table: the comments stay in the chats.
"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e8a2c6f1b9'
down_revision: Union[str, None] = 'c7d2f9a4e1b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from sqlmodel import Session

    from src.services.connect.legacy_portfolio_comments import move_all

    if 'portfoliocomment' not in sa.inspect(op.get_bind()).get_table_names():
        return
    session = Session(bind=op.get_bind())
    moved = move_all(session)
    session.flush()
    log.info("Moved %s portfolio comments into chats", moved)
    op.drop_table('portfoliocomment')


def downgrade() -> None:
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
