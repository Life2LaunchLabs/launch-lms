"""add resource tags

Revision ID: r1s2t3u4v5w6
Revises: u3v4w5x6y7z
Create Date: 2026-04-15 10:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "r1s2t3u4v5w6"
down_revision = "u3v4w5x6y7z"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "resourcetag",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_uuid", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.UniqueConstraint("tag_uuid"),
        sa.UniqueConstraint("org_id", "name", name="uq_resourcetag_org_name"),
    )
    op.create_index("ix_resourcetag_org_id", "resourcetag", ["org_id"])
    op.create_index("ix_resourcetag_tag_uuid", "resourcetag", ["tag_uuid"])

    op.create_table(
        "resourcetaglink",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("resource_id", sa.Integer(), sa.ForeignKey("resource.id", ondelete="CASCADE"), nullable=False),
        sa.Column("tag_id", sa.Integer(), sa.ForeignKey("resourcetag.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.UniqueConstraint("resource_id", "tag_id", name="uq_resource_tag"),
    )
    op.create_index("ix_resourcetaglink_resource_id", "resourcetaglink", ["resource_id"])
    op.create_index("ix_resourcetaglink_tag_id", "resourcetaglink", ["tag_id"])


def downgrade() -> None:
    op.drop_index("ix_resourcetaglink_tag_id", table_name="resourcetaglink")
    op.drop_index("ix_resourcetaglink_resource_id", table_name="resourcetaglink")
    op.drop_table("resourcetaglink")
    op.drop_index("ix_resourcetag_tag_uuid", table_name="resourcetag")
    op.drop_index("ix_resourcetag_org_id", table_name="resourcetag")
    op.drop_table("resourcetag")
