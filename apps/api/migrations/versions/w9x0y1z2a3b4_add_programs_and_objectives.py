"""add reusable programs, objectives, assignments, and canonical progress

Revision ID: w9x0y1z2a3b4
Revises: v8w9x0y1z2a3
"""

from alembic import op
import sqlalchemy as sa


revision = "w9x0y1z2a3b4"
down_revision = "v8w9x0y1z2a3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "program",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("program_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("instructions", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("program_uuid"),
    )
    op.create_index("ix_program_program_uuid", "program", ["program_uuid"])
    op.create_index("ix_program_org_id", "program", ["org_id"])
    op.create_index("ix_program_status", "program", ["status"])

    op.create_table(
        "objective",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("objective_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("kind", sa.String(), nullable=False, server_default="custom"),
        sa.Column("completion_policy", sa.String(), nullable=False, server_default="staff"),
        sa.Column("evidence_policy", sa.String(), nullable=False, server_default="none"),
        sa.Column("custom_fields", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("badge_id", sa.Integer(), sa.ForeignKey("learningbadge.id", ondelete="SET NULL"), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("objective_uuid"),
    )
    op.create_index("ix_objective_objective_uuid", "objective", ["objective_uuid"])
    op.create_index("ix_objective_org_id", "objective", ["org_id"])
    op.create_index("ix_objective_kind", "objective", ["kind"])
    op.create_index("ix_objective_badge_id", "objective", ["badge_id"])

    op.create_table(
        "programobjective",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="CASCADE"), nullable=False),
        sa.Column("objective_id", sa.Integer(), sa.ForeignKey("objective.id", ondelete="CASCADE"), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_days", sa.Integer(), nullable=True),
        sa.Column("badge_major_version", sa.Integer(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("program_id", "objective_id"),
    )
    op.create_index("ix_programobjective_program_id", "programobjective", ["program_id"])
    op.create_index("ix_programobjective_objective_id", "programobjective", ["objective_id"])

    op.create_table(
        "programassignment",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("assignment_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("program_id", sa.Integer(), sa.ForeignKey("program.id", ondelete="CASCADE"), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), sa.ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=True),
        sa.Column("program_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("objective_snapshot", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("welcome_message", sa.String(), nullable=False, server_default=""),
        sa.Column("start_date", sa.DateTime(), nullable=True),
        sa.Column("due_date", sa.DateTime(), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("assignment_uuid"),
        sa.CheckConstraint("(usergroup_id IS NOT NULL) <> (user_id IS NOT NULL)", name="ck_program_assignment_one_target"),
    )
    for column in ("assignment_uuid", "org_id", "program_id", "usergroup_id", "user_id"):
        op.create_index(f"ix_programassignment_{column}", "programassignment", [column])

    op.create_table(
        "programparticipant",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("participant_uuid", sa.String(), nullable=False),
        sa.Column("assignment_id", sa.Integer(), sa.ForeignKey("programassignment.id", ondelete="CASCADE"), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="invited"),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("participant_uuid"),
        sa.UniqueConstraint("assignment_id", "user_id"),
    )
    for column in ("participant_uuid", "assignment_id", "org_id", "user_id", "status"):
        op.create_index(f"ix_programparticipant_{column}", "programparticipant", [column])

    op.create_table(
        "objectiveprogress",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("progress_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("objective_id", sa.Integer(), sa.ForeignKey("objective.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="not_started"),
        sa.Column("evidence", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("learner_note", sa.String(), nullable=False, server_default=""),
        sa.Column("staff_note", sa.String(), nullable=False, server_default=""),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("completed_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("progress_uuid"),
        sa.UniqueConstraint("org_id", "objective_id", "user_id"),
    )
    for column in ("progress_uuid", "org_id", "objective_id", "user_id", "status"):
        op.create_index(f"ix_objectiveprogress_{column}", "objectiveprogress", [column])


def downgrade() -> None:
    op.drop_table("objectiveprogress")
    op.drop_table("programparticipant")
    op.drop_table("programassignment")
    op.drop_table("programobjective")
    op.drop_table("objective")
    op.drop_table("program")
