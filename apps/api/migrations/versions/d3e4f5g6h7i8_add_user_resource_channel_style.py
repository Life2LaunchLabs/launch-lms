"""add user resource channel style

Revision ID: d3e4f5g6h7i8
Revises: c2d3e4f5g6h7
Create Date: 2026-05-07
"""

from alembic import op
import sqlalchemy as sa


revision = "d3e4f5g6h7i8"
down_revision = "c2d3e4f5g6h7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("userresourcechannel", sa.Column("icon", sa.String(), nullable=True))
    op.add_column("userresourcechannel", sa.Column("color", sa.String(), nullable=True))
    op.add_column("userresourcechannel", sa.Column("icon_color", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("userresourcechannel", "icon_color")
    op.drop_column("userresourcechannel", "color")
    op.drop_column("userresourcechannel", "icon")
