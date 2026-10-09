"""invitation batches and durable join links

Revision ID: g9h0i1j2k3l4
Revises: f8g9h0i1j2k3
"""

from alembic import op
import sqlalchemy as sa


revision = "g9h0i1j2k3l4"
down_revision = "f8g9h0i1j2k3"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("organizationinvitation", sa.Column("source", sa.String(), nullable=False, server_default="manual"))
    op.add_column("organizationinvitation", sa.Column("batch_uuid", sa.String(), nullable=True))
    op.add_column("organizationinvitation", sa.Column("revoked_at", sa.DateTime(), nullable=True))
    op.add_column("organizationinvitation", sa.Column("last_sent_at", sa.DateTime(), nullable=True))
    op.add_column("organizationinvitation", sa.Column("delivery_status", sa.String(), nullable=False, server_default="queued"))
    op.add_column("organizationinvitation", sa.Column("viewed_at", sa.DateTime(), nullable=True))
    op.add_column("organizationinvitation", sa.Column("declined_at", sa.DateTime(), nullable=True))
    op.create_index("ix_organizationinvitation_source", "organizationinvitation", ["source"])
    op.create_index("ix_organizationinvitation_batch_uuid", "organizationinvitation", ["batch_uuid"])
    op.create_index("ix_organizationinvitation_delivery_status", "organizationinvitation", ["delivery_status"])

    op.create_table(
        "organizationjoinlink",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("link_uuid", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False),
        sa.Column("org_id", sa.Integer(), sa.ForeignKey("organization.id", ondelete="CASCADE"), nullable=False),
        sa.Column("role_id", sa.Integer(), sa.ForeignKey("role.id"), nullable=False),
        sa.Column("usergroup_id", sa.Integer(), sa.ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
        sa.Column("display_name", sa.String(), nullable=True),
        sa.Column("approved_email_domain", sa.String(), nullable=True),
        sa.Column("max_redemptions", sa.Integer(), nullable=False),
        sa.Column("redemption_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("created_by_user_id", sa.Integer(), sa.ForeignKey("user.id", ondelete="SET NULL"), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_organizationjoinlink_link_uuid", "organizationjoinlink", ["link_uuid"], unique=True)
    op.create_index("ix_organizationjoinlink_token_hash", "organizationjoinlink", ["token_hash"], unique=True)
    op.create_index("ix_organizationjoinlink_org_id", "organizationjoinlink", ["org_id"])
    op.create_index("ix_organizationjoinlink_status", "organizationjoinlink", ["status"])


def downgrade() -> None:
    op.drop_table("organizationjoinlink")
    op.drop_index("ix_organizationinvitation_batch_uuid", table_name="organizationinvitation")
    op.drop_index("ix_organizationinvitation_source", table_name="organizationinvitation")
    op.drop_column("organizationinvitation", "last_sent_at")
    op.drop_column("organizationinvitation", "declined_at")
    op.drop_column("organizationinvitation", "viewed_at")
    op.drop_index("ix_organizationinvitation_delivery_status", table_name="organizationinvitation")
    op.drop_column("organizationinvitation", "delivery_status")
    op.drop_column("organizationinvitation", "revoked_at")
    op.drop_column("organizationinvitation", "batch_uuid")
    op.drop_column("organizationinvitation", "source")
