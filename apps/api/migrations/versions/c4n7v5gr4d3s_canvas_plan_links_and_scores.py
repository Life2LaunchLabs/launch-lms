"""Canvas plan links (deep linking) and the scores waiting for Canvas's gradebook (PF-4, PF-5)

Revision ID: c4n7v5gr4d3s
Revises: p0r3g0byn4m1
Create Date: 2026-11-25
"""

import sqlalchemy as sa
from alembic import op

revision = "c4n7v5gr4d3s"
down_revision = "p0r3g0byn4m1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canvasplanlink",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("connection_id", sa.Integer(), sa.ForeignKey("canvasconnection.id", ondelete="CASCADE"), nullable=False),
        sa.Column("resource_link_id", sa.String(), nullable=False),
        sa.Column("canvas_course_id", sa.String(), nullable=True),
        sa.Column("template_id", sa.Integer(), sa.ForeignKey("goal_template.id", ondelete="CASCADE"), nullable=False),
        sa.Column("lineitem_url", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("connection_id", "resource_link_id", name="uq_canvasplanlink_connection_link"),
    )
    op.create_index("ix_canvasplanlink_connection_id", "canvasplanlink", ["connection_id"])
    op.create_index("ix_canvasplanlink_template_id", "canvasplanlink", ["template_id"])
    op.create_table(
        "canvasscore",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("plan_link_id", sa.Integer(), sa.ForeignKey("canvasplanlink.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canvas_user_id", sa.String(), nullable=False),
        sa.Column("score_given", sa.Float(), nullable=False, server_default="0"),
        sa.Column("score_maximum", sa.Float(), nullable=False, server_default="100"),
        sa.Column("finished_at", sa.String(), nullable=False, server_default=""),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("next_attempt_at", sa.String(), nullable=False, server_default=""),
        sa.Column("last_error", sa.String(), nullable=True),
        sa.Column("sent_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("plan_link_id", "user_id", name="uq_canvasscore_link_user"),
    )
    op.create_index("ix_canvasscore_plan_link_id", "canvasscore", ["plan_link_id"])
    op.create_index("ix_canvasscore_user_id", "canvasscore", ["user_id"])
    op.create_index("ix_canvasscore_status", "canvasscore", ["status"])
    op.create_index("ix_canvasscore_next_attempt_at", "canvasscore", ["next_attempt_at"])


def downgrade() -> None:
    op.drop_table("canvasscore")
    op.drop_table("canvasplanlink")
