"""link resource notes to media library assets

Revision ID: h5i6j7k8l9m0
Revises: g4h5i6j7k8l9
"""

from alembic import op
import sqlalchemy as sa


revision = "h5i6j7k8l9m0"
down_revision = "g4h5i6j7k8l9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("resourcenoteblock", sa.Column("media_asset_uuid", sa.String(), nullable=True))
    op.create_index(
        "ix_resourcenoteblock_media_asset_uuid",
        "resourcenoteblock",
        ["media_asset_uuid"],
    )


def downgrade() -> None:
    op.drop_index("ix_resourcenoteblock_media_asset_uuid", table_name="resourcenoteblock")
    op.drop_column("resourcenoteblock", "media_asset_uuid")
