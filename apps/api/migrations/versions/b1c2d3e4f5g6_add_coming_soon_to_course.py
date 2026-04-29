"""add coming_soon to course

Revision ID: b1c2d3e4f5g6
Revises: z9y8x7w6v5u4
Create Date: 2026-04-28

"""

from alembic import op
import sqlalchemy as sa


revision = "b1c2d3e4f5g6"
down_revision = "y1z2a3b4c5d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course",
        sa.Column("coming_soon", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("course", "coming_soon")
