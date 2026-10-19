"""goal sharing: helper invitations an organization admin approves (planinvitation status awaiting_approval)

A learner's invitation to a helper on a plan their organization gave them can wait for an admin
when the organization's messaging policy asks for it. The status is a string column, so the new
``awaiting_approval`` value needs no type change; these columns record who reviewed it and when.

Revision ID: 294d6b067aa5
Revises: acf6145ca175
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '294d6b067aa5'
down_revision: Union[str, None] = 'acf6145ca175'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('planinvitation', sa.Column('reviewed_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True))
    op.add_column('planinvitation', sa.Column('reviewed_at', sa.DateTime(), nullable=True))


def downgrade() -> None:
    # Invitations still waiting on an admin were never sent; drop them with the status.
    op.execute("UPDATE planinvitation SET status = 'revoked' WHERE status = 'awaiting_approval'")
    op.drop_column('planinvitation', 'reviewed_at')
    op.drop_column('planinvitation', 'reviewed_by_user_id')
