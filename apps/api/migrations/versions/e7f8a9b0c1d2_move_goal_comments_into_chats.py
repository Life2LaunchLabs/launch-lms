"""chats: move the last goal comments into their plans' chats, and drop goalcomment

Revision ID: e7f8a9b0c1d2
Revises: a8c4e1f7d2b9

Plans' comments moved into chats one plan at a time, when someone opened it. This moves the
rest (src.services.connect.legacy_comments) in the migration's transaction, then drops the
table. Downgrade recreates an empty table: the comments stay in the chats.
"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7f8a9b0c1d2'
down_revision: Union[str, None] = 'a8c4e1f7d2b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    from sqlmodel import Session

    from src.services.connect.legacy_comments import move_all

    if 'goalcomment' not in sa.inspect(op.get_bind()).get_table_names():
        return
    session = Session(bind=op.get_bind())
    moved = move_all(session)
    session.flush()
    log.info("Moved %s goal comments into chats", moved)
    op.drop_table('goalcomment')


def downgrade() -> None:
    op.create_table(
        'goalcomment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('comment_uuid', sa.String(), nullable=False, unique=True),
        sa.Column('goal_id', sa.Integer(), sa.ForeignKey('goal.id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('step_uuid', sa.String(), nullable=True, index=True),
        sa.Column('parent_id', sa.Integer(), sa.ForeignKey('goalcomment.id', ondelete='CASCADE'), nullable=True, index=True),
        sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('mentioned_user_ids', sa.JSON(), nullable=False),
        sa.Column('resolved_at', sa.String(), nullable=True),
        sa.Column('resolved_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
    )
