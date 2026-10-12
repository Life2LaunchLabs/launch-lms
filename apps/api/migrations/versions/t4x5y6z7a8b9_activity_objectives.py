"""activities owned by plan template objectives

Revision ID: t4x5y6z7a8b9
Revises: s3w4x5y6z7a8

Interactive activities no longer need a badge path. A template objective of
kind "activity" owns one activity (``learningactivity.objective_id``); live
plan objectives point at it (``planobjective.activity_id``); runs of it are
scoped to that activity (``learningrun.activity_id``). Badge, path and version
references become optional on activities, pages and runs.
"""

import sqlalchemy as sa
from alembic import op

revision = "t4x5y6z7a8b9"
down_revision = "s3w4x5y6z7a8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learningactivity", sa.Column("objective_id", sa.Integer(), sa.ForeignKey("objective.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_learningactivity_objective_id", "learningactivity", ["objective_id"])
    op.alter_column("learningactivity", "path_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("learningactivity", "badge_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("learningpage", "badge_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("learningrun", sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="CASCADE"), nullable=True))
    op.create_index("ix_learningrun_activity_id", "learningrun", ["activity_id"])
    op.alter_column("learningrun", "badge_id", existing_type=sa.Integer(), nullable=True)
    op.alter_column("learningrun", "path_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("planobjective", sa.Column("activity_id", sa.Integer(), sa.ForeignKey("learningactivity.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_planobjective_activity_id", "planobjective", ["activity_id"])


def downgrade() -> None:
    op.drop_index("ix_planobjective_activity_id", table_name="planobjective")
    op.drop_column("planobjective", "activity_id")
    op.execute("DELETE FROM learningrun WHERE path_id IS NULL OR badge_id IS NULL")
    op.alter_column("learningrun", "path_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("learningrun", "badge_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_learningrun_activity_id", table_name="learningrun")
    op.drop_column("learningrun", "activity_id")
    op.execute("DELETE FROM learningpage WHERE badge_id IS NULL")
    op.alter_column("learningpage", "badge_id", existing_type=sa.Integer(), nullable=False)
    op.execute("DELETE FROM learningactivity WHERE path_id IS NULL OR badge_id IS NULL")
    op.alter_column("learningactivity", "badge_id", existing_type=sa.Integer(), nullable=False)
    op.alter_column("learningactivity", "path_id", existing_type=sa.Integer(), nullable=False)
    op.drop_index("ix_learningactivity_objective_id", table_name="learningactivity")
    op.drop_column("learningactivity", "objective_id")
