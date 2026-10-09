"""drop legacy badge objectives

Revision ID: r0s1t2u3v4w5
Revises: q9r0s1t2u3v4
"""

from alembic import op


revision = "r0s1t2u3v4w5"
down_revision = "q9r0s1t2u3v4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Badge work is now represented by a badge requirement on a regular
    # objective. Legacy badge objectives are intentionally not converted.
    op.execute("DELETE FROM planobjective WHERE kind = 'badge'")


def downgrade() -> None:
    # Deleted legacy objectives cannot be reconstructed reliably.
    pass
