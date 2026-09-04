"""add template objective suggested due week

Revision ID: f3g4h5i6j7k8
Revises: e2f3a4b5c6d7
"""

from alembic import op
import sqlalchemy as sa


revision = "f3g4h5i6j7k8"
down_revision = "e2f3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "programobjective",
        sa.Column("suggested_due_week", sa.Integer(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("programobjective", "suggested_due_week")
