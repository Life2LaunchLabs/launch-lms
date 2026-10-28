"""Media assets remember who made them (stock photos and videos)

Revision ID: b5e8c2d4f6a1
Revises: a4d9e2f7c1b8
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "b5e8c2d4f6a1"
down_revision = "a4d9e2f7c1b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("mediaasset", sa.Column("credit", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("mediaasset", "credit")
