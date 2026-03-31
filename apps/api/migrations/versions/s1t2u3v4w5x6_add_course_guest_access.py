"""add course guest access

Revision ID: s1t2u3v4w5x6
Revises: r7s8t9u0v1w2_add_payments_mode
Create Date: 2026-03-31
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "s1t2u3v4w5x6"
down_revision = "r7s8t9u0v1w2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course",
        sa.Column("guest_access", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("course", "guest_access")
