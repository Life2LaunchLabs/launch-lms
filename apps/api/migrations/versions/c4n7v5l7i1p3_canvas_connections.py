"""Canvas (LTI 1.3) connections and Canvas user ids (DEV-171)

Revision ID: c4n7v5l7i1p3
Revises: b1r7d4t3k3p7
Create Date: 2026-11-18
"""

import sqlalchemy as sa
from alembic import op

revision = "c4n7v5l7i1p3"
down_revision = "b1r7d4t3k3p7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canvasconnection",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canvas_host", sa.String(), nullable=False, server_default=""),
        sa.Column("issuer", sa.String(), nullable=False),
        sa.Column("client_id", sa.String(), nullable=False, server_default=""),
        sa.Column("deployment_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ages_confirmed_by", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ages_confirmed_at", sa.String(), nullable=True),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.Column("update_date", sa.String(), nullable=False, server_default=""),
    )
    op.create_index("ix_canvasconnection_org_id", "canvasconnection", ["org_id"], unique=True)
    op.create_index("ix_canvasconnection_issuer", "canvasconnection", ["issuer"])
    op.create_index("ix_canvasconnection_client_id", "canvasconnection", ["client_id"])
    op.create_table(
        "canvasuserlink",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("connection_id", sa.Integer(), sa.ForeignKey("canvasconnection.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="CASCADE"), nullable=False),
        sa.Column("canvas_user_id", sa.String(), nullable=False),
        sa.Column("creation_date", sa.String(), nullable=False, server_default=""),
        sa.UniqueConstraint("connection_id", "canvas_user_id", name="uq_canvasuserlink_connection_user"),
    )
    op.create_index("ix_canvasuserlink_connection_id", "canvasuserlink", ["connection_id"])
    op.create_index("ix_canvasuserlink_user_id", "canvasuserlink", ["user_id"])


def downgrade() -> None:
    op.drop_table("canvasuserlink")
    op.drop_table("canvasconnection")
