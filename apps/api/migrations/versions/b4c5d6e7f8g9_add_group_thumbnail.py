"""add group thumbnail

Revision ID: b4c5d6e7f8g9
Revises: z3a4b5c6d7e8
"""

from alembic import op
import sqlalchemy as sa


revision = "b4c5d6e7f8g9"
down_revision = "z3a4b5c6d7e8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("usergroup", sa.Column("thumbnail_image", sa.String(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("usergroup", "thumbnail_image")
