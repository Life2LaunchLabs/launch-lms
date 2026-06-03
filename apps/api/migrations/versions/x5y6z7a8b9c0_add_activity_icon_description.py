"""add activity icon and description

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-05-29
"""

from alembic import op
import sqlalchemy as sa


revision = "x5y6z7a8b9c0"
down_revision = "w4x5y6z7a8b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("activity", sa.Column("description", sa.String(), nullable=True))
    op.add_column("activity", sa.Column("icon", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("activity", "icon")
    op.drop_column("activity", "description")
