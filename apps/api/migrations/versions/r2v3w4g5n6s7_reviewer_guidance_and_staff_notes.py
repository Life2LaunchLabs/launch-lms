"""reviewer guidance on objectives; staff-only notes on live progress

Revision ID: r2v3w4g5n6s7
Revises: n1t2o3w4n5e6

Template objectives gain ``reviewer_guidance``: what a reviewer should look for.
It is copied into assignment snapshots and onto live plan objectives so a review
shows the guidance the plan was created with.

Live progress gains ``staff_notes``: notes staff leave about a learner's step.
They are never returned to the learner.
"""

import sqlalchemy as sa
from alembic import op

revision = "r2v3w4g5n6s7"
down_revision = "n1t2o3w4n5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("objective", sa.Column("reviewer_guidance", sa.String(), nullable=False, server_default=""))
    op.add_column("planobjective", sa.Column("reviewer_guidance", sa.String(), nullable=False, server_default=""))
    op.add_column("planobjectiveprogress", sa.Column("staff_notes", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("planobjectiveprogress", "staff_notes")
    op.drop_column("planobjective", "reviewer_guidance")
    op.drop_column("objective", "reviewer_guidance")
