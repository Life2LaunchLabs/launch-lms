"""Platform-wide API keys set in Platform › Settings (Pexels first)

Revision ID: c6f9d3e5a7b2
Revises: b8e3f1a6c2d9
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "c6f9d3e5a7b2"
down_revision = "b8e3f1a6c2d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "platformsecret",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("ciphertext", sa.Text(), nullable=False),
        sa.Column("last4", sa.String(length=4), nullable=False, server_default=""),
        sa.Column("updated_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_platformsecret_key", "platformsecret", ["key"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_platformsecret_key", table_name="platformsecret")
    op.drop_table("platformsecret")
