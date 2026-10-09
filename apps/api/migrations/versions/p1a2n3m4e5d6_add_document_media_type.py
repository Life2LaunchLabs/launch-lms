"""add document media type

Revision ID: p1a2n3m4e5d6
Revises: r0s1t2u3v4w5
"""

from alembic import op


revision = "p1a2n3m4e5d6"
down_revision = "r0s1t2u3v4w5"
branch_labels = None
depends_on = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TYPE mediatype ADD VALUE IF NOT EXISTS 'document'")


def downgrade() -> None:
    # PostgreSQL enum values cannot be removed safely while rows may use them.
    pass
