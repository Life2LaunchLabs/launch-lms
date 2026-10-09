"""add objective review history

Revision ID: c5d6e7f8g9h0
Revises: b4c5d6e7f8g9
"""

from alembic import op
import sqlalchemy as sa


revision = "c5d6e7f8g9h0"
down_revision = "b4c5d6e7f8g9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "objectiveprogress",
        sa.Column("feedback_history", sa.JSON(), nullable=False, server_default="[]"),
    )


def downgrade() -> None:
    op.drop_column("objectiveprogress", "feedback_history")
