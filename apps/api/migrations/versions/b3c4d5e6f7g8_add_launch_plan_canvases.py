"""add launch plan canvases

Revision ID: b3c4d5e6f7g8
Revises: a2b3c4d5e6f7
Create Date: 2026-06-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c4d5e6f7g8"
down_revision: Union[str, None] = "a2b3c4d5e6f7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("resourcetag", sa.Column("managed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("resourcetag", sa.Column("managed_source", sa.String(), nullable=True))
    op.add_column("resourcetag", sa.Column("managed_source_uuid", sa.String(), nullable=True))
    op.create_index("ix_resourcetag_managed_source_uuid", "resourcetag", ["managed_source_uuid"])

    op.create_table(
        "launchplancanvasdefinition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("canvas_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("canvas_uuid"),
        sa.UniqueConstraint("org_id", "slug", name="uq_launchplan_canvas_org_slug"),
    )
    op.create_index("ix_launchplancanvasdefinition_canvas_uuid", "launchplancanvasdefinition", ["canvas_uuid"], unique=True)
    op.create_index("ix_launchplancanvasdefinition_org_id", "launchplancanvasdefinition", ["org_id"])
    op.create_index("ix_launchplancanvasdefinition_slug", "launchplancanvasdefinition", ["slug"])

    op.create_table(
        "launchplansectiondefinition",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_uuid", sa.String(), nullable=False),
        sa.Column("canvas_id", sa.Integer(), nullable=False),
        sa.Column("resource_tag_id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("explanation", sa.Text(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["canvas_id"], ["launchplancanvasdefinition.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resource_tag_id"], ["resourcetag.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("section_uuid"),
        sa.UniqueConstraint("canvas_id", "slug", name="uq_launchplan_section_canvas_slug"),
    )
    op.create_index("ix_launchplansectiondefinition_section_uuid", "launchplansectiondefinition", ["section_uuid"], unique=True)
    op.create_index("ix_launchplansectiondefinition_canvas_id", "launchplansectiondefinition", ["canvas_id"])
    op.create_index("ix_launchplansectiondefinition_resource_tag_id", "launchplansectiondefinition", ["resource_tag_id"])
    op.create_index("ix_launchplansectiondefinition_slug", "launchplansectiondefinition", ["slug"])

    op.create_table(
        "userlaunchplansection",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("org_id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("intro_seen_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["org_id"], ["organization.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["section_id"], ["launchplansectiondefinition.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "org_id", "section_id", name="uq_user_launchplan_section"),
    )
    op.create_index("ix_userlaunchplansection_user_id", "userlaunchplansection", ["user_id"])
    op.create_index("ix_userlaunchplansection_org_id", "userlaunchplansection", ["org_id"])
    op.create_index("ix_userlaunchplansection_section_id", "userlaunchplansection", ["section_id"])

    op.create_table(
        "userlaunchplancard",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("card_uuid", sa.String(), nullable=False),
        sa.Column("user_section_id", sa.Integer(), nullable=False),
        sa.Column("card_type", sa.String(), nullable=False),
        sa.Column("source_uuid", sa.String(), nullable=False),
        sa.Column("grid", sa.JSON(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False),
        sa.Column("update_date", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["user_section_id"], ["userlaunchplansection.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("card_uuid"),
        sa.UniqueConstraint("user_section_id", "card_type", "source_uuid", name="uq_user_launchplan_card_source"),
    )
    op.create_index("ix_userlaunchplancard_card_uuid", "userlaunchplancard", ["card_uuid"], unique=True)
    op.create_index("ix_userlaunchplancard_user_section_id", "userlaunchplancard", ["user_section_id"])
    op.create_index("ix_userlaunchplancard_card_type", "userlaunchplancard", ["card_type"])
    op.create_index("ix_userlaunchplancard_source_uuid", "userlaunchplancard", ["source_uuid"])


def downgrade() -> None:
    op.drop_table("userlaunchplancard")
    op.drop_table("userlaunchplansection")
    op.drop_table("launchplansectiondefinition")
    op.drop_table("launchplancanvasdefinition")
    op.drop_index("ix_resourcetag_managed_source_uuid", table_name="resourcetag")
    op.drop_column("resourcetag", "managed_source_uuid")
    op.drop_column("resourcetag", "managed_source")
    op.drop_column("resourcetag", "managed")
