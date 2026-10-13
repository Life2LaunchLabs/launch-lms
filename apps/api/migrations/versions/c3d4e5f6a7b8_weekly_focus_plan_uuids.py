"""remember which plans a learner's week was planned from

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7

A plan accepted mid-week used to add its steps to a week the learner may
already have finished. The week now records the plans it was planned from;
later plans wait in Next week until the learner pulls them in. Existing weeks
start with NULL and adopt the learner's current plans on their next load.
"""

from alembic import op
import sqlalchemy as sa


revision = "c3d4e5f6a7b8"
down_revision = "b2c3d4e5f6a7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("planweeklyfocus", sa.Column("plan_uuids", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("planweeklyfocus", "plan_uuids")
