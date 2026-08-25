"""add program assignment scheduling

Revision ID: z3a4b5c6d7e8
Revises: y2z3a4b5c6d7
"""

from alembic import op
import sqlalchemy as sa


revision = "z3a4b5c6d7e8"
down_revision = "y2z3a4b5c6d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("programobjective", sa.Column("default_start_rule", sa.String(), nullable=False, server_default="any_time"))
    op.add_column("programobjective", sa.Column("default_due_rule", sa.String(), nullable=False, server_default="optional"))
    op.add_column("programobjective", sa.Column("default_allow_late", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("programassignment", sa.Column("initiate_date", sa.DateTime(), nullable=True))
    op.add_column("programassignment", sa.Column("staff_user_ids", sa.JSON(), nullable=False, server_default=sa.text("'[]'")))
    op.add_column("programassignment", sa.Column("schedule", sa.JSON(), nullable=False, server_default=sa.text("'{}'")))


def downgrade() -> None:
    op.drop_column("programassignment", "schedule")
    op.drop_column("programassignment", "staff_user_ids")
    op.drop_column("programassignment", "initiate_date")
    op.drop_column("programobjective", "default_allow_late")
    op.drop_column("programobjective", "default_due_rule")
    op.drop_column("programobjective", "default_start_rule")
