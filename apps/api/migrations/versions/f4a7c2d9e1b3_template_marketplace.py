"""marketplace: template listings and authorizations, trusted-partner badge routes

Revision ID: f4a7c2d9e1b3
Revises: e8f3b66b5434
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f4a7c2d9e1b3'
down_revision: Union[str, None] = 'e8f3b66b5434'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'goal_template_listing',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('goal_template.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('listed', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('mode', sa.String(), nullable=False, server_default='locked'),
        sa.Column('access', sa.String(), nullable=False, server_default='request'),
        sa.Column('listed_at', sa.DateTime(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.Column('update_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('template_id'),
    )
    op.create_index('ix_goal_template_listing_template_id', 'goal_template_listing', ['template_id'])
    op.create_index('ix_goal_template_listing_org_id', 'goal_template_listing', ['org_id'])

    op.create_table(
        'goal_template_authorization',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('authorization_uuid', sa.String(), nullable=False, server_default=''),
        sa.Column('template_id', sa.Integer(), sa.ForeignKey('goal_template.id', ondelete='CASCADE'), nullable=False),
        sa.Column('creator_org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('issuer_org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('status', sa.String(), nullable=False, server_default='requested'),
        sa.Column('message', sa.String(), nullable=True),
        sa.Column('copied_template_id', sa.Integer(), sa.ForeignKey('goal_template.id', ondelete='SET NULL'), nullable=True),
        sa.Column('requested_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decided_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('decided_at', sa.DateTime(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.Column('update_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('template_id', 'issuer_org_id'),
        sa.UniqueConstraint('authorization_uuid'),
    )
    for column in ('authorization_uuid', 'template_id', 'creator_org_id', 'issuer_org_id', 'status'):
        op.create_index(f'ix_goal_template_authorization_{column}', 'goal_template_authorization', [column])

    op.add_column('badgeroute', sa.Column('trusted_only', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'badge_route_partner',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('route_id', sa.Integer(), sa.ForeignKey('badgeroute.id', ondelete='CASCADE'), nullable=False),
        sa.Column('issuer_org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('approved_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False, server_default=''),
        sa.UniqueConstraint('route_id', 'issuer_org_id'),
    )
    op.create_index('ix_badge_route_partner_route_id', 'badge_route_partner', ['route_id'])
    op.create_index('ix_badge_route_partner_issuer_org_id', 'badge_route_partner', ['issuer_org_id'])


def downgrade() -> None:
    op.drop_index('ix_badge_route_partner_issuer_org_id', table_name='badge_route_partner')
    op.drop_index('ix_badge_route_partner_route_id', table_name='badge_route_partner')
    op.drop_table('badge_route_partner')
    op.drop_column('badgeroute', 'trusted_only')
    for column in ('authorization_uuid', 'template_id', 'creator_org_id', 'issuer_org_id', 'status'):
        op.drop_index(f'ix_goal_template_authorization_{column}', table_name='goal_template_authorization')
    op.drop_table('goal_template_authorization')
    op.drop_index('ix_goal_template_listing_org_id', table_name='goal_template_listing')
    op.drop_index('ix_goal_template_listing_template_id', table_name='goal_template_listing')
    op.drop_table('goal_template_listing')
