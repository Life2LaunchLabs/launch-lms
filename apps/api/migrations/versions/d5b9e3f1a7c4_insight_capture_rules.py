"""insight capture rules: capture a dashboard weekly, monthly or once, and email it

Revision ID: d5b9e3f1a7c4
Revises: c3f7a1d9e5b2
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d5b9e3f1a7c4"
down_revision: Union[str, None] = "c3f7a1d9e5b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insight_capture_rule",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("rule_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dashboard_id", sa.Integer(), sa.ForeignKey("insight_dashboard.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("object_key", sa.String(), nullable=True),
        sa.Column("cadence", sa.String(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("on_date", sa.String(), nullable=True),
        sa.Column("range", sa.JSON(), nullable=True),
        sa.Column("note", sa.String(), nullable=False, server_default=""),
        sa.Column("staff_user_ids", sa.JSON(), nullable=False),
        sa.Column("emails", sa.JSON(), nullable=False),
        sa.Column("link_days", sa.Integer(), nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("next_run_at", sa.String(), nullable=True),
        sa.Column("last_run_at", sa.String(), nullable=True),
        sa.Column("last_error", sa.String(), nullable=False, server_default=""),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    for name, unique in (("rule_uuid", True), ("org_id", False), ("dashboard_id", False), ("owner_user_id", False), ("next_run_at", False)):
        op.create_index(f"ix_insight_capture_rule_{name}", "insight_capture_rule", [name], unique=unique)


def downgrade() -> None:
    for name in ("next_run_at", "owner_user_id", "dashboard_id", "org_id", "rule_uuid"):
        op.drop_index(f"ix_insight_capture_rule_{name}", table_name="insight_capture_rule")
    op.drop_table("insight_capture_rule")
