"""let a learner's new weekly goal start next week

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8

Changing the weekly goal used to refill the current week straight away. The
goal now takes effect from the following week, so the week records the goal
the learner picked until the next week is planned with it.
"""

from alembic import op
import sqlalchemy as sa


revision = "d4e5f6a7b8c9"
down_revision = "c3d4e5f6a7b8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planweeklyfocus", sa.Column("next_target", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("planweeklyfocus", "next_target")
