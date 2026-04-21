"""add shared content flags

Revision ID: a4b5c6d7e8f9
Revises: z9y8x7w6v5u4
Create Date: 2026-04-16
"""

from alembic import op
import sqlalchemy as sa


revision = "a4b5c6d7e8f9"
down_revision = "z9y8x7w6v5u4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("course", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("collection", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("community", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("resourcechannel", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))

    op.alter_column("course", "shared", server_default=None)
    op.alter_column("collection", "shared", server_default=None)
    op.alter_column("community", "shared", server_default=None)
    op.alter_column("resourcechannel", "shared", server_default=None)


def downgrade() -> None:
    op.drop_column("resourcechannel", "shared")
    op.drop_column("community", "shared")
    op.drop_column("collection", "shared")
    op.drop_column("course", "shared")
