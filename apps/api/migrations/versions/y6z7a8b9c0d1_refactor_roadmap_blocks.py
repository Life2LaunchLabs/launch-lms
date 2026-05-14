"""refactor roadmap to blocks and pathways

Revision ID: y6z7a8b9c0d1
Revises: x5y6z7a8b9c0
Create Date: 2026-05-14
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "y6z7a8b9c0d1"
down_revision: Union[str, None] = "x5y6z7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "roadmapblockdefinition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("block_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), nullable=True),
        sa.Column("visibility", sa.String(), server_default="user", nullable=False),
        sa.Column("lane_category", sa.String(), server_default="work", nullable=False),
        sa.Column("block_type", sa.String(), server_default="custom", nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("starred", sa.Boolean(), nullable=False),
        sa.Column("is_draft", sa.Boolean(), nullable=False),
        sa.Column("skill_fit_score", sa.Integer(), nullable=True),
        sa.Column("lifestyle_fit_score", sa.Integer(), nullable=True),
        sa.Column("confidence_score", sa.Integer(), nullable=True),
        sa.Column("target_annual_income", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_low", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_mid", sa.Float(), nullable=True),
        sa.Column("expected_annual_income_high", sa.Float(), nullable=True),
        sa.Column("default_monthly_income", sa.Float(), nullable=True),
        sa.Column("default_monthly_expense", sa.Float(), nullable=True),
        sa.Column("default_one_time_cost", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["owner_user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roadmapblockdefinition_block_uuid"), "roadmapblockdefinition", ["block_uuid"], unique=True)
    op.create_index(op.f("ix_roadmapblockdefinition_org_id"), "roadmapblockdefinition", ["org_id"])
    op.create_index(op.f("ix_roadmapblockdefinition_owner_user_id"), "roadmapblockdefinition", ["owner_user_id"])
    op.create_index(op.f("ix_roadmapblockdefinition_visibility"), "roadmapblockdefinition", ["visibility"])

    op.create_table(
        "roadmapblockrequirement",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("requirement_uuid", sa.String(), nullable=False),
        sa.Column("block_id", sa.Integer(), nullable=False),
        sa.Column("required_block_id", sa.Integer(), nullable=False),
        sa.Column("group_key", sa.String(), nullable=True),
        sa.Column("logic", sa.String(), server_default="required", nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["block_id"], ["roadmapblockdefinition.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["required_block_id"], ["roadmapblockdefinition.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("block_id", "required_block_id", "group_key", name="uq_roadmapblockrequirement_block_required_group"),
    )
    op.create_index(op.f("ix_roadmapblockrequirement_requirement_uuid"), "roadmapblockrequirement", ["requirement_uuid"], unique=True)
    op.create_index(op.f("ix_roadmapblockrequirement_block_id"), "roadmapblockrequirement", ["block_id"])
    op.create_index(op.f("ix_roadmapblockrequirement_required_block_id"), "roadmapblockrequirement", ["required_block_id"])

    op.create_table(
        "roadmappathway",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pathway_uuid", sa.String(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), server_default="draft", nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_roadmappathway_pathway_uuid"), "roadmappathway", ["pathway_uuid"], unique=True)
    op.create_index(op.f("ix_roadmappathway_user_id"), "roadmappathway", ["user_id"])
    op.create_index(op.f("ix_roadmappathway_org_id"), "roadmappathway", ["org_id"])

    op.create_table(
        "roadmappathwayblock",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("pathway_block_uuid", sa.String(), nullable=False),
        sa.Column("pathway_id", sa.Integer(), nullable=False),
        sa.Column("block_id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.String(), nullable=False),
        sa.Column("end_date", sa.String(), nullable=True),
        sa.Column("is_ongoing", sa.Boolean(), nullable=False),
        sa.Column("title_override", sa.String(), nullable=True),
        sa.Column("description_override", sa.Text(), nullable=True),
        sa.Column("monthly_income_override", sa.Float(), nullable=True),
        sa.Column("monthly_expense_override", sa.Float(), nullable=True),
        sa.Column("one_time_cost_override", sa.Float(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["block_id"], ["roadmapblockdefinition.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pathway_id"], ["roadmappathway.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("pathway_id", "pathway_block_uuid", name="uq_roadmappathwayblock_pathway_uuid"),
    )
    op.create_index(op.f("ix_roadmappathwayblock_pathway_block_uuid"), "roadmappathwayblock", ["pathway_block_uuid"], unique=True)
    op.create_index(op.f("ix_roadmappathwayblock_pathway_id"), "roadmappathwayblock", ["pathway_id"])
    op.create_index(op.f("ix_roadmappathwayblock_block_id"), "roadmappathwayblock", ["block_id"])

    op.execute(
        """
        INSERT INTO roadmapblockdefinition (
            block_uuid, org_id, owner_user_id, visibility, lane_category, block_type, title, description, starred, is_draft,
            skill_fit_score, lifestyle_fit_score, confidence_score, target_annual_income,
            expected_annual_income_low, expected_annual_income_mid, expected_annual_income_high,
            notes, creation_date, update_date
        )
        SELECT option_uuid, org_id, user_id, 'user', 'work', end_state_type, title, description, starred, false,
            skill_fit_score, lifestyle_fit_score, confidence_score, target_annual_income,
            expected_annual_income_low, expected_annual_income_mid, expected_annual_income_high,
            notes, creation_date, update_date
        FROM userroadmapendstateoption
        """
    )
    op.execute(
        """
        INSERT INTO roadmappathway (pathway_uuid, user_id, org_id, title, description, status, creation_date, update_date)
        SELECT roadmap_uuid, user_id, org_id, title, description, status, creation_date, update_date
        FROM userroadmapoption
        """
    )
    op.execute(
        """
        INSERT INTO roadmapblockdefinition (
            block_uuid, org_id, owner_user_id, visibility, lane_category, block_type, title, description, starred, is_draft,
            default_monthly_income, default_monthly_expense, default_one_time_cost, creation_date, update_date
        )
        SELECT event_uuid || '_definition', o.org_id, o.user_id, 'user', e.category,
            CASE
                WHEN e.category = 'work' THEN 'job'
                WHEN e.category = 'education' THEN 'education'
                WHEN e.category = 'life' THEN 'life'
                ELSE 'custom'
            END,
            e.title, e.description, true, false,
            e.estimated_monthly_income, e.estimated_monthly_expense, e.estimated_one_time_cost, e.creation_date, e.update_date
        FROM userroadmapevent e
        JOIN userroadmapoption o ON o.id = e.roadmap_option_id
        """
    )
    op.execute(
        """
        INSERT INTO roadmappathwayblock (
            pathway_block_uuid, pathway_id, block_id, start_date, end_date, is_ongoing,
            monthly_income_override, monthly_expense_override, one_time_cost_override,
            sort_order, creation_date, update_date
        )
        SELECT e.event_uuid, p.id, b.id, e.start_date, e.end_date, e.is_ongoing,
            e.estimated_monthly_income, e.estimated_monthly_expense, e.estimated_one_time_cost,
            e.sort_order, e.creation_date, e.update_date
        FROM userroadmapevent e
        JOIN userroadmapoption o ON o.id = e.roadmap_option_id
        JOIN roadmappathway p ON p.pathway_uuid = o.roadmap_uuid
        JOIN roadmapblockdefinition b ON b.block_uuid = e.event_uuid || '_definition'
        """
    )

    op.drop_table("userroadmapevent")
    op.drop_table("userroadmaprequirement")
    op.drop_table("userroadmapoption")
    op.drop_table("userroadmaptemplateevent")
    op.drop_table("userroadmapendstateoption")


def downgrade() -> None:
    op.drop_table("roadmappathwayblock")
    op.drop_table("roadmappathway")
    op.drop_table("roadmapblockrequirement")
    op.drop_table("roadmapblockdefinition")
