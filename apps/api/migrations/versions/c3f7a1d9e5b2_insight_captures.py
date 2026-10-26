"""insight captures: dashboards frozen at a moment, with a note and an optional read-only link

Revision ID: c3f7a1d9e5b2
Revises: b8e4f2a6c1d9
"""
from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3f7a1d9e5b2"
down_revision: Union[str, None] = "b8e4f2a6c1d9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "insight_capture",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("capture_uuid", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("dashboard_id", sa.Integer(), sa.ForeignKey("insight_dashboard.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rule_id", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("scope", sa.String(), nullable=False),
        sa.Column("object_key", sa.String(), nullable=True),
        sa.Column("object_label", sa.String(), nullable=False, server_default=""),
        sa.Column("range", sa.JSON(), nullable=False),
        sa.Column("note", sa.String(), nullable=False, server_default=""),
        sa.Column("captured_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("whole_org", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("learners", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cards", sa.JSON(), nullable=False),
        sa.Column("results", sa.JSON(), nullable=False),
        sa.Column("attachments", sa.JSON(), nullable=False),
        sa.Column("link_token", sa.String(), nullable=True),
        sa.Column("link_expires_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_insight_capture_capture_uuid", "insight_capture", ["capture_uuid"], unique=True)
    op.create_index("ix_insight_capture_org_id", "insight_capture", ["org_id"])
    op.create_index("ix_insight_capture_dashboard_id", "insight_capture", ["dashboard_id"])
    op.create_index("ix_insight_capture_captured_by_user_id", "insight_capture", ["captured_by_user_id"])
    op.create_index("ix_insight_capture_link_token", "insight_capture", ["link_token"], unique=True)


def downgrade() -> None:
    for name in ("link_token", "captured_by_user_id", "dashboard_id", "org_id", "capture_uuid"):
        op.drop_index(f"ix_insight_capture_{name}", table_name="insight_capture")
    op.drop_table("insight_capture")
