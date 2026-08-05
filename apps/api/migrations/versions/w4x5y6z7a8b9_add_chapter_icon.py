"""add chapter icon

Revision ID: w4x5y6z7a8b9
Revises: e4f5g6h7i8j9
Create Date: 2026-05-28
"""

import sqlalchemy as sa
from alembic import op

revision = "w4x5y6z7a8b9"
down_revision = "e4f5g6h7i8j9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("chapter", sa.Column("icon", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("chapter", "icon")
