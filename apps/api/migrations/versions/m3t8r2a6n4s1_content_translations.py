"""Saved machine translations of organization and outside text

Revision ID: m3t8r2a6n4s1
Revises: m2r4e6l8s0a1
Create Date: 2026-11-06
"""

from alembic import op
import sqlalchemy as sa

revision = "m3t8r2a6n4s1"
down_revision = "m2r4e6l8s0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "contenttranslation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_hash", sa.String(length=64), nullable=False),
        sa.Column("language", sa.String(length=8), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=False),
        sa.Column("translated_text", sa.Text(), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_contenttranslation_hash_language", "contenttranslation", ["source_hash", "language"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_contenttranslation_hash_language", table_name="contenttranslation")
    op.drop_table("contenttranslation")
