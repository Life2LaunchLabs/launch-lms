"""link learning runs to program assignments

Revision ID: d6e7f8g9h0i1
Revises: c5d6e7f8g9h0
"""

from alembic import op
import sqlalchemy as sa


revision = "d6e7f8g9h0i1"
down_revision = "c5d6e7f8g9h0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("learningrun", sa.Column("program_assignment_id", sa.Integer(), nullable=True))
    op.add_column("learningrun", sa.Column("program_participant_id", sa.Integer(), nullable=True))
    op.create_index("ix_learningrun_program_assignment_id", "learningrun", ["program_assignment_id"])
    op.create_index("ix_learningrun_program_participant_id", "learningrun", ["program_participant_id"])
    op.create_foreign_key("fk_learningrun_program_assignment", "learningrun", "programassignment", ["program_assignment_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_learningrun_program_participant", "learningrun", "programparticipant", ["program_participant_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_learningrun_program_participant", "learningrun", type_="foreignkey")
    op.drop_constraint("fk_learningrun_program_assignment", "learningrun", type_="foreignkey")
    op.drop_index("ix_learningrun_program_participant_id", table_name="learningrun")
    op.drop_index("ix_learningrun_program_assignment_id", table_name="learningrun")
    op.drop_column("learningrun", "program_participant_id")
    op.drop_column("learningrun", "program_assignment_id")
