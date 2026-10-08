"""add shared guide pages to the demo configuration

Revision ID: g7u8i9d0e1p2
Revises: i5s6u7e8r9a0
"""

from alembic import op
import sqlalchemy as sa


revision = "g7u8i9d0e1p2"
down_revision = "i5s6u7e8r9a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("democonfiguration", sa.Column("guide_pages", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("democonfiguration", "guide_pages")
