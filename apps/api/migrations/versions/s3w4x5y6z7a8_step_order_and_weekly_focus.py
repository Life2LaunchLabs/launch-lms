"""step order rules, step prerequisites and weekly focus

Revision ID: s3w4x5y6z7a8
Revises: r2v3w4g5n6s7

Plans and plan templates gain ``step_order`` ("any", "in_order" or "by_chapter"),
which decides when a learner can start a step. Live and template objectives gain
``after_objective_uuids``: steps that must be finished first.

``planweeklyfocus`` stores the undated steps picked into a learner's week so My
plans stays stable for the week, plus the learner's weekly target.
"""

import sqlalchemy as sa
from alembic import op

revision = "s3w4x5y6z7a8"
down_revision = "r2v3w4g5n6s7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("plan", sa.Column("step_order", sa.String(), nullable=False, server_default="any"))
    op.add_column("program", sa.Column("step_order", sa.String(), nullable=False, server_default="any"))
    op.add_column("planobjective", sa.Column("after_objective_uuids", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("programobjective", sa.Column("after_objective_uuids", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table(
        "planweeklyfocus",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("objective_uuids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("target", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("boosts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("user_id", "week_start"),
    )
    op.create_index("ix_planweeklyfocus_user_id", "planweeklyfocus", ["user_id"])
    op.create_index("ix_planweeklyfocus_week_start", "planweeklyfocus", ["week_start"])


def downgrade() -> None:
    op.drop_index("ix_planweeklyfocus_week_start", table_name="planweeklyfocus")
    op.drop_index("ix_planweeklyfocus_user_id", table_name="planweeklyfocus")
    op.drop_table("planweeklyfocus")
    op.drop_column("programobjective", "after_objective_uuids")
    op.drop_column("planobjective", "after_objective_uuids")
    op.drop_column("program", "step_order")
    op.drop_column("plan", "step_order")
