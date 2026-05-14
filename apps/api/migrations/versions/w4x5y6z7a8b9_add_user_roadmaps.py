"""add user roadmaps

Revision ID: w4x5y6z7a8b9
Revises: h3i4j5k6l7m8
Create Date: 2026-05-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "w4x5y6z7a8b9"
down_revision: Union[str, None] = "h3i4j5k6l7m8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "userroadmapoption",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("roadmap_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("end_state_title", sa.String(), nullable=False),
        sa.Column("end_state_type", sa.String(), server_default="occupation", nullable=False),
        sa.Column("status", sa.String(), server_default="draft", nullable=False),
        sa.Column("skill_fit_score", sa.Integer(), nullable=True),
        sa.Column("lifestyle_fit_score", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Integer(), nullable=True),
        sa.Column("target_annual_income", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_low", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_mid", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_high", sa.Float(), nullable=True),
        sa.Column("expected_monthly_living_expenses", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_userroadmapoption_roadmap_uuid"), "userroadmapoption", ["roadmap_uuid"], unique=True)
    op.create_index(op.f("ix_userroadmapoption_user_id"), "userroadmapoption", ["user_id"], unique=False)
    op.create_index(op.f("ix_userroadmapoption_org_id"), "userroadmapoption", ["org_id"], unique=False)
    op.create_index(op.f("ix_userroadmapoption_end_state_type"), "userroadmapoption", ["end_state_type"], unique=False)
    op.create_index(op.f("ix_userroadmapoption_status"), "userroadmapoption", ["status"], unique=False)

    op.create_table(
        "userroadmaprequirement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requirement_uuid", sa.String(), nullable=False),
        sa.Column("roadmap_option_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", sa.String(), server_default="education", nullable=False),
        sa.Column("requirement_group_key", sa.String(), nullable=True),
        sa.Column("requirement_logic", sa.String(), server_default="required", nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["roadmap_option_id"], ["userroadmapoption.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("roadmap_option_id", "requirement_uuid", name="uq_userroadmaprequirement_option_uuid"),
    )
    op.create_index(op.f("ix_userroadmaprequirement_requirement_uuid"), "userroadmaprequirement", ["requirement_uuid"], unique=True)
    op.create_index(op.f("ix_userroadmaprequirement_roadmap_option_id"), "userroadmaprequirement", ["roadmap_option_id"], unique=False)
    op.create_index(op.f("ix_userroadmaprequirement_category"), "userroadmaprequirement", ["category"], unique=False)
    op.create_index(op.f("ix_userroadmaprequirement_requirement_group_key"), "userroadmaprequirement", ["requirement_group_key"], unique=False)
    op.create_index(op.f("ix_userroadmaprequirement_requirement_logic"), "userroadmaprequirement", ["requirement_logic"], unique=False)

    op.create_table(
        "userroadmapevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_uuid", sa.String(), nullable=False),
        sa.Column("roadmap_option_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(), server_default="work", nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_date", sa.String(), nullable=False),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column("is_ongoing", sa.Boolean(), nullable=False),
        sa.Column("employer", sa.String(), nullable=True),
        sa.Column("institution", sa.String(), nullable=True),
        sa.Column("estimated_monthly_income", sa.Float(), nullable=True),
        sa.Column("estimated_monthly_expense", sa.Float(), nullable=True),
        sa.Column("estimated_one_time_cost", sa.Float(), nullable=True),
        sa.Column("required_step", sa.Boolean(), nullable=False),
        sa.Column("requirement_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["requirement_id"], ["userroadmaprequirement.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["roadmap_option_id"], ["userroadmapoption.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("roadmap_option_id", "event_uuid", name="uq_userroadmapevent_option_uuid"),
    )
    op.create_index(op.f("ix_userroadmapevent_event_uuid"), "userroadmapevent", ["event_uuid"], unique=True)
    op.create_index(op.f("ix_userroadmapevent_roadmap_option_id"), "userroadmapevent", ["roadmap_option_id"], unique=False)
    op.create_index(op.f("ix_userroadmapevent_category"), "userroadmapevent", ["category"], unique=False)
    op.create_index(op.f("ix_userroadmapevent_requirement_id"), "userroadmapevent", ["requirement_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_userroadmapevent_requirement_id"), table_name="userroadmapevent")
    op.drop_index(op.f("ix_userroadmapevent_category"), table_name="userroadmapevent")
    op.drop_index(op.f("ix_userroadmapevent_roadmap_option_id"), table_name="userroadmapevent")
    op.drop_index(op.f("ix_userroadmapevent_event_uuid"), table_name="userroadmapevent")
    op.drop_table("userroadmapevent")
    op.drop_index(op.f("ix_userroadmaprequirement_requirement_logic"), table_name="userroadmaprequirement")
    op.drop_index(op.f("ix_userroadmaprequirement_requirement_group_key"), table_name="userroadmaprequirement")
    op.drop_index(op.f("ix_userroadmaprequirement_category"), table_name="userroadmaprequirement")
    op.drop_index(op.f("ix_userroadmaprequirement_roadmap_option_id"), table_name="userroadmaprequirement")
    op.drop_index(op.f("ix_userroadmaprequirement_requirement_uuid"), table_name="userroadmaprequirement")
    op.drop_table("userroadmaprequirement")
    op.drop_index(op.f("ix_userroadmapoption_status"), table_name="userroadmapoption")
    op.drop_index(op.f("ix_userroadmapoption_end_state_type"), table_name="userroadmapoption")
    op.drop_index(op.f("ix_userroadmapoption_org_id"), table_name="userroadmapoption")
    op.drop_index(op.f("ix_userroadmapoption_user_id"), table_name="userroadmapoption")
    op.drop_index(op.f("ix_userroadmapoption_roadmap_uuid"), table_name="userroadmapoption")
    op.drop_table("userroadmapoption")
