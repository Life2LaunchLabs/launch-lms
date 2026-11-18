"""Canvas course groups (DEV-179)

Revision ID: c4n7v5c0ur5e
Revises: c4n7v5l7i1p3
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "c4n7v5c0ur5e"
down_revision = "c4n7v5l7i1p3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canvascoursegroup",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("connection_id", sa.Integer(), sa.ForeignKey("canvasconnection.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canvas_course_id", sa.String(), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), sa.ForeignKey("usergroup.id", ondelete="CASCADE"), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("connection_id", "canvas_course_id", name="uq_canvascoursegroup_connection_course"),
        sa.UniqueConstraint("usergroup_id", name="uq_canvascoursegroup_usergroup"),
    )
    op.create_index("ix_canvascoursegroup_connection_id", "canvascoursegroup", ["connection_id"])


def downgrade() -> None:
    op.drop_table("canvascoursegroup")
