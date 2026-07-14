"""add media assets

Revision ID: m9n0o1p2q3r4
Revises: f9a0b1c2d3e4
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "m9n0o1p2q3r4"
down_revision: Union[str, None] = "f9a0b1c2d3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    owner_type_enum = postgresql.ENUM("user", "org", name="mediaownertype", create_type=False)
    source_type_enum = postgresql.ENUM("upload", "link", name="mediasourcetype", create_type=False)
    media_type_enum = postgresql.ENUM("image", "video", name="mediatype", create_type=False)
    owner_type_enum.create(op.get_bind(), checkfirst=True)
    source_type_enum.create(op.get_bind(), checkfirst=True)
    media_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "mediaasset",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("asset_uuid", sa.String(), nullable=False),
        sa.Column("owner_type", owner_type_enum, nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("owner_org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("source_type", source_type_enum, nullable=False),
        sa.Column("media_type", media_type_enum, nullable=False),
        sa.Column("title", sa.String(), nullable=False, server_default=""),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("thumbnail_url", sa.Text(), nullable=True),
        sa.Column("filename", sa.String(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("folder", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("asset_uuid"),
    )
    op.create_index("ix_mediaasset_asset_uuid", "mediaasset", ["asset_uuid"])
    op.create_index("ix_mediaasset_owner_user_id", "mediaasset", ["owner_user_id"])
    op.create_index("ix_mediaasset_owner_org_id", "mediaasset", ["owner_org_id"])
    op.create_index("ix_mediaasset_created_by_user_id", "mediaasset", ["created_by_user_id"])
    op.create_index("ix_mediaasset_owner_type_media_type", "mediaasset", ["owner_type", "media_type"])
    op.create_index("ix_mediaasset_folder", "mediaasset", ["folder"])


def downgrade() -> None:
    op.drop_index("ix_mediaasset_folder", table_name="mediaasset")
    op.drop_index("ix_mediaasset_owner_type_media_type", table_name="mediaasset")
    op.drop_index("ix_mediaasset_created_by_user_id", table_name="mediaasset")
    op.drop_index("ix_mediaasset_owner_org_id", table_name="mediaasset")
    op.drop_index("ix_mediaasset_owner_user_id", table_name="mediaasset")
    op.drop_index("ix_mediaasset_asset_uuid", table_name="mediaasset")
    op.drop_table("mediaasset")
    postgresql.ENUM("image", "video", name="mediatype", create_type=False).drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM("upload", "link", name="mediasourcetype", create_type=False).drop(op.get_bind(), checkfirst=True)
    postgresql.ENUM("user", "org", name="mediaownertype", create_type=False).drop(op.get_bind(), checkfirst=True)
