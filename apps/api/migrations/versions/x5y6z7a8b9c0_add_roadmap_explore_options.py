"""add roadmap explore options

Revision ID: x5y6z7a8b9c0
Revises: w4x5y6z7a8b9
Create Date: 2026-05-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x5y6z7a8b9c0"
down_revision: Union[str, None] = "w4x5y6z7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "userroadmapendstateoption",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("option_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("end_state_type", sa.String(), server_default="occupation", nullable=False),
        sa.Column("starred", sa.Boolean(), nullable=False),
        sa.Column("skill_fit_score", sa.Integer(), nullable=True),
        sa.Column("lifestyle_fit_score", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Integer(), nullable=True),
        sa.Column("target_annual_income", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_low", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_mid", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_high", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_userroadmapendstateoption_option_uuid"), "userroadmapendstateoption", ["option_uuid"], unique=True)
    op.create_index(op.f("ix_userroadmapendstateoption_user_id"), "userroadmapendstateoption", ["user_id"], unique=False)
    op.create_index(op.f("ix_userroadmapendstateoption_org_id"), "userroadmapendstateoption", ["org_id"], unique=False)
    op.create_index(op.f("ix_userroadmapendstateoption_end_state_type"), "userroadmapendstateoption", ["end_state_type"], unique=False)

    op.create_table(
        "userroadmaptemplateevent",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("template_event_uuid", sa.String(), nullable=False),
        sa.Column("end_state_option_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(), server_default="work", nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("start_offset_months", sa.Integer(), nullable=False),
        sa.Column("duration_months", sa.Integer(), nullable=False),
        sa.Column("dependency_key", sa.String(), nullable=True),
        sa.Column("fork_group_key", sa.String(), nullable=True),
        sa.Column("optional", sa.Boolean(), nullable=False),
        sa.Column("estimated_monthly_income", sa.Float(), nullable=True),
        sa.Column("estimated_monthly_expense", sa.Float(), nullable=True),
        sa.Column("estimated_one_time_cost", sa.Float(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["end_state_option_id"], ["userroadmapendstateoption.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("end_state_option_id", "template_event_uuid", name="uq_userroadmaptemplateevent_option_uuid"),
    )
    op.create_index(op.f("ix_userroadmaptemplateevent_template_event_uuid"), "userroadmaptemplateevent", ["template_event_uuid"], unique=True)
    op.create_index(op.f("ix_userroadmaptemplateevent_end_state_option_id"), "userroadmaptemplateevent", ["end_state_option_id"], unique=False)
    op.create_index(op.f("ix_userroadmaptemplateevent_category"), "userroadmaptemplateevent", ["category"], unique=False)
    op.create_index(op.f("ix_userroadmaptemplateevent_dependency_key"), "userroadmaptemplateevent", ["dependency_key"], unique=False)
    op.create_index(op.f("ix_userroadmaptemplateevent_fork_group_key"), "userroadmaptemplateevent", ["fork_group_key"], unique=False)

    op.add_column("userroadmapoption", sa.Column("end_state_option_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_userroadmapoption_end_state_option_id",
        "userroadmapoption",
        "userroadmapendstateoption",
        ["end_state_option_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(op.f("ix_userroadmapoption_end_state_option_id"), "userroadmapoption", ["end_state_option_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_userroadmapoption_end_state_option_id"), table_name="userroadmapoption")
    op.drop_constraint("fk_userroadmapoption_end_state_option_id", "userroadmapoption", type_="foreignkey")
    op.drop_column("userroadmapoption", "end_state_option_id")
    op.drop_index(op.f("ix_userroadmaptemplateevent_fork_group_key"), table_name="userroadmaptemplateevent")
    op.drop_index(op.f("ix_userroadmaptemplateevent_dependency_key"), table_name="userroadmaptemplateevent")
    op.drop_index(op.f("ix_userroadmaptemplateevent_category"), table_name="userroadmaptemplateevent")
    op.drop_index(op.f("ix_userroadmaptemplateevent_end_state_option_id"), table_name="userroadmaptemplateevent")
    op.drop_index(op.f("ix_userroadmaptemplateevent_template_event_uuid"), table_name="userroadmaptemplateevent")
    op.drop_table("userroadmaptemplateevent")
    op.drop_index(op.f("ix_userroadmapendstateoption_end_state_type"), table_name="userroadmapendstateoption")
    op.drop_index(op.f("ix_userroadmapendstateoption_org_id"), table_name="userroadmapendstateoption")
    op.drop_index(op.f("ix_userroadmapendstateoption_user_id"), table_name="userroadmapendstateoption")
    op.drop_index(op.f("ix_userroadmapendstateoption_option_uuid"), table_name="userroadmapendstateoption")
    op.drop_table("userroadmapendstateoption")
