"""insight dashboards: pages of cards about the organization, a plan, a group or a learner

Revision ID: b8e4f2a6c1d9
Revises: a7d3e9b2c4f1

Starter dashboards are made the first time an organization opens Insights (``services/insights/dashboards``).
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b8e4f2a6c1d9"
down_revision: Union[str, None] = "a7d3e9b2c4f1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insight_dashboard",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("dashboard_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False, server_default=""),
        sa.Column("visibility", sa.String(), nullable=False, server_default="me"),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("document", sa.JSON(), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_template", sa.String(), nullable=True),
        sa.Column("deleted_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_insight_dashboard_dashboard_uuid", "insight_dashboard", ["dashboard_uuid"], unique=True)
    op.create_index("ix_insight_dashboard_org_id", "insight_dashboard", ["org_id"])
    op.create_index("ix_insight_dashboard_owner_user_id", "insight_dashboard", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_insight_dashboard_owner_user_id", table_name="insight_dashboard")
    op.drop_index("ix_insight_dashboard_org_id", table_name="insight_dashboard")
    op.drop_index("ix_insight_dashboard_dashboard_uuid", table_name="insight_dashboard")
    op.drop_table("insight_dashboard")
