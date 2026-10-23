"""plan collections: an organization's groupings of its plans

Revision ID: pc7e2a91b4d3
Revises: h3d4e5f6a7b8
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'pc7e2a91b4d3'
down_revision: Union[str, None] = 'h3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'plan_collection',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('collection_uuid', sa.String(), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.String(), nullable=False, server_default=''),
        sa.Column('categories', sa.JSON(), nullable=False, server_default='[]'),
        sa.Column('last_opened_at', sa.DateTime(), nullable=True),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.Column('update_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('collection_uuid'),
    )
    op.create_index('ix_plan_collection_collection_uuid', 'plan_collection', ['collection_uuid'])
    op.create_index('ix_plan_collection_org_id', 'plan_collection', ['org_id'])
    op.create_table(
        'plan_collection_item',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('collection_id', sa.Integer(), sa.ForeignKey('plan_collection.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('goal_template.id', ondelete='CASCADE'), nullable=False),
        sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('collection_id', 'template_id'),
    )
    op.create_index('ix_plan_collection_item_collection_id', 'plan_collection_item', ['collection_id'])
    op.create_index('ix_plan_collection_item_template_id', 'plan_collection_item', ['template_id'])


def downgrade() -> None:
    op.drop_table('plan_collection_item')
    op.drop_table('plan_collection')
