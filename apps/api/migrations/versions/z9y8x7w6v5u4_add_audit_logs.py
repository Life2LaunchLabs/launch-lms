"""add audit logs

Revision ID: z9y8x7w6v5u4
Revises: l2a3b4c5d6e7
Create Date: 2026-04-02
"""

from alembic import op
import sqlalchemy as sa


revision = "z9y8x7w6v5u4"
down_revision = "l2a3b4c5d6e7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "auditlog",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("username", sa.String(), nullable=True),
        sa.Column("name", sa.String(), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("resource", sa.String(), nullable=False),
        sa.Column("status_code", sa.Integer(), nullable=False, server_default="200"),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("metadata", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("ix_auditlog_org_id", "auditlog", ["org_id"])
    op.create_index("ix_auditlog_user_id", "auditlog", ["user_id"])
    op.create_index("ix_auditlog_action", "auditlog", ["action"])
    op.create_index("ix_auditlog_resource", "auditlog", ["resource"])
    op.create_index("ix_auditlog_status_code", "auditlog", ["status_code"])
    op.create_index("ix_auditlog_created_at", "auditlog", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_auditlog_created_at", table_name="auditlog")
    op.drop_index("ix_auditlog_status_code", table_name="auditlog")
    op.drop_index("ix_auditlog_resource", table_name="auditlog")
    op.drop_index("ix_auditlog_action", table_name="auditlog")
    op.drop_index("ix_auditlog_user_id", table_name="auditlog")
    op.drop_index("ix_auditlog_org_id", table_name="auditlog")
    op.drop_table("auditlog")
