"""school: staff on a group, and staff-only notes about a student

Revision ID: x9c0d1e2f3a4
Revises: w8b9c0d1e2f3
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'x9c0d1e2f3a4'
down_revision: Union[str, None] = 'w8b9c0d1e2f3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'usergroupstaff',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('usergroup_id', sa.Integer(), sa.ForeignKey('usergroup.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role_key', sa.String(), nullable=False),
        sa.Column('assignment_uuids', sa.JSON(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('usergroup_id', 'user_id', name='uq_usergroupstaff_group_user'),
    )
    for column in ('org_id', 'usergroup_id', 'user_id'):
        op.create_index(f'ix_usergroupstaff_{column}', 'usergroupstaff', [column])

    op.create_table(
        'staffnote',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('note_uuid', sa.String(), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('subject_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('body', sa.Text(), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
    )
    op.create_index('ix_staffnote_note_uuid', 'staffnote', ['note_uuid'], unique=True)
    op.create_index('ix_staffnote_org_id', 'staffnote', ['org_id'])
    op.create_index('ix_staffnote_subject_user_id', 'staffnote', ['subject_user_id'])


def downgrade() -> None:
    op.drop_table('staffnote')
    op.drop_table('usergroupstaff')
