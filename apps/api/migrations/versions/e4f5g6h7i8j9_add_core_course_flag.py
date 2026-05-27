"""add core course flag

Revision ID: e4f5g6h7i8j9
Revises: d3e4f5g6h7i8
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa


revision = "e4f5g6h7i8j9"
down_revision = "d3e4f5g6h7i8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("course", sa.Column("core_course", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.alter_column("course", "core_course", server_default=None)


def downgrade() -> None:
    op.drop_column("course", "core_course")
