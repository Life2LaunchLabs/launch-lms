"""add resources

Revision ID: u3v4w5x6y7z
Revises: t2u3v4w5x6y7
Create Date: 2026-04-14 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = 'u3v4w5x6y7z'
down_revision = 't2u3v4w5x6y7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    resource_type_enum = sa.Enum(
        'assessment', 'video', 'article', 'tool', 'guide', 'course', 'other',
        name='resourcetypeenum',
    )
    access_mode_enum = sa.Enum('free', 'paid', 'restricted', name='resourceaccessmodeenum')
    resource_type_enum.create(op.get_bind(), checkfirst=True)
    access_mode_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        'resource',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('resource_uuid', sa.String(), nullable=False),
        sa.Column('created_by_user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('resource_type', resource_type_enum, nullable=False),
        sa.Column('provider_name', sa.String(), nullable=True),
        sa.Column('provider_url', sa.String(), nullable=True),
        sa.Column('external_url', sa.String(), nullable=False),
        sa.Column('cover_image_url', sa.String(), nullable=True),
        sa.Column('thumbnail_image', sa.String(), nullable=True),
        sa.Column('estimated_time', sa.Integer(), nullable=True),
        sa.Column('is_featured', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('is_live', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('access_mode', access_mode_enum, nullable=False, server_default='free'),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('resource_uuid'),
    )
    op.create_index('ix_resource_org_id', 'resource', ['org_id'])
    op.create_index('ix_resource_resource_uuid', 'resource', ['resource_uuid'])

    op.create_table(
        'resourcechannel',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('channel_uuid', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('thumbnail_image', sa.String(), nullable=True),
        sa.Column('public', sa.Boolean(), nullable=False, server_default=sa.text('true')),
        sa.Column('is_starred', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('color', sa.String(), nullable=True),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('channel_uuid'),
    )
    op.create_index('ix_resourcechannel_org_id', 'resourcechannel', ['org_id'])
    op.create_index('ix_resourcechannel_channel_uuid', 'resourcechannel', ['channel_uuid'])

    op.create_table(
        'resourcechannelresource',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('channel_id', sa.Integer(), sa.ForeignKey('resourcechannel.id', ondelete='CASCADE'), nullable=False),
        sa.Column('resource_id', sa.Integer(), sa.ForeignKey('resource.id', ondelete='CASCADE'), nullable=False),
        sa.Column('sort_order', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('channel_id', 'resource_id', name='uq_channel_resource'),
    )
    op.create_index('ix_resourcechannelresource_channel_id', 'resourcechannelresource', ['channel_id'])
    op.create_index('ix_resourcechannelresource_resource_id', 'resourcechannelresource', ['resource_id'])

    op.create_table(
        'userresourcechannel',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('org_id', sa.Integer(), sa.ForeignKey('organization.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_channel_uuid', sa.String(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_default', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('user_channel_uuid'),
    )
    op.create_index('ix_userresourcechannel_user_id', 'userresourcechannel', ['user_id'])
    op.create_index('ix_userresourcechannel_org_id', 'userresourcechannel', ['org_id'])
    op.create_index('ix_userresourcechannel_user_channel_uuid', 'userresourcechannel', ['user_channel_uuid'])

    op.create_table(
        'usersavedresource',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('resource_id', sa.Integer(), sa.ForeignKey('resource.id', ondelete='CASCADE'), nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('outcome_text', sa.Text(), nullable=True),
        sa.Column('outcome_link', sa.String(), nullable=True),
        sa.Column('outcome_file', sa.String(), nullable=True),
        sa.Column('last_opened_at', sa.String(), nullable=True),
        sa.Column('completed_at', sa.String(), nullable=True),
        sa.Column('open_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('user_id', 'resource_id', name='uq_user_saved_resource'),
    )
    op.create_index('ix_usersavedresource_user_id', 'usersavedresource', ['user_id'])
    op.create_index('ix_usersavedresource_resource_id', 'usersavedresource', ['resource_id'])

    op.create_table(
        'usersavedresourcechannel',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('saved_resource_id', sa.Integer(), sa.ForeignKey('usersavedresource.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_channel_id', sa.Integer(), sa.ForeignKey('userresourcechannel.id', ondelete='CASCADE'), nullable=False),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.UniqueConstraint('saved_resource_id', 'user_channel_id', name='uq_saved_resource_channel'),
    )

    op.create_table(
        'resourcecomment',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('resource_id', sa.Integer(), sa.ForeignKey('resource.id', ondelete='CASCADE'), nullable=False),
        sa.Column('author_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('comment_uuid', sa.String(), nullable=False),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('is_locked', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('creation_date', sa.String(), nullable=False),
        sa.Column('update_date', sa.String(), nullable=False),
        sa.UniqueConstraint('comment_uuid'),
    )
    op.create_index('ix_resourcecomment_resource_id', 'resourcecomment', ['resource_id'])
    op.create_index('ix_resourcecomment_author_id', 'resourcecomment', ['author_id'])
    op.create_index('ix_resourcecomment_comment_uuid', 'resourcecomment', ['comment_uuid'])


def downgrade() -> None:
    op.drop_index('ix_resourcecomment_comment_uuid', table_name='resourcecomment')
    op.drop_index('ix_resourcecomment_author_id', table_name='resourcecomment')
    op.drop_index('ix_resourcecomment_resource_id', table_name='resourcecomment')
    op.drop_table('resourcecomment')
    op.drop_table('usersavedresourcechannel')
    op.drop_index('ix_usersavedresource_resource_id', table_name='usersavedresource')
    op.drop_index('ix_usersavedresource_user_id', table_name='usersavedresource')
    op.drop_table('usersavedresource')
    op.drop_index('ix_userresourcechannel_user_channel_uuid', table_name='userresourcechannel')
    op.drop_index('ix_userresourcechannel_org_id', table_name='userresourcechannel')
    op.drop_index('ix_userresourcechannel_user_id', table_name='userresourcechannel')
    op.drop_table('userresourcechannel')
    op.drop_index('ix_resourcechannelresource_resource_id', table_name='resourcechannelresource')
    op.drop_index('ix_resourcechannelresource_channel_id', table_name='resourcechannelresource')
    op.drop_table('resourcechannelresource')
    op.drop_index('ix_resourcechannel_channel_uuid', table_name='resourcechannel')
    op.drop_index('ix_resourcechannel_org_id', table_name='resourcechannel')
    op.drop_table('resourcechannel')
    op.drop_index('ix_resource_resource_uuid', table_name='resource')
    op.drop_index('ix_resource_org_id', table_name='resource')
    op.drop_table('resource')
    sa.Enum(name='resourceaccessmodeenum').drop(op.get_bind(), checkfirst=True)
    sa.Enum(name='resourcetypeenum').drop(op.get_bind(), checkfirst=True)
